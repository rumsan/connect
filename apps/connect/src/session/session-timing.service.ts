import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@rumsan/prisma';

export type SessionRunTrigger = 'initial' | 'retry';

export type SessionRun = {
  trigger: SessionRunTrigger;
  startedAt: string | null;
  endedAt: string | null;
};

/** Keeps a pathologically retried session from growing its row without bound. */
const MAX_RUNS = 50;

/**
 * Records when a session actually started and finished broadcasting.
 *
 * The columns describe the session's *lifetime span*:
 *
 *  - `startedAt` is first-write-wins — the first time the session ever began
 *    broadcasting, never reset. The asterisk-worker reports the moment its
 *    SessionGate went active, which for a queued session is much later than
 *    `createdAt`; the READINESS_CONFIRM fallback in LogWorker only fills the
 *    gap for transports that have no gate.
 *  - `endedAt` is last-write-wins, and is cleared back to null when the session
 *    resumes. Dispatch exhaustion (SESSION_COMPLETE) and execution completion
 *    (status -> COMPLETED) can fire apart, so whichever lands last wins.
 *
 * `stats.runs` then keeps the per-run detail the two columns cannot hold, so an
 * explicit retry does not erase the previous run. Note that only an explicit
 * retry opens a new run — Twilio batching rounds, voice batch cycling and
 * crash-recovery replays all resume the run already in progress.
 */
@Injectable()
export class SessionTimingService {
  private readonly logger = new Logger(SessionTimingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async markStarted(sessionCuid: string, at: Date) {
    try {
      // updateMany so `startedAt: null` can sit in the where clause, and so a
      // missing session is a no-op rather than a throw.
      await this.prisma.session.updateMany({
        where: { cuid: sessionCuid, startedAt: null },
        data: { startedAt: at },
      });
    } catch (error) {
      this.logger.error(`markStarted failed for session ${sessionCuid}`, error);
    }

    // Separate try/catch so a stats failure cannot cost us the column write.
    try {
      await this._mutateRuns(sessionCuid, (runs) => {
        const last = runs[runs.length - 1];

        // No history yet — this is the session's first run.
        if (!last) {
          return [
            { trigger: 'initial', startedAt: at.toISOString(), endedAt: null },
          ];
        }

        // A retry opened a run but the transport had not reported in yet; this
        // is the moment it actually started. The gap between the two is the
        // worker's queue time, which is the whole point of the feature.
        if (last.endedAt === null && last.startedAt === null) {
          runs[runs.length - 1] = { ...last, startedAt: at.toISOString() };
          return runs;
        }

        // Already running (the voice batch loop re-confirms readiness many
        // times per run), or the last run is closed and no retry opened a new
        // one. Either way there is nothing to record.
        return null;
      });
    } catch (error) {
      this.logger.error(
        `markStarted run history failed for session ${sessionCuid}`,
        error,
      );
    }
  }

  async markEnded(sessionCuid: string, at: Date, client?: PrismaService) {
    try {
      await (client ?? this.prisma).session.updateMany({
        where: { cuid: sessionCuid },
        data: { endedAt: at },
      });
    } catch (error) {
      this.logger.error(`markEnded failed for session ${sessionCuid}`, error);
    }

    await this.closeLastRun(sessionCuid, at, client);
  }

  /** Opens a new run. `startedAt` stays null until the transport reports in. */
  async openRun(
    sessionCuid: string,
    trigger: SessionRunTrigger,
    startedAt: Date | null = null,
    client?: PrismaService,
  ) {
    try {
      await this._mutateRuns(
        sessionCuid,
        (runs) => [
          ...runs,
          {
            trigger,
            startedAt: startedAt ? startedAt.toISOString() : null,
            endedAt: null,
          },
        ],
        client,
      );
    } catch (error) {
      this.logger.error(`openRun failed for session ${sessionCuid}`, error);
    }
  }

  async closeLastRun(sessionCuid: string, at: Date, client?: PrismaService) {
    try {
      await this._mutateRuns(
        sessionCuid,
        (runs) => {
          const last = runs[runs.length - 1];
          if (!last) return null;
          runs[runs.length - 1] = { ...last, endedAt: at.toISOString() };
          return runs;
        },
        client,
      );
    } catch (error) {
      this.logger.error(`closeLastRun failed for session ${sessionCuid}`, error);
    }
  }

  /**
   * Read-modify-write of `stats.runs`.
   *
   * When `client` is given the caller already has a transaction open (and, at
   * every current call site, has already written this session row, so it holds
   * the lock). Reusing it is not just an optimisation — opening our own
   * transaction and taking `FOR UPDATE` on a row the outer transaction has
   * locked would deadlock.
   */
  private async _mutateRuns(
    sessionCuid: string,
    mutate: (runs: SessionRun[]) => SessionRun[] | null,
    client?: PrismaService,
  ) {
    if (client) {
      const session = await client.session.findUnique({
        where: { cuid: sessionCuid },
        select: { stats: true },
      });
      if (!session) return;
      await this._writeRuns(client, sessionCuid, session.stats, mutate);
      return;
    }

    await this.prisma.$transaction(async (tx: PrismaService) => {
      const rows = await tx.$queryRaw<{ stats: unknown }[]>`
        SELECT stats FROM tbl_sessions WHERE cuid = ${sessionCuid} FOR UPDATE
      `;
      if (rows.length === 0) return;
      await this._writeRuns(tx, sessionCuid, rows[0].stats, mutate);
    });
  }

  private async _writeRuns(
    client: PrismaService,
    sessionCuid: string,
    rawStats: unknown,
    mutate: (runs: SessionRun[]) => SessionRun[] | null,
  ) {
    const stats = (rawStats as Record<string, unknown>) ?? {};
    const runs = Array.isArray(stats.runs) ? ([...stats.runs] as SessionRun[]) : [];

    const next = mutate(runs);
    if (!next) return;

    await client.session.update({
      where: { cuid: sessionCuid },
      data: { stats: { ...stats, runs: next.slice(-MAX_RUNS) } },
    });
  }
}
