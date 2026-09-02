import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createId } from '@paralleldrive/cuid2';
import {
  Broadcast,
  BroadcastLog,
  Prisma,
  Session as PrismaSessionType,
  Transport,
} from '@prisma/client';
import { BroadcastQueue, TransportQueue } from '@rsconnect/queue';
import { QUEUES } from '@rumsan/connect';
import {
  BroadcastStatus,
  Session,
  SessionStatus,
  TransportType,
  TriggerType,
} from '@rumsan/connect/types';
import { createObjectCsvStringifier } from 'csv-writer';
import { isValidPhoneNumber } from 'libphonenumber-js';

import { InjectQueue } from '@nestjs/bull';
import { TwilioBatchingService } from '@rsconnect/transports';
import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import { Queue } from 'bull';
import { SessionTimingService } from '../session/session-timing.service';
import {
  dev_NewBatchAlert,
  dev_SessionAttemptComplete,
  dev_SessionCompletionAlert,
} from '../utils/dev.alert';
import { TransportStatsRaw } from '../utils/types/report';
import { BroadcastValidationService } from './broadcast-validation.service';
import { BROADCAST_CONSTANTS } from './broadcast.constants';
import { BroadcastDto, ListBroadcastDto } from './dto/broadcast.dto';
import { ReportWhereClause } from './dto/report.dto';
import { RedisZsetSchedulerService } from './redis-zset-scheduler.service';
import { SessionAssignmentService } from './session-assignment.service';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

/**
 * Cap on consecutive re-claims when every claimed row turns out to be invalid,
 * so a session of nothing but bad addresses cannot spin.
 */
const MAX_SEND_RECURSION = 5;

/** What the claim statement returns — everything needed to dispatch a batch. */
type ClaimedBroadcast = Pick<Broadcast, 'cuid' | 'address' | 'attempts'>;

@Injectable()
export class BroadcastService {
  private readonly logger = new Logger(BroadcastService.name);

  constructor(
    @InjectQueue(QUEUES.SCHEDULED) public scheduleQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly transportQueue: TransportQueue,
    private readonly broadcastQueue: BroadcastQueue,
    private readonly redisZsetScheduler: RedisZsetSchedulerService,
    private readonly broadcastValidationService: BroadcastValidationService,
    private readonly eventEmitter: EventEmitter2,
    private readonly twilioBatchingService: TwilioBatchingService,
    private readonly sessionAssignment: SessionAssignmentService,
    private readonly sessionTiming: SessionTimingService,
  ) {}

  /**
   * Get the scheduling window in milliseconds
   * Messages scheduled beyond this window will be picked up by ScheduledWindowWorker
   * @private
   * @returns Scheduling window in milliseconds
   */
  private getScheduleWindowMs(): number {
    const hours = Number(
      process.env.BROADCAST_SCHEDULE_WINDOW_HOURS ??
        BROADCAST_CONSTANTS.DEFAULT_SCHEDULE_WINDOW_HOURS,
    );
    return hours * 60 * 60 * 1000;
  }

  /**
   * Schedule a broadcast session using Bull's delay mechanism
   *
   * This method adds a job to Bull queue with a delay. Bull will automatically
   * process the job after the specified delay time.
   *
   * @param sessionCuid - Unique session identifier
   * @param transportType - Type of transport to use
   * @param delayMs - Delay in milliseconds before execution
   */
  async scheduleWithBullDelay(
    sessionCuid: string,
    transportType: TransportType,
    delayMs: number,
  ) {
    await this.scheduleQueue.add(
      'schedule',
      {
        sessionCuid,
        transportType,
      },
      {
        delay: Math.max(0, delayMs),
        jobId: sessionCuid,
      },
    );
  }

