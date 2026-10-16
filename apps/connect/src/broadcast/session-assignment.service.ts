import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TransportQueue } from '@rsconnect/queue';
import { QUEUES, TRANSPORT_SLUG } from '@rumsan/connect';
import {
  BroadcastStatus,
  SessionStatus,
  TransportType,
} from '@rumsan/connect/types';
import { PrismaService } from '@rumsan/prisma';
import {
  WorkerRegistry,
  WorkerState,
} from '../workers/worker-registry.service';
import { BROADCAST_CONSTANTS } from './broadcast.constants';

/** Transports whose workers take part in multi-worker assignment. */
const MULTI_WORKER_TRANSPORTS: Partial<Record<TransportType, TRANSPORT_SLUG>> =
  {
    [TransportType.VOICE]: TRANSPORT_SLUG.VOICE,
  };

/** Why one live worker was or was not put on a session — for logging only. */
export type SelectionTrace = {
  workerId: string;
  chosen: boolean;
  reason: string;
};

/** A worker's hold on one session, from READINESS_CHECK to SESSION_COMPLETE. */
type Reservation = { sessionCuid: string; reservedAt: number };

const QUEUE_BY_SLUG: Record<string, QUEUES> = {
  [TRANSPORT_SLUG.VOICE]: QUEUES.TRANSPORT_VOICE,
  [TRANSPORT_SLUG.API]: QUEUES.TRANSPORT_API,
  [TRANSPORT_SLUG.SMTP]: QUEUES.TRANSPORT_SMTP,
  [TRANSPORT_SLUG.ECHO]: QUEUES.TRANSPORT_ECHO,
};

/**
 * Decides which workers run a session.
 *
 * The rule is fill-then-spill: hand the session to the highest-priority worker
 * and only bring in the next one when the addresses still waiting exceed what
 * the assigned workers can hold at once. A session that fits inside the primary
 * never wakes a second box, which matters because waking one costs an audio
 * upload and a readiness wait on that Asterisk.
 *
 * Once assigned, workers pull independently — whoever drains its batch first
 * claims the next one, so throughput follows real capacity rather than a fixed
 * split.
 *
 * A worker holds **one session at a time**. Connect enforces that here with a
 * reservation per worker rather than trusting heartbeats, which can be a full
 * WORKER_HEARTBEAT_MS stale: two sessions started together would otherwise
 * both see the primary as idle, and the second would queue behind the first
 * in its SessionGate while a lower-priority worker sat unused. A session with
 * no free worker waits here, oldest first, and `assignWaiting` hands it the
 * next worker that frees up.
 */
@Injectable()
export class SessionAssignmentService implements OnModuleInit {
  private readonly logger = new Logger(SessionAssignmentService.name);

  /**
   * workerId → the session it holds. Set when connect sends a READINESS_CHECK,
   * cleared when it sends that worker SESSION_COMPLETE (or the worker is
   * gone). In-process like the registry; rebuilt from live claims on boot.
   */
  private readonly reservations = new Map<string, Reservation>();

  /**
   * When each worker was last released. A heartbeat older than this still
   * names the session the worker just finished, so it must not make the
   * worker look busy.
   */
  private readonly releasedAt = new Map<string, number>();

