import { Injectable } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { BroadcastLog, Session as PSession, Transport } from '@prisma/client';
import { QUEUES } from '@rumsan/connect';
import {
  SessionStatus,
  TransportType,
  Session,
  BroadcastStatus,
} from '@rumsan/connect/types';
import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import { QueueService } from '../queues/queue.service';
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
    private readonly queueService: QueueService,
  ) {}
  async create(appId: string, dto: BroadcastDto) {
    const { transport: transportId, message, addresses } = dto;
    await this.validateBroadcastData(transportId, message, addresses);

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
        data: sessionData,
        include: {
          Transport: true,
        },
      });

      // for (const address of dto.addresses) {
      //   broadcastData.push({
      //     cuid: createId(),
      //     transport: dto.transport,
      //     session: session.cuid,
      //     app: appId,
      //     maxAttempts: sessionData.maxAttempts,
      //     address,
      //   });
      // }

      // await tx.broadcast.createMany({
      //   data: broadcastData,
      // });

      return session;
    });

    if (newSession.id) {
      this.checkTransportReadiness(
        newSession,
        newSession.Transport.type as TransportType,
      );
    }
    return newSession;
  }

  async checkTransportReadiness(
    session: PSession,
    transportType: TransportType,
  ) {
    this.queueService
      .queueTransportReadiness(this._getQueueName(transportType), {
        sessionCuid: session.cuid,
      })
      .then(async (res) => {
        if (res) {
          await this.prisma.session.update({
            where: {
              cuid: session.cuid,
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

  async sendBroadcasts(sessionCuid: string) {
    const session = await this.prisma.session.findUnique({
      where: {
        cuid: sessionCuid,
      },
      include: {
        Transport: true,
      },
    });
    if (!session) return;
    const addresses = session.addresses as Array<string>;
    const broadcastData = [];

    for (const address of addresses) {
      broadcastData.push({
        cuid: createId(),
        transport: session.transport,
        session: session.cuid,
        app: session.app,
        maxAttempts: session.maxAttempts,
        address,
      });
    }
    this.prisma.broadcast
      .createMany({
        data: broadcastData,
      })
      .then(async (res) => {
        if (res) {
          await this._addToQueue(session.Transport, broadcastData);
        }
      });
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

  _getQueueName(transportType: TransportType): QUEUES {
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
    transport: Transport,
    broadcastData: {
      cuid: string;
      session: string;
      address: string;
    }[],
  ) {
    const queueTransport = this._getQueueName(transport.type as TransportType);

    for (const broadcast of broadcastData) {
      const data = {
        transportId: transport.cuid,
        broadcastId: broadcast.cuid,
        broadcastLogId: createId(),
        sessionId: broadcast.session,
        address: broadcast.address,
        attempt: 1,
      };

      //create broadcast log before queuing
      await this.prisma.broadcastLog.create({
        data: {
          cuid: data.broadcastLogId,
          broadcast: data.broadcastId,
          session: data.sessionId,
          app: transport.app,
          status: BroadcastStatus.PENDING,
          attempt: data.attempt,
        },
      });

      this.queueService
        .queueBroadcast(queueTransport, data)
        .then()
        .catch((err) => {
          console.log(err);
        });
    }
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
        },
        orderBy,
      },
      {
        page: dto.page,
        perPage: dto.limit,
      },
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
}