  async create(appId: string, dto: BroadcastDto) {
    const { transport: transportId, message, addresses } = dto;
    const resolvedMessage =
      await this.broadcastValidationService.validateBroadcastData(
        transportId,
        message,
        addresses,
      );

    let transport: Transport = null;
    const sessionData: Session = {
      cuid: createId(),
      app: appId,
      transport: dto.transport,
      message: resolvedMessage as Record<string, any>,
      addresses: dto.addresses,
      triggerType: dto.trigger,
      maxAttempts: dto.maxAttempts,
      options: dto.options as Record<string, any>,
      status: SessionStatus.NEW,
      totalAddresses: dto.addresses.length,
      xref: dto.xref,
    };

    const newSession = await this.prisma.$transaction(async (tx) => {
      transport = await tx.transport.findUnique({
        where: {
          cuid: dto.transport,
        },
      });

      sessionData.maxAttempts = this._enforceMaxAttempts(
        transport.type,
        dto.maxAttempts,
      );

      sessionData.options = this.twilioBatchingService.enrichSessionOptions(
        (sessionData.options as Record<string, any>) ?? {},
        transport,
        dto.addresses.length,
      );

      const session = await tx.session.create({
        data: sessionData as PrismaSessionType,
        include: {
          Transport: true,
        },
      });

      const broadcastData = [];
      for (const address of dto.addresses) {
        broadcastData.push({
          cuid: createId(),
          transport: dto.transport,
          session: session.cuid,
          app: appId,
          maxAttempts: sessionData.maxAttempts,
          address,
          xref: dto.xref,
        });
      }

      await tx.broadcast.createMany({
        data: broadcastData,
      });

      return session;
    });
    this.logger.debug('Created session:', newSession.cuid);

    // Strategy map for trigger types
    const triggerHandlers: Record<TriggerType, () => Promise<void> | void> = {
      [TriggerType.IMMEDIATE]: () =>
        this.handleImmediateBroadcast(newSession as Session),
      [TriggerType.SCHEDULED]: async () => {
        await this.handleScheduledBroadcast(
          newSession as Session,
          dto.options.scheduledTimestamp,
        );
      },
      [TriggerType.MANUAL]: () =>
        this.handleManualBroadcast(newSession as Session),
    };

    const handler = triggerHandlers[newSession.triggerType];
    if (handler) {
      await handler();
    } else {
      this.logger.warn(
        `No handler defined for triggerType: ${newSession.triggerType}`,
      );
    }
    return newSession;
  }

  private handleManualBroadcast(session: Session) {
    this.logger.log(`Manual trigger for session: ${session.cuid}`);
    // Doing nothing on manual trigger
  }

  /**
   * Handle immediate broadcast by checking transport readiness
   * @private
   * @param session - The broadcast session
   */
  private handleImmediateBroadcast(session: Session) {
    this.checkTransportReadiness(
      session.cuid,
      session.Transport.type as TransportType,
    );
  }

  /**
   * Handle scheduled broadcast by scheduling it appropriately
   * @private
   * @param session - The broadcast session
   * @param scheduledTimestamp - The scheduled timestamp string
   */
  private async handleScheduledBroadcast(
    session: Session,
    scheduledTimestamp: Date,
  ) {
    const runAtMs = scheduledTimestamp.getTime();
    const now = Date.now();

    const delay = runAtMs - now;
    const windowMs = this.getScheduleWindowMs();

    this.logger.log(`Scheduling session with delay: ${delay}ms`);

    // Only push to Redis/Bull if the scheduled time is within the configured window.
    if (delay <= windowMs) {
      if (this.redisZsetScheduler.isEnabled()) {
        this.logger.log('Scheduling session with Redis Zset Scheduler');

        await this.redisZsetScheduler.schedule(
          session.cuid,
          session.Transport.type as TransportType,
          runAtMs,
        );
      } else {
        await this.scheduleWithBullDelay(
          session.cuid,
          session.Transport.type as TransportType,
          delay,
        );
      }
    }
  }

  async checkTransportReadiness(
    sessionCuid: string,
    transportType: TransportType,
  ) {
    try {
      // Multi-worker transports pick their workers by capacity and address the
      // readiness check to each; only those workers prepare audio. Everything
      // else keeps the single shared queue.
      let ok: boolean;
      if (this.sessionAssignment.isMultiWorker(transportType)) {
        const assigned = await this.sessionAssignment.ensureAssignment(
          sessionCuid,
          transportType,
        );
        // The session is under way even if every worker happened to be busy;
        // BroadcastReclaimWorker retries assignment until one frees up. Leaving
        // it NEW would strand it, since nothing else revisits a NEW session.
        //
        // An empty result is not necessarily "no worker free" — it also covers
        // nothing left to schedule, existing workers having enough headroom,
        // and spillover-min declining to wake another box. SessionAssignment
        // logs the actual reason, so don't guess at one here.
        if (assigned.length === 0) {
          this.logger.debug(
            `No new worker assigned to session ${sessionCuid}; see SessionAssignment for why`,
          );
        }
        ok = true;
      } else {
        ok = !!(await this.transportQueue.checkReadiness({
          transportToCheck: this._getQueueName(transportType),
          sessionCuid: sessionCuid,
        }));
      }

      if (ok) {
        await this.prisma.session.update({
          where: { cuid: sessionCuid },
          data: { status: SessionStatus.PENDING },
        });
      }
    } catch (err) {
      this.logger.error(
        `checkTransportReadiness failed for session ${sessionCuid}`,
        err,
      );
    }
  }

