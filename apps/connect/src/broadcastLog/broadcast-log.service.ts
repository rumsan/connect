import { Injectable, Session } from '@nestjs/common';
import { CreateBroadcastLogDto } from './dto/create-broadcast-log.dto';
import {
  BroadcastLog,
  BroadcastStatus,
  QueueBroadcastLog,
} from '@rsconnect/sdk/types';
import { PrismaService } from '@rumsan/prisma';
import { QueueService } from '../queues/queue.service';
import { SessionStatus } from '@prisma/client';

@Injectable()
export class BroadcastLogService {
  constructor(
    private readonly prisma: PrismaService //private readonly queueService: QueueService
  ) {}
  createUsingDto(createBroadcastLogDto: CreateBroadcastLogDto) {
    return 'This action adds a new broadcastLog';
  }

  async createViaQueue(data: QueueBroadcastLog, addToQueue?: any) {
    const { queue, ...logData } = data;

    await this.prisma.$transaction(async (tx) => {
      await tx.broadcastLog.create({
        data: logData,
      });

      const broadcast = await tx.broadcast.findUnique({
        where: {
          cuid: data.broadcast,
        },
      });

      if (data.status === BroadcastStatus.FAIL) {
        if (broadcast.maxAttempts > data.attempt) {
          const job = {
            name: 'broadcast',
            data: {
              transportId: broadcast.transport,
              broadcastId: broadcast.cuid,
              sessionId: broadcast.session,
              address: broadcast.address,
              attempt: data.attempt,
            },
          };
          if (addToQueue) {
            setTimeout(async () => {
              addToQueue(queue, job);
            }, 2000);
          }
        } else {
          await this.completeBroadcast(
            tx,
            data.broadcast,
            data.status,
            data.attempt,
            broadcast.session
          );
        }
      } else if (data.status === BroadcastStatus.SUCCESS) {
        await this.completeBroadcast(
          tx,
          data.broadcast,
          data.status,
          data.attempt,
          broadcast.session
        );
      }
    });
  }

  async completeBroadcast(
    tx: any,
    cuid: string,
    status: BroadcastStatus,
    attempts: number,
    sessionId: string
  ) {
    await tx.broadcast.update({
      where: {
        cuid,
      },
      data: {
        status,
        attempts: attempts,
        isComplete: true,
      },
    });
    const inCompleteCount = await tx.broadcast.count({
      where: {
        session: sessionId,
        isComplete: false,
      },
    });
    if (inCompleteCount === 0) {
      await tx.session.update({
        where: {
          cuid: sessionId,
        },
        data: {
          status: SessionStatus.COMPLETED,
        },
      });
    }
  }

  findAll() {
    return `This action returns all broadcastLog`;
  }

  findOne(id: number) {
    return `This action returns a #${id} broadcastLog`;
  }

  remove(id: number) {
    return `This action removes a #${id} broadcastLog`;
  }
}
