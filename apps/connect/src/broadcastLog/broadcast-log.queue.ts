import { Injectable } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import {
  BroadcastStatus,
  QueueBroadcastLog,
  QueueBroadcastLogDetails,
} from '@rumsan/connect/types';
import { PrismaService } from '@rumsan/prisma';
import { BroadcastService } from '../broadcast/broadcast.service';
import { dev_SessionCompletionAlert } from '../utils/dev.alert';

@Injectable()
export class BroadcastLogQueue {
  constructor(
    private readonly prisma: PrismaService,
    private readonly broadcastService: BroadcastService,
  ) {}

  async update(data: QueueBroadcastLog) {
    return this.prisma.$transaction(async (tx: PrismaService) => {
      const existingLog = await tx.broadcastLog.findUnique({
        where: {
          cuid: data.broadcastLogId,
        },
        include: {
          Broadcast: true,
        },
      });

      //TODO: check if existingLog is null, if that is necessary
      const existingLogDetails = (existingLog.details as object) || {};
      const details = { ...existingLogDetails, ...data.details };
      const isSuccess = data.status === BroadcastStatus.SUCCESS;
      const isFail = data.status === BroadcastStatus.FAIL;
      const isBroadcastComplete =
        isSuccess ||
        (isFail && data.attempt >= existingLog.Broadcast.maxAttempts); // attempt starts from 1

      await tx.broadcastLog.update({
        where: {
          cuid: data.broadcastLogId,
        },
        data: {
          details,
          status: data.status,
          notes: data.notes,
        },
      });

      await tx.broadcast.update({
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

      if (isBroadcastComplete) {
        await this._checkSessionComplete(tx, existingLog.session);
      }
    });
  }

  async updateDetails(data: QueueBroadcastLogDetails) {
    const { broadcastLogId, details, notes } = data;
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
        status: data.status,
        details: updatedDetails,
        notes,
      },
    });

    return this.prisma.broadcast.update({
      where: {
        cuid: broadcastLog.broadcast,
      },
      data: {
        status: data.status,
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
      dev_SessionCompletionAlert(sessionId).then().catch();
    }
  }
}