  /**
   * Take ownership of up to `batchSize` scheduled broadcasts for one worker.
   *
   * SKIP LOCKED is the safety boundary of the whole multi-worker design: two
   * workers confirming readiness at the same moment run this concurrently and
   * are guaranteed disjoint rows, so an address can never be dialled twice.
   * Selecting and then updating in separate statements — as this used to —
   * hands both workers the same rows.
   */
  private async _claimBroadcasts(
    sessionCuid: string,
    workerId: string | null,
    batchSize: number,
  ): Promise<ClaimedBroadcast[]> {
    const limit = batchSize > 0 ? Prisma.sql`LIMIT ${batchSize}` : Prisma.empty;

    return this.prisma.$queryRaw<ClaimedBroadcast[]>`
      UPDATE "tbl_broadcasts" b
         SET "status"      = ${BroadcastStatus.PENDING}::"BroadcastStatus",
             "attempts"    = b."attempts" + 1,
             "workerId"    = ${workerId},
             "claimedAt"   = now(),
             "lastAttempt" = now(),
             "updatedAt"   = now()
       WHERE b."cuid" IN (
         SELECT "cuid" FROM "tbl_broadcasts"
          WHERE "session" = ${sessionCuid}
            AND "status" = ${BroadcastStatus.SCHEDULED}::"BroadcastStatus"
            AND "isComplete" = false
          ORDER BY "createdAt" ASC
          ${limit}
          FOR UPDATE SKIP LOCKED
       )
      RETURNING b."cuid", b."address", b."attempts";
    `;
  }

