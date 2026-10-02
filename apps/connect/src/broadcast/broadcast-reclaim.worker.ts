import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { createId } from '@paralleldrive/cuid2';
import {
  BroadcastStatus,
  TransportType,
} from '@rumsan/connect/types';
import { PrismaService } from '@rumsan/prisma';
import { BroadcastService } from './broadcast.service';
import { BROADCAST_CONSTANTS } from './broadcast.constants';
import { SessionAssignmentService } from './session-assignment.service';

/**
 * Hands back broadcasts owned by a worker that never reported on them.
 *
 * Each worker reaps its own stuck calls in memory, but that reaper dies with
 * the process. Without this sweeper, a worker killed mid-batch leaves its rows
 * PENDING forever and the session never completes — the more of the session a
 * worker held, the worse it is.
 *
 * The TTL deliberately sits well above the worker-side BATCH_TTL_MS so a live
 * worker always gets the first chance to report a real failure; anything still
 * claimed after that is treated as a lost worker.
 */
@Injectable()
export class BroadcastReclaimWorker {
  private readonly logger = new Logger(BroadcastReclaimWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly broadcastService: BroadcastService,
    private readonly sessionAssignment: SessionAssignmentService,
  ) {}

  private get claimTtlMs(): number {
    return (
      Number(process.env.BROADCAST_CLAIM_TTL_MS) ||
      BROADCAST_CONSTANTS.DEFAULT_CLAIM_TTL_MS
    );
  }

  /**
   * Backstop for sessions short of workers: every worker was busy when the
   * session started, or one died. Workers freeing up normally trigger this
   * immediately (see BroadcastService.sendBroadcasts); the tick covers the
   * rest — a worker that aged out, or a reservation dropped by the grace rule.
   * The query, ordering and age limit live in SessionAssignmentService.
   */
  @Interval(BROADCAST_CONSTANTS.RECLAIM_WORKER_INTERVAL_MS)
  async assignStalledSessions() {
    try {
      await this.sessionAssignment.assignWaiting();
    } catch (err) {
      this.logger.error('Assignment sweep failed', err);
    }
  }

  @Interval(BROADCAST_CONSTANTS.RECLAIM_WORKER_INTERVAL_MS)
  async reclaimStaleClaims() {
    try {
      const cutoff = new Date(Date.now() - this.claimTtlMs);

      const stale = await this.prisma.broadcast.findMany({
        where: {
          status: BroadcastStatus.PENDING,
          isComplete: false,
          claimedAt: { lt: cutoff },
        },
        select: {
          cuid: true,
          app: true,
          session: true,
          workerId: true,
          attempts: true,
          maxAttempts: true,
        },
      });

      if (stale.length === 0) return;

      const exhausted = stale.filter((b) => b.attempts >= b.maxAttempts);
      const retryable = stale.filter((b) => b.attempts < b.maxAttempts);

      this.logger.warn(
        `Reclaiming ${stale.length} stale broadcast(s): ${retryable.length} rescheduled, ${exhausted.length} failed`,
      );

      if (exhausted.length > 0) await this.failExhausted(exhausted);
      if (retryable.length > 0) await this.reschedule(retryable);

      await this.reassignAffectedSessions(
        [...new Set(stale.map((b) => b.session))],
        retryable.length > 0,
        [...new Set(exhausted.map((b) => b.session))],
      );
    } catch (err) {
      this.logger.error('Reclaim sweep failed', err);
    }
  }

  /**
   * Out of attempts and nobody left to report on them — close them out so the
   * session can reach COMPLETED instead of hanging on a dead worker.
   */
  private async failExhausted(
    broadcasts: {
      cuid: string;
      app: string;
      session: string;
      workerId: string | null;
      attempts: number;
    }[],
  ) {
    const disposition = {
      error: 'Worker stopped responding while holding this broadcast.',
      errorTag: 'WORKER_LOST',
    };

    await this.prisma.$transaction([
      this.prisma.broadcast.updateMany({
        where: { cuid: { in: broadcasts.map((b) => b.cuid) } },
        data: {
          status: BroadcastStatus.FAIL,
          isComplete: true,
          disposition,
        },
      }),
      this.prisma.broadcastLog.createMany({
        data: broadcasts.map((b) => ({
          cuid: createId(),
          broadcast: b.cuid,
          session: b.session,
          app: b.app,
          status: BroadcastStatus.FAIL,
          attempt: b.attempts,
          details: { ...disposition, workerId: b.workerId },
        })),
      }),
    ]);
  }

  /** Release ownership so any live worker can claim these again. */
  private async reschedule(broadcasts: { cuid: string }[]) {
    await this.prisma.broadcast.updateMany({
      where: { cuid: { in: broadcasts.map((b) => b.cuid) } },
      data: {
        status: BroadcastStatus.SCHEDULED,
        workerId: null,
        claimedAt: null,
      },
    });
  }

  private async reassignAffectedSessions(
    sessionCuids: string[],
    hasRescheduled: boolean,
    completedSessionCuids: string[],
  ) {
    for (const sessionCuid of sessionCuids) {
      const session = await this.prisma.session.findUnique({
        where: { cuid: sessionCuid },
        include: { Transport: true },
      });
      if (!session) continue;

      // Whatever we just failed may have been the last outstanding broadcast.
      if (completedSessionCuids.includes(sessionCuid)) {
        await this.broadcastService
          .syncSessionCompletion(sessionCuid)
          .catch((err) =>
            this.logger.error(
              `syncSessionCompletion failed for ${sessionCuid}`,
              err,
            ),
          );
      }

      if (!hasRescheduled) continue;

      // The lost worker has aged out of the registry by now, so its
      // reservation is dropped and this picks the next free worker.
      await this.sessionAssignment
        .ensureAssignment(sessionCuid, session.Transport.type as TransportType)
        .catch((err) =>
          this.logger.error(
            `Reassignment failed for session ${sessionCuid}`,
            err,
          ),
        );
    }
  }
}
