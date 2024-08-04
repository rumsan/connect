import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { BroadcastLog, Transport, TransportType } from '@prisma/client';
import { QUEUES } from '@rumsan/connect';
import { SessionStatus } from '@rumsan/connect/types';
import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import { Queue } from 'bull';
import { QueueService } from '../queues/queue.service';
import { BroadcastDto, ListBroadcastDto } from './dto/broadcast.dto';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class BroadcastService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUES.TRANSPORT_ECHO) private readonly EchoQueue: Queue,
    @InjectQueue(QUEUES.TRANSPORT_API) private readonly ApiQueue: Queue,
    @InjectQueue(QUEUES.TRANSPORT_SMTP) private readonly SmtpQueue: Queue,
    @InjectQueue(QUEUES.TRANSPORT_VOICE) private readonly VoiceQueue: Queue,
    private readonly queueService: QueueService
  ) { }
  async create(appId: string, dto: BroadcastDto) {
    const broadcastData = [];
    let transport: Transport = null;
    const sessionData = {
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
    };

    const retVal = await this.prisma.$transaction(async (tx) => {
      transport = await tx.transport.findUnique({
        where: {
          cuid: dto.transport,
        },
      });

      sessionData.maxAttempts = this._enforceMaxAttempts(
        transport.type,
        dto.maxAttempts
      );

      const session = await tx.session.create({
        data: sessionData,
      });

      for (const address of dto.addresses) {
        broadcastData.push({
          cuid: createId(),
          transport: dto.transport,
          session: session.cuid,
          app: appId,
          maxAttempts: sessionData.maxAttempts,
          address,
        });
      }

      await tx.broadcast.createMany({
        data: broadcastData,
      });

      return session;
    });

    if (retVal.id) {
      this._addToQueue(transport, broadcastData);
    }
    return retVal;
  }

  _enforceMaxAttempts(transportType, dtoMaxAttempts) {
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

  private async _addToQueue(transport: Transport, broadcastData: any) {
    let queueTransport: QUEUES = QUEUES.TRANSPORT_ECHO;

    switch (transport.type) {
      case TransportType.ECHO:
        queueTransport = QUEUES.TRANSPORT_ECHO;
        break;
      case TransportType.API:
        queueTransport = QUEUES.TRANSPORT_API;
        break;
      case TransportType.SMTP:
        queueTransport = QUEUES.TRANSPORT_SMTP;
        break;
      case TransportType.VOICE:
        queueTransport = QUEUES.TRANSPORT_VOICE;
        break;
    }

    for (const broadcast of broadcastData) {
      const job = {
        name: 'broadcast',
        data: {
          transportId: transport.cuid,
          broadcastId: broadcast.cuid,
          sessionId: broadcast.session,
          address: broadcast.address,
          attempt: 0,
        },
      };
      this.queueService
        .add(queueTransport, job)
        .then(async (res) => {
          if (res) {
            await this.prisma.broadcast.update({
              where: {
                cuid: broadcast.cuid,
              },
              data: {
                queuedAt: new Date(),
              },
            });
          }
        })
        .catch((err) => {
          console.log(err);
        });
    }
  }

  findAll(
    appId: string,
    dto: ListBroadcastDto
  ): Promise<PaginatorTypes.PaginatedResult<BroadcastLog>> {
    const orderBy: Record<string, 'asc' | 'desc'> = {};
    orderBy[dto.sort] = dto.order;
    return paginate(
      this.prisma.broadcast,
      {
        where: {
          app: appId,
        },
        orderBy,
      },
      {
        page: dto.page,
        perPage: dto.limit,
      }
    );
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
}