  /**
   * Hand the next batch of a session to one worker.
   *
   * `workerId` identifies the worker that asked for work (it rides along on
   * READINESS_CONFIRM). When absent — every non-voice transport, and a
   * pre-upgrade voice worker — the batch goes to the shared transport queue
   * exactly as before.
   */
  async sendBroadcasts(
    sessionCuid: string,
    batchSize = 0,
    workerId?: string,
    depth = 0,
  ) {
    this.logger.log(
      `Sending broadcasts for session ${sessionCuid}${
        workerId ? ` to worker ${workerId}` : ''
      }`,
    );
    const session = await this.prisma.session.findUnique({
      where: {
        cuid: sessionCuid,
      },
      include: {
        Transport: true,
      },
    });
    if (!session) return;

    const transportType = session.Transport.type as TransportType;

    const batchGuard = await this.twilioBatchingService.applySendGuard(
      sessionCuid,
      (session.options as Record<string, any>) ?? {},
      batchSize,
      session.Transport.cuid,
    );
    if (batchGuard.halt) return;
    batchSize = batchGuard.batchSize;

    // Claim before validating: ownership has to be settled in one statement,
    // so anything we then discard is discarded from rows we already own.
    const claimed = await this._claimBroadcasts(
      sessionCuid,
      workerId ?? null,
      batchSize,
    );

    if (workerId) {
      this.sessionAssignment.clearPending(sessionCuid, workerId);
      this.logger.log(
        `Worker ${workerId} claimed ${claimed.length} broadcast(s) for session ${sessionCuid}`,
      );
    }

    if (claimed.length === 0) {
      // Nothing left for this worker. Other workers may still be finishing
      // their own claims, so this releases one worker, not the session.
      dev_SessionAttemptComplete(session.cuid).then().catch();

      await this.transportQueue.notifySessionComplete({
        transportQueue: this._getQueueName(transportType),
        sessionCuid,
        workerId,
      });
      return;
    }

    let broadcasts: ClaimedBroadcast[] = claimed;

    const transportCapabilities =
      (session.Transport.config as any)?.meta?.capabilities ?? [];
    // Validate phone numbers for API transport and mark invalids as failed
    if (transportCapabilities.includes('PHONE_NUMBER_VALIDATION')) {
      const validBroadcasts: ClaimedBroadcast[] = [];
      const invalidBroadcastIds: string[] = [];
      const invalidBroadcasts: ClaimedBroadcast[] = [];
      for (const b of broadcasts) {
        // Remove whatsapp: prefix if present
        const phone = b.address.startsWith('whatsapp:')
          ? b.address.replace('whatsapp:', '')
          : b.address;
        if (isValidPhoneNumber(phone)) {
          validBroadcasts.push(b);
        } else {
          invalidBroadcastIds.push(b.cuid);
          invalidBroadcasts.push(b);
        }
      }
      if (invalidBroadcastIds.length > 0) {
        await this.prisma.broadcast.updateMany({
          where: { cuid: { in: invalidBroadcastIds } },
          data: {
            status: BroadcastStatus.FAIL,
            isComplete: true,
            disposition: {
              error: 'Invalid phone number.',
              code: 'INVALID_PHONE',
            },
          },
        });
        await this.prisma.broadcastLog.createMany({
          data: invalidBroadcasts.map((b) => ({
            cuid: createId(),
            broadcast: b.cuid,
            session: session.cuid,
            app: session.Transport.app,
            status: BroadcastStatus.FAIL,
            attempt: b.attempts,
            details: {
              error: 'Invalid phone number.',
              code: 'INVALID_PHONE',
            },
          })),
        });
      }
      broadcasts = validBroadcasts;
    }

    if (broadcasts.length === 0) {
      // Every row we claimed was unusable. The worker is still free, so go
      // round again rather than leaving it idle — bounded so a session full of
      // invalid addresses cannot spin.
      if (depth >= MAX_SEND_RECURSION) {
        this.logger.warn(
          `Stopping after ${depth} consecutive all-invalid batches for session ${sessionCuid}`,
        );
        return;
      }
      return this.sendBroadcasts(sessionCuid, batchSize, workerId, depth + 1);
    }

    await this._addToQueue(
      session as Session,
      session.Transport,
      broadcasts,
      workerId,
    );
    await this.twilioBatchingService.recordQueuedBatch(
      sessionCuid,
      (session.options as Record<string, any>) ?? {},
      broadcasts.length,
      session.Transport.cuid,
    );
    dev_NewBatchAlert(broadcasts.length, session.cuid).then().catch();

    // Handing out work may have exhausted the assigned workers' capacity; if
    // more is still waiting, bring in the next free worker.
    if (this.sessionAssignment.isMultiWorker(transportType)) {
      await this.sessionAssignment
        .ensureAssignment(sessionCuid, transportType)
        .catch((err) =>
          this.logger.error(
            `ensureAssignment failed for session ${sessionCuid}`,
            err,
          ),
        );
    }
  }

  async retryBroadcasts(
    sessionCuid: string,
    transportType: TransportType,
    retryFailed?: boolean,
  ) {
    const isSessionComplete = await this._checkIfSessionComplete(sessionCuid);

    if (isSessionComplete) {
      this.logger.log(
        `retryBroadcasts called for completed session: ${sessionCuid}, skipping retries.`,
      );
      return {
        message: 'Session is already completed; no retries scheduled',
        isComplete: true,
        count: 0,
      };
    }

    const retryStatuses = retryFailed
      ? [
          BroadcastStatus.FAIL,
          BroadcastStatus.SCHEDULED,
          BroadcastStatus.PENDING,
        ]
      : [BroadcastStatus.SCHEDULED, BroadcastStatus.PENDING];

    const broadcasts = await this.prisma.broadcast.updateMany({
      where: {
        status: {
          in: retryStatuses,
        },
        session: sessionCuid,
        isComplete: false,
      },
      data: {
        status: BroadcastStatus.SCHEDULED,
        // Release ownership so any worker can pick these up again.
        workerId: null,
        claimedAt: null,
      },
    });

    if (broadcasts.count === 0) {
      return {
        isComplete: false,
        count: 0,
      };
    }

    // The session is going back to work, so any end time it carries is now in
    // the past. startedAt is left alone — it remains the true first start.
    await this.prisma.session.update({
      where: { cuid: sessionCuid },
      data: { endedAt: null },
    });
    // startedAt is filled in when the transport actually reports in; the gap is
    // the worker's queue time.
    await this.sessionTiming.openRun(sessionCuid, 'retry');

    setTimeout(async () => {
      console.log('========== Retrying Failed Broadcasts ==========');
      await this.checkTransportReadiness(sessionCuid, transportType);
    }, 100);

    return {
      message: `Retrying ${broadcasts.count} Number of Failed Broadcasts`,
      isComplete: false,
      count: broadcasts.count,
    };
  }

