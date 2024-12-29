import { Injectable } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { BroadcastLog, BroadcastStatus } from '@rumsan/connect/types';
import { paginator, PaginatorTypes, PrismaService } from '@rumsan/prisma';
import { ListBroadcastLogDto } from './dto/list-broadcast-log.dto';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });
@Injectable()
export class BroadcastLogService {
  constructor(
    private readonly prisma: PrismaService, //private readonly queueService: QueueService
  ) {}
  async create() {
    // const { queue, ...logData } = data;
    // await this.prisma.$transaction(async (tx) => {
    //   const broadcast = await tx.broadcast.findUnique({
    //     where: {
    //       cuid: data.broadcastId,
    //     },
    //   });
    //   await tx.broadcastLog.create({
    //     data: { app: broadcast.app, session: broadcast.session, ...logData },
    //   });
    //   if (data.status === BroadcastStatus.FAIL) {
    //     if (broadcast.maxAttempts > data.attempt) {
    //       const job = {
    //         name: 'broadcast',
    //         data: {
    //           transportId: broadcast.transport,
    //           broadcastId: broadcast.cuid,
    //           sessionId: broadcast.session,
    //           address: broadcast.address,
    //           attempt: data.attempt,
    //         },
    //       };
    //       if (addToQueue) {
    //         setTimeout(async () => {
    //           addToQueue(queue, job);
    //         }, 2000);
    //       }
    //     } else {
    //       await this.completeBroadcast(
    //         tx,
    //         data.broadcast,
    //         data.status,
    //         data.attempt,
    //         broadcast.session,
    //       );
    //     }
    //   } else if (data.status === BroadcastStatus.SUCCESS) {
    //     await this.completeBroadcast(
    //       tx,
    //       data.broadcast,
    //       data.status,
    //       data.attempt,
    //       broadcast.session,
    //     );
    //   }
    // });
  }

  async completeBroadcast(
    tx: any,
    cuid: string,
    status: BroadcastStatus,
    attempts: number,
    sessionId: string,
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

  findAll(
    appId: string,
    dto: ListBroadcastLogDto,
  ): Promise<PaginatorTypes.PaginatedResult<BroadcastLog>> {
    const orderBy: Record<string, 'asc' | 'desc'> = {};
    orderBy[dto.sort] = dto.order;
    return paginate(
      this.prisma.broadcastLog,
      {
        where: {
          app: appId,
        },
        orderBy,
      },
      {
        page: dto.page,
        perPage: dto.perPage,
      },
    );
  }
}
