import { Injectable, Logger } from '@nestjs/common';
import { QueueWorkerHeartbeat } from '@rumsan/connect/types';
import { BROADCAST_CONSTANTS } from '../broadcast/broadcast.constants';

export interface WorkerState extends QueueWorkerHeartbeat {
  lastSeenAt: number;
}

/**
 * Roster of transport workers, built entirely from the heartbeats workers
 * publish on `rsconnect.to.connect`. There is no registration step and no
 * roster config: a worker appears when it starts heartbeating and disappears
 * when it stops.
 *
 * State is in-process, which is safe because connect runs as a single replica.
 * If that ever changes, back this with a table behind the same interface — the
 * consequences of a stale roster are bounded (see `live()`).
 */
@Injectable()
export class WorkerRegistry {
  private readonly logger = new Logger(WorkerRegistry.name);
  private readonly workers = new Map<string, WorkerState>();

  private readonly heartbeatMs =
    +(process.env['WORKER_HEARTBEAT_MS'] as string) || 15_000;

  private get staleAfterMs() {
    return this.heartbeatMs * BROADCAST_CONSTANTS.WORKER_STALE_HEARTBEATS;
  }

  record(heartbeat: QueueWorkerHeartbeat) {
    const known = this.workers.has(heartbeat.workerId);
    this.workers.set(heartbeat.workerId, {
      ...heartbeat,
      lastSeenAt: Date.now(),
    });
    if (!known) {
      this.logger.log(
        `Worker joined: ${heartbeat.workerId} (${heartbeat.transport}, priority=${heartbeat.priority}, capacity=${heartbeat.capacity})`,
      );
    }
  }

  /**
   * Live workers for a transport, ordered the way work should be filled:
   * priority first, then workerId so the order is stable across restarts.
   */
  live(transport: string): WorkerState[] {
    const cutoff = Date.now() - this.staleAfterMs;
    const alive: WorkerState[] = [];

    for (const [workerId, state] of this.workers.entries()) {
      if (state.lastSeenAt < cutoff) {
        this.workers.delete(workerId);
        this.logger.warn(
          `Worker ${workerId} went stale (last seen ${new Date(
            state.lastSeenAt,
          ).toISOString()})`,
        );
        continue;
      }
      if (state.transport === transport) alive.push(state);
    }

    return alive.sort(
      (a, b) => a.priority - b.priority || a.workerId.localeCompare(b.workerId),
    );
  }

  /**
   * Workers free to take on a session. A worker already holding a session is
   * excluded — its SessionGate would queue the work behind whatever it is
   * doing, which is the opposite of what assignment is trying to achieve.
   */
  idle(transport: string): WorkerState[] {
    return this.live(transport).filter((w) => !w.activeSessionCuid);
  }

  get(workerId: string): WorkerState | undefined {
    return this.workers.get(workerId);
  }

  /** Whole roster, for the ops endpoint. */
  all(): WorkerState[] {
    const cutoff = Date.now() - this.staleAfterMs;
    return [...this.workers.values()]
      .filter((w) => w.lastSeenAt >= cutoff)
      .sort(
        (a, b) =>
          a.transport.localeCompare(b.transport) ||
          a.priority - b.priority ||
          a.workerId.localeCompare(b.workerId),
      );
  }
}
