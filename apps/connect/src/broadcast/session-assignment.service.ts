import { Injectable, Logger } from '@nestjs/common';
import { TransportQueue } from '@rsconnect/queue';
import { QUEUES, TRANSPORT_SLUG } from '@rumsan/connect';
import { BroadcastStatus, TransportType } from '@rumsan/connect/types';
import { PrismaService } from '@rumsan/prisma';
import { WorkerRegistry, WorkerState } from '../workers/worker-registry.service';
import { BROADCAST_CONSTANTS } from './broadcast.constants';

/** Transports whose workers take part in multi-worker assignment. */
const MULTI_WORKER_TRANSPORTS: Partial<Record<TransportType, TRANSPORT_SLUG>> = {
  [TransportType.VOICE]: TRANSPORT_SLUG.VOICE,
};

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
 */
@Injectable()
export class SessionAssignmentService {
  private readonly logger = new Logger(SessionAssignmentService.name);

  /**
   * Workers we have sent a READINESS_CHECK that have not claimed anything yet.
   * The DB (`DISTINCT workerId`) is the authoritative set; this only covers the
   * window before a worker's first claim. Losing it risks assigning one extra
   * worker, never losing work.
   */
  private readonly pendingAssignments = new Map<string, Set<string>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly transportQueue: TransportQueue,
    private readonly registry: WorkerRegistry,
  ) {}

  private get spilloverMin() {
    return (
      Number(process.env.BROADCAST_SPILLOVER_MIN) ||
      BROADCAST_CONSTANTS.DEFAULT_SPILLOVER_MIN
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
   */
  selectWorkers(remaining: number, candidates: WorkerState[]): WorkerState[] {
    const chosen: WorkerState[] = [];
    let capacity = 0;

    for (const worker of candidates) {
      if (capacity >= remaining) break;
      if (remaining - capacity < this.spilloverMin) break;
      chosen.push(worker);
      capacity += worker.capacity;
    }

    return chosen;
  }

  /**
   * Ensure enough workers are on this session, assigning more only when the
   * ones already on it cannot absorb what is left. Safe to call repeatedly —
   * it is the same code path for session start and for mid-session top-up.
   */
  async ensureAssignment(sessionCuid: string, transportType: TransportType) {
    const slug = this.transportSlug(transportType);
    if (!slug) return [];

    const remaining = await this.countRemaining(sessionCuid);
    if (remaining === 0) return [];

    const assigned = await this.assignedWorkers(sessionCuid);
    const headroom = await this.headroom(slug, assigned);
    const shortfall = remaining - headroom;

    if (assigned.size > 0 && shortfall < this.spilloverMin) {
      // Whoever is already on the session can absorb the rest.
      return [];
    }

    const candidates = this.registry
      .idle(slug)
      .filter((w) => !assigned.has(w.workerId));

    if (candidates.length === 0) {
      if (assigned.size === 0) {
        this.logger.warn(
          `No idle ${slug} worker available for session ${sessionCuid} (${remaining} remaining); will retry on the next confirm`,
        );
      }
      return [];
    }

    const chosen = this.selectWorkers(
      assigned.size === 0 ? remaining : shortfall,
      candidates,
    );
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
      this.markPending(sessionCuid, worker.workerId);
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
   * Workers that own rows on this session, plus any we have woken that have not
   * claimed yet.
   */
  async assignedWorkers(sessionCuid: string): Promise<Set<string>> {
    const rows = await this.prisma.broadcast.findMany({
      where: { session: sessionCuid, workerId: { not: null } },
      distinct: ['workerId'],
      select: { workerId: true },
    });

    const assigned = new Set<string>(
      rows.map((r) => r.workerId).filter((id): id is string => !!id),
    );
    for (const workerId of this.pendingAssignments.get(sessionCuid) ?? []) {
      assigned.add(workerId);
    }
    return assigned;
  }

  /**
   * Free capacity across the assigned workers. A worker that has gone stale
   * contributes nothing, so its share of the session shows up as shortfall and
   * gets covered by someone else.
   */
  private async headroom(
    slug: string,
    assigned: Set<string>,
  ): Promise<number> {
    if (assigned.size === 0) return 0;

    const live = new Map(this.registry.live(slug).map((w) => [w.workerId, w]));
    let headroom = 0;

    for (const workerId of assigned) {
      const worker = live.get(workerId);
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

  private markPending(sessionCuid: string, workerId: string) {
    const set = this.pendingAssignments.get(sessionCuid) ?? new Set<string>();
    set.add(workerId);
    this.pendingAssignments.set(sessionCuid, set);
  }

  /** Called once a worker has claimed, or when it is told the session is done. */
  clearPending(sessionCuid: string, workerId?: string) {
    if (!workerId) {
      this.pendingAssignments.delete(sessionCuid);
      return;
    }
    const set = this.pendingAssignments.get(sessionCuid);
    if (!set) return;
    set.delete(workerId);
    if (set.size === 0) this.pendingAssignments.delete(sessionCuid);
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