  /**
   * Serializes assignment. Reading who is free and reserving them has to be
   * one step, or two sessions triggered in the same tick pick the same worker.
   */
  private lock: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    private readonly transportQueue: TransportQueue,
    private readonly registry: WorkerRegistry,
  ) {}

  async onModuleInit() {
    await this.restoreReservations().catch((err) =>
      this.logger.error('Failed to restore worker reservations', err),
    );
  }

  /**
   * A connect restart loses the in-memory map while workers are still dialling.
   * Any worker owning a live claim is still on that session.
   */
  async restoreReservations() {
    const rows = await this.prisma.broadcast.findMany({
      where: {
        status: BroadcastStatus.PENDING,
        isComplete: false,
        workerId: { not: null },
      },
      distinct: ['workerId'],
      select: { workerId: true, session: true },
    });

    for (const { workerId, session } of rows) {
      if (!workerId || this.reservations.has(workerId)) continue;
      this.reservations.set(workerId, {
        sessionCuid: session,
        reservedAt: Date.now(),
      });
    }

    if (rows.length) {
      this.logger.log(
        `Restored ${this.reservations.size} worker reservation(s) from live claims`,
      );
    }
  }

  private get spilloverMin() {
    return (
      Number(process.env.BROADCAST_SPILLOVER_MIN) ||
      BROADCAST_CONSTANTS.DEFAULT_SPILLOVER_MIN
    );
  }

  private get reservationGraceMs() {
    return (
      Number(process.env.WORKER_RESERVATION_GRACE_MS) ||
      BROADCAST_CONSTANTS.DEFAULT_RESERVATION_GRACE_MS
    );
  }

  private get maxSessionAgeMs(): number {
    return (
      Number(process.env.BROADCAST_MAX_SESSION_AGE_MS) ||
      BROADCAST_CONSTANTS.DEFAULT_MAX_SESSION_AGE_MS
    );
  }

  /** VOICE today; other transports keep their single shared queue. */
  transportSlug(transportType: TransportType): TRANSPORT_SLUG | undefined {
    return MULTI_WORKER_TRANSPORTS[transportType];
  }

  isMultiWorker(transportType: TransportType): boolean {
    return !!this.transportSlug(transportType);
  }

  /**
   * Walk candidates in priority order, taking each until the accumulated
   * capacity covers what is waiting. Pure and side-effect free so the policy
   * can be tested directly.
   *
   * Pass `trace` to collect a per-candidate reason. Once either guard trips it
   * can never untrip — `capacity` only grows and `remaining` is fixed — so
   * continuing rather than breaking records a reason for every candidate
   * without changing which ones are chosen.
   */
  selectWorkers(
    remaining: number,
    candidates: WorkerState[],
    trace?: SelectionTrace[],
  ): WorkerState[] {
    const chosen: WorkerState[] = [];
    let capacity = 0;

    for (const worker of candidates) {
      if (capacity >= remaining) {
        trace?.push({
          workerId: worker.workerId,
          chosen: false,
          reason: `capacity already covered (${capacity} >= ${remaining} remaining)`,
        });
        continue;
      }
      if (remaining - capacity < this.spilloverMin) {
        trace?.push({
          workerId: worker.workerId,
          chosen: false,
          reason: `overflow ${remaining - capacity} < BROADCAST_SPILLOVER_MIN ${
            this.spilloverMin
          }`,
        });
        continue;
      }
      chosen.push(worker);
      capacity += worker.capacity;
      trace?.push({
        workerId: worker.workerId,
        chosen: true,
        reason: `chosen (capacity ${capacity}/${remaining})`,
      });
    }

    return chosen;
  }

  /**
   * Ensure enough workers are on this session, assigning more only when the
   * ones already on it cannot absorb what is left. Safe to call repeatedly —
   * it is the same code path for session start and for mid-session top-up.
   */
  ensureAssignment(
    sessionCuid: string,
    transportType: TransportType,
  ): Promise<string[]> {
    const run = this.lock.then(() =>
      this._ensureAssignment(sessionCuid, transportType),
    );
    // Keep the chain alive past a failure; the caller still sees the error.
    this.lock = run.catch(() => undefined);
    return run;
  }

  private async _ensureAssignment(
    sessionCuid: string,
    transportType: TransportType,
  ): Promise<string[]> {
    const slug = this.transportSlug(transportType);
    if (!slug) return [];

    // One live() pass: it prunes stale entries as it iterates.
    const live = this.registry.live(slug);
    this.pruneReservations(live);

    const remaining = await this.countRemaining(sessionCuid);
    if (remaining === 0) {
      this.logger.debug(
        `session ${sessionCuid}: nothing scheduled left to assign`,
      );
      return [];
    }

    const assigned = this.assignedWorkers(sessionCuid);
    const headroom = await this.headroom(live, assigned);
    const shortfall = remaining - headroom;

    if (assigned.size > 0 && shortfall < this.spilloverMin) {
      // Whoever is already on the session can absorb the rest.
      this.logger.debug(
        `session ${sessionCuid}: ${remaining} remaining absorbed by [${[
          ...assigned,
        ].join(', ')}] (headroom=${headroom}) — no new worker needed`,
      );
      return [];
    }

    const candidates = live.filter((w) => this.isFree(w));

    const trace: SelectionTrace[] = [];
    const chosen = candidates.length
      ? this.selectWorkers(
          assigned.size === 0 ? remaining : shortfall,
          candidates,
          trace,
        )
      : [];

    for (const w of live) {
      if (assigned.has(w.workerId)) {
        trace.push({
          workerId: w.workerId,
          chosen: false,
          reason: 'already on this session',
        });
      } else if (!this.isFree(w)) {
        trace.push({
          workerId: w.workerId,
          chosen: false,
          reason: `busy with session ${
            this.reservations.get(w.workerId)?.sessionCuid ??
            w.activeSessionCuid ??
            '(queued)'
          }`,
        });
      }
    }

    this.logSelection(sessionCuid, {
      remaining,
      headroom,
      shortfall,
      live,
      trace,
    });

    if (candidates.length === 0) {
      if (assigned.size === 0) {
        this.logger.log(
          `session ${sessionCuid}: every ${slug} worker holds another session — waiting at connect (${remaining} remaining) until one frees up`,
        );
      }
      return [];
    }

    if (chosen.length === 0) return [];

    const queue = QUEUE_BY_SLUG[slug];
    const newlyAssigned: string[] = [];

    for (const worker of chosen) {
      const ok = await this.transportQueue.checkReadiness({
        transportToCheck: queue,
        sessionCuid,
        workerId: worker.workerId,
      });
      if (!ok) {
        this.logger.error(
          `Failed to send READINESS_CHECK to ${worker.workerId} for session ${sessionCuid}`,
        );
        continue;
      }
      this.reserve(sessionCuid, worker.workerId);
      newlyAssigned.push(worker.workerId);
    }

    if (newlyAssigned.length) {
      this.logger.log(
        `Assigned [${newlyAssigned.join(
          ', ',
        )}] to session ${sessionCuid} (remaining=${remaining}, headroom=${headroom})`,
      );
    }

    return newlyAssigned;
  }

  /**
   * Explains an assignment decision. Promoted to `log` only when a live worker
   * was passed over — that is the case worth reading. Otherwise `debug`, since
   * this also runs after every batch handout.
   */
  private logSelection(
    sessionCuid: string,
    ctx: {
      remaining: number;
      headroom: number;
      shortfall: number;
      live: WorkerState[];
      trace: SelectionTrace[];
    },
  ) {
    const { remaining, headroom, shortfall, live, trace } = ctx;

    if (live.length === 0) {
      this.logger.warn(
        `session ${sessionCuid}: ${remaining} scheduled but the roster is empty — no worker has heartbeated within ${
          this.registry.staleAfterMs / 1000
        }s`,
      );
      return;
    }

    const byId = new Map(live.map((w) => [w.workerId, w]));
    const lines = trace.map((t) => {
      const w = byId.get(t.workerId);
      return `  ${t.workerId} p=${w?.priority} cap=${w?.capacity} -> ${
        t.chosen ? 'CHOSEN' : 'skipped'
      }: ${t.reason}`;
    });

    const message = [
      `session ${sessionCuid}: ${remaining} scheduled, headroom=${headroom}, shortfall=${shortfall}, spilloverMin=${this.spilloverMin}, ${live.length} live`,
      ...lines,
    ].join('\n');

    if (trace.some((t) => !t.chosen)) {
      this.logger.log(message);
    } else {
      this.logger.debug(message);
    }
  }

  /**
   * Assign workers to every in-progress session that is short of them, oldest
   * first, sessions with nobody on them ahead of mid-session top-ups. Runs
   * whenever a worker frees up, and on the reclaim sweeper's tick as a
   * backstop.
   *
   * Age-limited by `BROADCAST_MAX_SESSION_AGE_MS`: dialling someone about a
   * day-old broadcast is worse than not dialling at all. Older sessions are
   * skipped, never modified — an explicit `GET /sessions/:cuid/trigger` still
   * assigns them, because retryBroadcasts calls ensureAssignment directly.
   */
  async assignWaiting() {
    const cutoff = new Date(Date.now() - this.maxSessionAgeMs);
    const stalled = {
      status: SessionStatus.PENDING,
      Broadcasts: {
        some: {
          status: BroadcastStatus.SCHEDULED,
          isComplete: false,
        },
      },
    };

    // Skipped sessions stay PENDING with work outstanding, so surface the
    // backlog rather than leaving it invisible.
    const skipped = await this.prisma.session.count({
      where: { ...stalled, createdAt: { lt: cutoff } },
    });
    if (skipped > 0) {
      this.logger.debug(
        `assignment sweep skipped ${skipped} session(s) older than ${this.maxSessionAgeMs}ms (explicit retry still works)`,
      );
    }

    const sessions = await this.prisma.session.findMany({
      where: { ...stalled, createdAt: { gte: cutoff } },
      include: { Transport: true },
      orderBy: { createdAt: 'asc' },
      take: BROADCAST_CONSTANTS.RECLAIM_SESSION_SCAN_LIMIT,
    });

    // Stable sort: waiting sessions keep their age order but go before
    // sessions that already have a worker and only want more.
    const ordered = [...sessions].sort(
      (a, b) =>
        Number(this.assignedWorkers(a.cuid).size > 0) -
        Number(this.assignedWorkers(b.cuid).size > 0),
    );

    for (const session of ordered) {
      const transportType = session.Transport.type as TransportType;
      if (!this.isMultiWorker(transportType)) continue;

      await this.ensureAssignment(session.cuid, transportType).catch((err) =>
        this.logger.error(
          `Assignment failed for waiting session ${session.cuid}`,
          err,
        ),
      );
    }
  }

  /** Workers currently holding this session. */
  assignedWorkers(sessionCuid: string): Set<string> {
    const assigned = new Set<string>();
    for (const [workerId, r] of this.reservations) {
      if (r.sessionCuid === sessionCuid) assigned.add(workerId);
    }
    return assigned;
  }

  /** Session a worker holds, if any. */
  reservationOf(workerId: string): string | undefined {
    return this.reservations.get(workerId)?.sessionCuid;
  }

  /**
   * A worker is free when connect has not reserved it and its own heartbeat
   * agrees. The heartbeat check covers a connect restart; a heartbeat sent
   * before we released the worker is ignored, since it still names the
   * session the worker just finished.
   */
  private isFree(w: WorkerState): boolean {
    if (this.reservations.has(w.workerId)) return false;
    const released = this.releasedAt.get(w.workerId) ?? 0;
    if (w.lastSeenAt <= released) return true;
    return !w.activeSessionCuid && !w.queuedSessions;
  }

  private reserve(sessionCuid: string, workerId: string) {
    this.reservations.set(workerId, { sessionCuid, reservedAt: Date.now() });
    this.releasedAt.delete(workerId);
  }

  /**
   * Called when connect sends this worker SESSION_COMPLETE. Only releases a
   * reservation for that session, so a late message can't free a worker that
   * has already moved on.
   */
  release(workerId: string, sessionCuid: string) {
    if (this.reservations.get(workerId)?.sessionCuid !== sessionCuid) return;
    this.reservations.delete(workerId);
    this.releasedAt.set(workerId, Date.now());
    this.logger.log(`Worker ${workerId} released from session ${sessionCuid}`);
  }

  /**
   * Drop reservations whose worker is gone, or whose worker has reported for a
   * while that it is not on the session (readiness failed, or its gate timed
   * out). Without this a worker that never got SESSION_COMPLETE would be
   * unassignable for good.
   */
  private pruneReservations(live: WorkerState[]) {
    const byId = new Map(live.map((w) => [w.workerId, w]));
    const now = Date.now();

    for (const [workerId, r] of this.reservations) {
      const w = byId.get(workerId);

      let reason: string | undefined;
      if (!w) {
        // live() is per transport, but it prunes stale workers of every
        // transport, so the registry no longer knowing it means it is gone.
        if (this.registry.get(workerId)) continue;
        reason = 'worker is gone';
      } else if (
        now - r.reservedAt > this.reservationGraceMs &&
        w.lastSeenAt > r.reservedAt + this.reservationGraceMs &&
        w.activeSessionCuid !== r.sessionCuid &&
        !w.queuedSessions
      ) {
        reason = `worker reports ${w.activeSessionCuid ?? 'no session'}`;
      }

      if (reason) {
        this.reservations.delete(workerId);
        this.releasedAt.set(workerId, now);
        this.logger.warn(
          `Dropped ${workerId}'s reservation on session ${r.sessionCuid}: ${reason}`,
        );
      }
    }
  }

  /**
   * Free capacity across the assigned workers. A worker that has gone stale
   * contributes nothing, so its share of the session shows up as shortfall and
   * gets covered by someone else.
   */
  private async headroom(
    live: WorkerState[],
    assigned: Set<string>,
  ): Promise<number> {
    if (assigned.size === 0) return 0;

    const byId = new Map(live.map((w) => [w.workerId, w]));
    let headroom = 0;

    for (const workerId of assigned) {
      const worker = byId.get(workerId);
      if (!worker) continue;
      const inFlight = await this.prisma.broadcast.count({
        where: {
          workerId,
          status: BroadcastStatus.PENDING,
          isComplete: false,
        },
      });
      headroom += Math.max(0, worker.capacity - inFlight);
    }

    return headroom;
  }

  private countRemaining(sessionCuid: string) {
    return this.prisma.broadcast.count({
      where: {
        session: sessionCuid,
        status: BroadcastStatus.SCHEDULED,
        isComplete: false,
      },
    });
  }

  /** Per-worker breakdown of a session, for the ops endpoint and runbook. */
  async sessionWorkerBreakdown(sessionCuid: string) {
    const rows = await this.prisma.broadcast.groupBy({
      by: ['workerId', 'status'],
      where: { session: sessionCuid },
      _count: { _all: true },
    });

    const byWorker = new Map<string, Record<string, number>>();
    for (const row of rows) {
      const key = row.workerId ?? 'unclaimed';
      const counts = byWorker.get(key) ?? {};
      counts[row.status] = row._count._all;
      byWorker.set(key, counts);
    }

    return [...byWorker.entries()].map(([workerId, statusCounts]) => ({
      workerId,
      statusCounts,
      total: Object.values(statusCounts).reduce((a, b) => a + b, 0),
      live: workerId === 'unclaimed' ? null : !!this.registry.get(workerId),
    }));
  }
}