  async syncSessionCompletion(sessionCuid: string) {
    return this._checkIfSessionComplete(sessionCuid);
  }

  private async _checkIfSessionComplete(
    sessionCuid: string,
    //tx: PrismaService,
  ) {
    const inCompleteCount = await this.prisma.broadcast.count({
      where: {
        session: sessionCuid,
        isComplete: false,
      },
    });

    if (inCompleteCount === 0) {
      const endedAt = new Date();
      // Edge-triggered: this method doubles as a guard (webhook callbacks, the
      // retry endpoint) and runs long after a session finishes. Without the
      // status guard, every one of those re-checks would drag endedAt forward.
      const { count } = await this.prisma.session.updateMany({
        where: {
          cuid: sessionCuid,
          status: { not: SessionStatus.COMPLETED },
        },
        data: {
          status: SessionStatus.COMPLETED,
          endedAt,
        },
      });

      if (count > 0) {
        await this.sessionTiming.closeLastRun(sessionCuid, endedAt);
        this.logger.log(`Session ${sessionCuid} marked as COMPLETED`);
      }

      this.eventEmitter.emit('broadcast.session.completed', sessionCuid);
      dev_SessionCompletionAlert(sessionCuid).then().catch();
      return true;
    }

    return false;
  }

  private _enforceMaxAttempts(transportType, dtoMaxAttempts) {
    switch (transportType) {
      case TransportType.ECHO:
        return dtoMaxAttempts;
      case TransportType.API:
        return dtoMaxAttempts;
      case TransportType.SMTP:
        return 1;
      case TransportType.VOICE:
        return dtoMaxAttempts;
    }
  }

  private _getQueueName(transportType: TransportType): QUEUES {
    switch (transportType) {
      case TransportType.ECHO:
        return QUEUES.TRANSPORT_ECHO;
      case TransportType.API:
        return QUEUES.TRANSPORT_API;
      case TransportType.SMTP:
        return QUEUES.TRANSPORT_SMTP;
      case TransportType.VOICE:
        return QUEUES.TRANSPORT_VOICE;

      default:
        return QUEUES.TRANSPORT_ECHO;
    }
  }

  private async _addToQueue(
    session: Session,
    transport: Transport,
    broadcasts: ClaimedBroadcast[],
    workerId?: string,
  ) {
    this.logger.log(`Adding broadcasts to queue: sessionId: ${session.cuid}`);
    const queueTransport = this._getQueueName(transport.type as TransportType);

    const broadcastQueueData = broadcasts.map((broadcast) => {
      return {
        address: broadcast.address,
        broadcastLogId: createId(),
        broadcastId: broadcast.cuid,
        // Already incremented by the claim, which owns status and attempts.
        attempt: broadcast.attempts,
      };
    });

    await this.prisma.broadcastLog.createMany({
      data: broadcastQueueData.map((broadcast) => {
        return {
          cuid: broadcast.broadcastLogId,
          broadcast: broadcast.broadcastId,
          session: session.cuid,
          app: transport.app,
          status: BroadcastStatus.PENDING,
          attempt: broadcast.attempt,
        };
      }),
    });

    const payload = {
      sessionId: session.cuid,
      transportId: transport.cuid,
      broadcasts: broadcastQueueData,
    };

    // These rows are owned by one worker in the DB, so the message must reach
    // that worker and no other.
    if (workerId) {
      await this.broadcastQueue.broadcastToWorker(
        queueTransport,
        workerId,
        payload,
      );
      return;
    }

    await this.broadcastQueue.broadcast(queueTransport, payload);
  }

  findAll(
    appId: string,
    dto: ListBroadcastDto,
  ): Promise<PaginatorTypes.PaginatedResult<BroadcastLog>> {
    const orderBy: Record<string, 'asc' | 'desc'> = {};
    orderBy[dto.sort] = dto.order;
    return paginate(
      this.prisma.broadcast,
      {
        where: {
          app: appId,
          status: dto.status,
          xref: dto.xref,
          ...(dto.startDate && dto.endDate
            ? {
                createdAt: {
                  gte: new Date(dto.startDate),
                  lte: new Date(dto.endDate),
                },
              }
            : {}),
        },
        orderBy,
      },
      {
        page: dto.page,
        perPage: dto.perPage,
      },
    );
  }

