import { Injectable } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { Broadcast, SessionStatus } from '@prisma/client';
import {
  BroadcastStatus,
  QueueBroadcastJobData,
  QueueBroadcastLog,
} from '@rumsan/connect/types';
import { PrismaService } from '@rumsan/prisma';
import { QueueService } from '../queues/queue.service';

@Injectable()
export class BroadcastLogQueue {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  async update(
    data: QueueBroadcastLog,
    // data: Pick<BroadcastLog, 'cuid' | 'details' | 'status' | 'notes'>,
  ) {
    return this.prisma.$transaction(async (tx: PrismaService) => {
      const existingLog = await tx.broadcastLog.findUnique({
        where: {
          cuid: data.cuid,
        },
        include: {
          Broadcast: true,
        },
      });

      //TODO: check if existingLog is null, if that is necessary
      const existingLogDetails = (existingLog.details as object) || {};
      const details = { ...existingLogDetails, ...data.details };
      let isBroadcastComplete = data.status === BroadcastStatus.SUCCESS;
      if (!isBroadcastComplete) {
        isBroadcastComplete = data.attempt >= existingLog.Broadcast.maxAttempts; // +1 because attempt starts from 1
      }

      await tx.broadcastLog.update({
        where: {
          cuid: data.cuid,
        },
        data: {
          details,
          status: data.status,
          notes: data.notes,
        },
      });

      const broadcast = await tx.broadcast.update({
        where: {
          cuid: existingLog.broadcast,
        },
        data: {
          disposition: details,
          status: data.status,
          attempts: data.attempt,
          isComplete: isBroadcastComplete,
        },
      });

      if (data.status === BroadcastStatus.FAIL && !isBroadcastComplete) {
        await this._processFailedBroadcasts(data, broadcast);
      }

      if (isBroadcastComplete) {
        await this._checkSessionComplete(tx, existingLog.session);
      }
    });
  }

  async updateDetails(broadcastLogId: string, details: object) {
    const existingLog = await this.prisma.broadcastLog.findUnique({
      where: {
        cuid: broadcastLogId,
      },
    });

    if (!existingLog) {
      return;
    }

    const existingLogDetails = (existingLog.details as object) || {};
    const updatedDetails = { ...existingLogDetails, ...details };

    const broadcastLog = await this.prisma.broadcastLog.update({
      where: {
        cuid: broadcastLogId,
      },
      data: {
        details: updatedDetails,
      },
    });

    return this.prisma.broadcast.update({
      where: {
        cuid: broadcastLog.broadcast,
      },
      data: {
        disposition: updatedDetails,
      },
    });
  }

  private async _checkSessionComplete(tx: PrismaService, sessionId: string) {
    const incompleteCount = await tx.broadcast.count({
      where: {
        session: sessionId,
        isComplete: false,
      },
    });

    if (incompleteCount === 0) {
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

  private async _processFailedBroadcasts(
    log: QueueBroadcastLog,
    broadcast: Broadcast,
  ) {
    const data: QueueBroadcastJobData = {
      broadcastLogId: createId(),
      broadcastId: broadcast.cuid,
      transportId: broadcast.transport,
      sessionId: broadcast.session,
      address: broadcast.address,
      attempt: log.attempt + 1,
    };

    await this.prisma.broadcastLog.create({
      data: {
        cuid: data.broadcastLogId,
        broadcast: data.broadcastId,
        session: data.sessionId,
        app: broadcast.app,
        status: BroadcastStatus.PENDING,
        attempt: data.attempt,
      },
    });

    //TODO: need to have dynamic scheduling using bullmq
    setTimeout(async () => {
      this.queueService
        .queueBroadcast(log.queue, data)
        .then()
        .catch((err) => {
          console.log(err);
        });
    }, 60000);
  }
}
