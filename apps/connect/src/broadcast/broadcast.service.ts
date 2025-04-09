import { Injectable } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import {
  Broadcast,
  BroadcastLog,
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
} from '@rumsan/connect/types';

import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import {
  dev_NewBatchAlert,
  dev_SessionAttemptComplete,
  dev_SessionCompletionAlert,
} from '../utils/dev.alert';
import {
  BroadcastDto,
  ListBroadcastDto,
  MessageDto,
} from './dto/broadcast.dto';
import { getAddressValidator, getContentValidator } from './validators';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class BroadcastService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transportQueue: TransportQueue,
    private readonly broadcastQueue: BroadcastQueue,
  ) { }
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

    if (newSession.cuid) {
      this.checkTransportReadiness(
        newSession.cuid,
        newSession.Transport.type as TransportType,
      );
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
      return { isComplete: true, count: 0 };
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


  async getLogsByXref(appId: string, dto: ListBroadcastDto, xref: string) {
    const orderBy: Record<string, 'asc' | 'desc'> = {};
    orderBy[dto.sort] = dto.order;
    return paginate(
      this.prisma.broadcast,
      {
        where: {
          app: appId,
          status: dto.status,
          Session: { xref },
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
  async getReportsByXref(appId: string, dto: ListBroadcastDto, xref: string) {

    const sessionCounts = await this.prisma.session.groupBy({
      by: ['xref'],
      where: {
        app: appId,
        xref,
      },
      _count: {
        id: true,
      },
    });

    const broadcastStats = await this.prisma.broadcast.groupBy({
      by: ['session'],
      where: {
        app: appId,
        Session: { xref },
        ...(dto.status && { status: dto.status }),
        ...(dto.startDate && dto.endDate
          ? {
            createdAt: {
              gte: new Date(dto.startDate),
              lte: new Date(dto.endDate),
            },
          }
          : {}),
      },
      _count: {
        _all: true,
      },
    });

    const successStats = await this.prisma.broadcast.groupBy({
      by: ['session'],
      where: {
        app: appId,
        Session: { xref },

        status: 'SUCCESS',
        ...(dto.startDate && dto.endDate
          ? {
            createdAt: {
              gte: new Date(dto.startDate),
              lte: new Date(dto.endDate),
            },
          }
          : {}),
      },
      _count: {
        id: true,
      },
    });

    const totalMessages = broadcastStats.reduce((sum, stat) => sum + stat._count._all, 0);
    const successCount = successStats.reduce((sum, stat) => sum + stat._count.id, 0);
    const successRate = {
      xref,
      totalMessages,
      successCount,
      successRate: totalMessages > 0 ? (successCount / totalMessages) * 100 : 0,
    };

    const recipientCounts = await this.prisma.session.groupBy({
      by: ['xref'],
      where: {
        app: appId,
        xref,
      },
      _sum: {
        totalAddresses: true,
      },
    });

    const recipientsByTransport = await this.prisma.session.groupBy({
      by: ['transport', 'xref'],
      where: {
        app: appId,
        xref,
      },
      _sum: {
        totalAddresses: true,
      },
    });

    return {
      sessionCount: sessionCounts[0]?._count.id || 0,
      successRate,
      totalRecipients: recipientCounts[0]?._sum.totalAddresses || 0,
      recipientsByTransport: recipientsByTransport.map((item) => ({
        transport: item.transport,
        xref: item.xref,
        totalRecipients: item._sum.totalAddresses || 0,
      })),
    };


  }


}