  findSelected(appId: string, broadcastIds: string[]) {
    return this.prisma.broadcast.findMany({
      where: {
        app: appId,
        cuid: {
          in: broadcastIds,
        },
      },
    });
  }

  findOne(cuid: string) {
    return this.prisma.broadcast.findUnique({
      where: {
        cuid,
      },
      include: {
        Transport: {
          select: { cuid: true, app: true, name: true, type: true },
        },
        Session: {
          select: {
            cuid: true,
            app: true,
            message: true,
            maxAttempts: true,
            triggerType: true,
            webhook: true,
            options: true,
            stats: true,
            totalAddresses: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            deletedAt: true,
          },
        },
        Logs: true,
      },
    });
  }

  async broadcastStatusCount(appId: string) {
    const broadcastCounts = await this.prisma.broadcast.groupBy({
      by: ['status'],
      where: {
        app: appId,
      },
      _count: {
        status: true,
      },
    });
    const totalCount = await this.prisma.broadcast.count({
      where: {
        app: appId,
      },
    });
    const counts = broadcastCounts.reduce(
      (acc, item) => {
        if (['SCHEDULED', 'PENDING'].includes(item.status)) {
          acc.pending += item._count.status;
          return acc;
        }

        if (item.status === BroadcastStatus.SUCCESS) {
          acc.success += item._count.status;
          return acc;
        }

        if (item.status === BroadcastStatus.FAIL) {
          acc.fail += item._count.status;
        }

        return acc;
      },
      { fail: 0, pending: 0, success: 0 },
    );
    return {
      data: {
        ...counts,
        total: totalCount,
      },
    };
  }

