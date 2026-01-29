import { Injectable, Logger } from '@nestjs/common';
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

import { InjectQueue } from '@nestjs/bull';
import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import { Queue } from 'bull';
import {
  dev_NewBatchAlert,
  dev_SessionAttemptComplete,
  dev_SessionCompletionAlert,
} from '../utils/dev.alert';
import { TransportStatsRaw } from '../utils/types/report';
import {
  BroadcastDto,
  ListBroadcastDto,
  MessageDto,
} from './dto/broadcast.dto';
import { ReportWhereClause } from './dto/report.dto';
import { RedisZsetSchedulerService } from './redis-zset-scheduler.service';
import { getAddressValidator, getContentValidator } from './validators';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class BroadcastService {
  private readonly logger = new Logger(BroadcastService.name);

  constructor(
    @InjectQueue(QUEUES.SCHEDULED) public scheduleQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly transportQueue: TransportQueue,
    private readonly broadcastQueue: BroadcastQueue,
    private readonly redisZsetScheduler: RedisZsetSchedulerService,
  ) {}

  private getScheduleWindowMs() {
    const hours = Number(
      process.env.BROADCAST_SCHEDULE_WINDOW_HOURS ?? 48,
    );
    return hours * 60 * 60 * 1000;
  }

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
    await this.validateBroadcastData(transportId, message, addresses);

    let transport: Transport = null;
    const sessionData: Session = {
      cuid: createId(),
      app: appId,
      transport: dto.transport,
      message: dto.message as Record<string, any>,
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

    if (newSession.cuid && newSession.triggerType !== TriggerType.SCHEDULED) {
      this.checkTransportReadiness(
        newSession.cuid,
        newSession.Transport.type as TransportType,
      );
    } else {
      const runAtMs = new Date(dto.options.scheduledTimestamp).getTime();
      const now = Date.now();
      const delay = runAtMs - now;
      const windowMs = this.getScheduleWindowMs();

      console.log(
        'Scheduling session with delay:',
        delay
      );

      // Only push to Redis/Bull if the scheduled time is within the configured window.
      if (runAtMs - now <= windowMs) {
        if (this.redisZsetScheduler.isEnabled()) {
          console.log('Scheduling session with Redis Zset Scheduler');
          
          await this.redisZsetScheduler.schedule(
            newSession.cuid,
            newSession.Transport.type as TransportType,
            runAtMs,
          );
        } else {
          await this.scheduleWithBullDelay(
            newSession.cuid,
            newSession.Transport.type as TransportType,
            delay,
          );
        }
      }
    }
    return newSession;
  }

  async checkTransportReadiness(
    sessionCuid: string,
    transportType: TransportType,
  ) {
    this.transportQueue
      .checkReadiness({
        transportToCheck: this._getQueueName(transportType),
        sessionCuid: sessionCuid,
      })
      .then(async (res) => {
        if (res) {
          await this.prisma.session.update({
            where: {
              cuid: sessionCuid,
            },
            data: {
              status: SessionStatus.PENDING,
            },
          });
        }
      })
      .catch((err) => {
        console.log(err);
      });
  }

  async sendBroadcasts(sessionCuid: string, batchSize = 0) {
    this.logger.log('Sending broadcasts for session:', sessionCuid);
    const session = await this.prisma.session.findUnique({
      where: {
        cuid: sessionCuid,
      },
      include: {
        Transport: true,
      },
    });
    if (!session) return;

    let broadcasts: Broadcast[] = [];

    if (batchSize > 0) {
      broadcasts = await this.prisma.broadcast.findMany({
        where: {
          status: {
            in: [BroadcastStatus.SCHEDULED],
          },
          session: sessionCuid,
          isComplete: false,
        },
        orderBy: [
          {
            status: 'asc', // Optional: Order by status
          },
          {
            createdAt: 'asc', // Optional: Order by creation date within each status
          },
        ],
        take: batchSize,
      });
    } else {
      broadcasts = await this.prisma.broadcast.findMany({
        where: {
          status: {
            in: [BroadcastStatus.SCHEDULED],
          },
          session: sessionCuid,
          isComplete: false,
        },
      });
    }

    if (broadcasts.length > 0) {
      await this._addToQueue(session as Session, session.Transport, broadcasts);
      dev_NewBatchAlert(broadcasts.length, session.cuid).then().catch();
    } else {
      dev_SessionAttemptComplete(session.cuid).then().catch();
      //TODO: Enable for automatic retries
      // await this.retryBroadcasts(
      //   sessionCuid,
      //   session.Transport.type as TransportType,
      // );
    }
  }

  async retryBroadcasts(
    sessionCuid: string,
    transportType: TransportType,
    retryFailed?: boolean,
  ) {
    const isSessionComplete = await this._checkIfSessionComplete(
      sessionCuid,
      // this.prisma,
    );
    if (isSessionComplete) {
      throw new Error('Session is completed');
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
      },
    });

    if (broadcasts.count === 0) {
      return {
        isComplete: false,
        count: 0,
      };
    }

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
      await this.prisma.session.update({
        where: {
          cuid: sessionCuid,
        },
        data: {
          status: SessionStatus.COMPLETED,
        },
      });
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
        return 1;
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
    broadcasts: Broadcast[],
  ) {
    this.logger.log('Adding broadcasts to queue:', session);
    const queueTransport = this._getQueueName(transport.type as TransportType);

    const broadcastQueueData = broadcasts.map((broadcast) => {
      return {
        address: broadcast.address,
        broadcastLogId: createId(),
        broadcastId: broadcast.cuid,
        attempt: broadcast.attempts + 1,
      };
    });

    const broadcastIds = broadcastQueueData.map((b) => b.broadcastId);

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

    await this.prisma.broadcast.updateMany({
      where: {
        cuid: {
          in: broadcastIds,
        },
      },
      data: {
        status: BroadcastStatus.PENDING,
        attempts: {
          increment: 1,
        },
      },
    });

    await this.broadcastQueue.broadcast(queueTransport, {
      sessionId: session.cuid,
      transportId: transport.cuid,
      broadcasts: broadcastQueueData,
    });
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

  async validateBroadcastData(
    transportId: string,
    message: MessageDto,
    addresses: string[],
  ) {
    const t = await this.prisma.transport.findUnique({
      where: {
        cuid: transportId,
      },
    });
    if (!t) throw new Error('Transport not found.');
    const contentValidator = getContentValidator(t.validationContent);
    const addressValidator = getAddressValidator(t.validationAddress);

    if (!contentValidator(message.content))
      throw new Error(`Content: ${message.content} validation failed.`);
    for (const address of addresses) {
      if (!addressValidator(address))
        throw new Error(`Address: ${address} validation failed.`);
    }
    return true;
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
        acc[item.status.toLowerCase()] = item._count.status;
        return acc;
      },
      { fail: 0, success: 0 },
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
          SUM(CASE WHEN b.status = 'PENDING' THEN 1 ELSE 0 END) as pending_count,
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
    const pendingCount =
      broadcastStats.find((stat) => stat.status === BroadcastStatus.PENDING)
        ?._count._all ?? 0;
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
