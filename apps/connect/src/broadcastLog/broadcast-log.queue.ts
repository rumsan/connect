import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
  private readonly logger = new Logger(BroadcastLogQueue.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly broadcastService: BroadcastService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async update(data: QueueBroadcastLog) {
    let sessionCompleted = false;
    let sessionCuid = '';

    await this.prisma.$transaction(async (tx: PrismaService) => {
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
        sessionCuid = existingLog.session;
        sessionCompleted = await this._checkSessionComplete(tx, sessionCuid);
      }
    });

    if (sessionCompleted) {
      this.logger.log(`Session ${sessionCuid} completed. Emitting event...`);
      this.eventEmitter.emit('broadcast.session.completed', sessionCuid);
    }
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

    await this.prisma.broadcast.update({
      where: {
        cuid: broadcastLog.broadcast,
      },
      data: {
        status: data.status,
        disposition: updatedDetails,
      },
    });

    await this.checkVoiceUsageReady(existingLog.session);
  }

  private async checkVoiceUsageReady(sessionCuid: string) {
    const session = await this.prisma.session.findUnique({
      where: { cuid: sessionCuid },
      include: { Transport: true },
    });
    if (!session || session.status !== 'COMPLETED') return;
    if (session.Transport.type !== 'VOICE') return;

    const successBroadcasts = await this.prisma.broadcast.findMany({
      where: {
        session: sessionCuid,
        status: 'SUCCESS',
        isComplete: true,
      },
      select: { disposition: true },
    });

    if (successBroadcasts.length === 0) return;

    const allHaveDuration = successBroadcasts.every(
      (b) => ((b.disposition as Record<string, unknown>)?.duration as number) > 0,
    );

    if (allHaveDuration) {
      this.logger.log(
        `All CDRs received for VOICE session ${sessionCuid}, triggering usage calculation`,
      );
      this.eventEmitter.emit('broadcast.voice.usage_ready', sessionCuid);
    }
  }

  private async _checkSessionComplete(
    tx: PrismaService,
    sessionId: string,
  ): Promise<boolean> {
    const incompleteCount = await tx.broadcast.count({
      where: {
        session: sessionId,
        isComplete: false,
      },
    });

    if (incompleteCount === 0) {
      await tx.session.update({
        where: { cuid: sessionId },
        data: { status: SessionStatus.COMPLETED },
      });
      dev_SessionCompletionAlert(sessionId).then().catch();
      return true;
    }

    return false;
  }
}