  async fetchReportData(
    appId: string,
    where: ReportWhereClause,
    xref?: string,
  ) {
    return Promise.all([
      this.prisma.session.aggregate({
        where,
        _count: { id: true },
        _sum: { totalAddresses: true },
      }),
      this.prisma.broadcast.groupBy({
        by: ['status'],
        where: {
          app: appId,
          ...(xref ? { Session: { xref } } : {}),
        },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<TransportStatsRaw[]>`
        WITH transport_recipients AS (
          SELECT 
            t.cuid,
            SUM(s."totalAddresses") as total_recipients
          FROM "tbl_transports" t
          JOIN "tbl_sessions" s ON s.transport = t.cuid
          WHERE t.app = ${appId} ${
        xref ? Prisma.sql`AND s.xref = ${xref}` : Prisma.empty
      }
          GROUP BY t.cuid
        )
        SELECT 
          t.cuid as transport_id,
          t.name as transport_name,
          t.type as transport_type,
          COUNT(DISTINCT b.id) as total_broadcasts,
          SUM(CASE WHEN b.status = 'SUCCESS' THEN 1 ELSE 0 END) as success_count,
          SUM(CASE WHEN b.status = 'FAIL' THEN 1 ELSE 0 END) as failed_count,
          SUM(CASE WHEN b.status IN ('PENDING', 'SCHEDULED') THEN 1 ELSE 0 END) as pending_count,
          ROUND(AVG(CAST(b.attempts as float))::numeric, 2) as average_attempts,
          MAX(b.attempts) as max_attempts,
          COALESCE(tr.total_recipients, 0) as total_recipients
        FROM "tbl_transports" t
        LEFT JOIN "tbl_broadcasts" b ON b.transport = t.cuid
        LEFT JOIN transport_recipients tr ON tr.cuid = t.cuid
        WHERE t.app = ${appId}
        ${
          xref
            ? Prisma.sql`AND EXISTS (
          SELECT 1 FROM "tbl_sessions" s 
          WHERE s.transport = t.cuid 
          AND s.xref = ${xref}
        )`
            : Prisma.empty
        }
        GROUP BY t.cuid, t.name, t.type, tr.total_recipients
        HAVING COUNT(DISTINCT b.id) > 0
      `,
    ]);
  }

  async calculateTransportStats(transportStats: TransportStatsRaw[]) {
    return transportStats.map((t) => ({
      transport: t.transport_id,
      name: t.transport_name,
      type: t.transport_type,
      totalRecipients: Number(t.total_recipients || 0),
      broadcasts: {
        total: Number(t.total_broadcasts),
        success: Number(t.success_count),
        failed: Number(t.failed_count),
        pending: Number(t.pending_count),
        averageAttempts: Number(t.average_attempts || 0),
        maxAttempts: Number(t.max_attempts || 0),
      },
    }));
  }

  async generateBroadcastCsv(
    appId: string,
    sessionId?: string,
  ): Promise<string> {
    const broadcasts = await this.prisma.broadcast.findMany({
      where: {
        app: appId,
        ...(sessionId ? { session: sessionId } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });

    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: 'id', title: 'id' },
        { id: 'cuid', title: 'cuid' },
        { id: 'app', title: 'app' },
        { id: 'session', title: 'session' },
        { id: 'transport', title: 'transport' },
        { id: 'address', title: 'address' },
        { id: 'status', title: 'status' },
        { id: 'maxAttempts', title: 'maxAttempts' },
        { id: 'attempts', title: 'attempts' },
        { id: 'isComplete', title: 'isComplete' },
        { id: 'lastAttempt', title: 'lastAttempt' },
        { id: 'createdAt', title: 'createdAt' },
        { id: 'updatedAt', title: 'updatedAt' },
        { id: 'xref', title: 'xref' },
        { id: 'disposition', title: 'disposition' },
        { id: 'duration', title: 'duration' },
        { id: 'ivrSequence', title: 'ivrSequence' },
        { id: 'trunk', title: 'trunk' },
        { id: 'answerTime', title: 'answerTime' },
        { id: 'endTime', title: 'endTime' },
        { id: 'fullDisposition', title: 'fullDisposition' },
      ],
    });

    const records = broadcasts.map((b) => {
      const disp = (b.disposition as Record<string, unknown>) ?? {};
      return {
        id: b.id,
        cuid: b.cuid,
        app: b.app,
        session: b.session,
        transport: b.transport,
        address: b.address,
        status: b.status,
        maxAttempts: b.maxAttempts,
        attempts: b.attempts,
        isComplete: b.isComplete,
        lastAttempt: b.lastAttempt ?? '',
        createdAt: b.createdAt,
        updatedAt: b.updatedAt ?? '',
        xref: b.xref ?? '',
        disposition: disp.disposition ?? '',
        duration: disp.duration ?? '',
        ivrSequence: disp.ivrSequence ? JSON.stringify(disp.ivrSequence) : '[]',
        trunk: disp.trunk ?? '',
        answerTime: disp.answerTime ?? '',
        endTime: disp.endTime ?? '',
        fullDisposition: b.disposition ? JSON.stringify(b.disposition) : '',
      };
    });

    return (
      csvStringifier.getHeaderString() +
      csvStringifier.stringifyRecords(records)
    );
  }

  async getReports(appId: string, xref?: string) {
    console.log(`Fetching reports for app: ${appId}, xref: ${xref}`);
    this.logger.log(`Fetching reports for app: ${appId}, xref: ${xref}`);
    const where = xref ? { app: appId, xref } : { app: appId };

    const [sessionStats, broadcastStats, transportStats] =
      await this.fetchReportData(appId, where, xref);

    const totalMessages = broadcastStats.reduce(
      (sum, stat) => sum + stat._count._all,
      0,
    );
    const successCount =
      broadcastStats.find((stat) => stat.status === BroadcastStatus.SUCCESS)
        ?._count._all ?? 0;
    const failedCount =
      broadcastStats.find((stat) => stat.status === BroadcastStatus.FAIL)
        ?._count._all ?? 0;
    const pendingCount = broadcastStats
      .filter((stat) => ['SCHEDULED', 'PENDING'].includes(stat.status))
      .reduce((sum, stat) => sum + stat._count._all, 0);
    const successRate = totalMessages
      ? Number(((successCount / totalMessages) * 100).toFixed(2))
      : 0;

    return {
      sessionStats: {
        count: sessionStats._count.id ?? 0,
        totalRecipients: sessionStats._sum.totalAddresses ?? 0,
      },
      messageStats: {
        totalMessages,
        successCount,
        failedCount,
        pendingCount,
        successRate,
      },
      transportStats: await this.calculateTransportStats(transportStats),
      xref,
    };
  }
}
