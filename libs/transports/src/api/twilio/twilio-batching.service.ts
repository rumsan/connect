import { Injectable, Logger } from '@nestjs/common';
import {
  BroadcastStatus,
  SessionStatus,
  TransportType,
} from '@rumsan/connect/types';
import { PrismaService } from '@rumsan/prisma';
import { Transport } from '@prisma/client';

type TwilioBatchingState = {
  enabled: boolean;
  dailyLimit: number;
  intervalHours: number;
  roundSentCount: number;
  nextRoundAt: string | null;
  lastRoundStartedAt?: string;
  lastBatchAt?: string;
  totalAddresses?: number;
};

@Injectable()
export class TwilioBatchingService {
  private readonly logger = new Logger(TwilioBatchingService.name);

  constructor(private readonly prisma: PrismaService) {}

  isTwilioTransport(transport: Transport): boolean {
    const meta = (transport.config as Record<string, any>)?.['meta'];
    return meta?.provider === 'twilio';
  }

  private getTwilioDailyLimit(transport: Transport): number {
    const meta = (transport.config as Record<string, any>)?.['meta'];
    const fromConfig = Number(meta?.dailyLimit);
    if (Number.isFinite(fromConfig) && fromConfig > 0)
      return Math.floor(fromConfig);
    const fromEnv = Number(process.env['TWILIO_DAILY_LIMIT']);
    if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.floor(fromEnv);
    return 500;
  }

  private getTwilioBatchIntervalHours(transport: Transport): number {
    const meta = (transport.config as Record<string, any>)?.['meta'];
    const fromConfig = Number(
      meta?.batchIntervalHours ?? meta?.intervalHours ?? meta?.interval,
    );
    if (Number.isFinite(fromConfig) && fromConfig > 0) return fromConfig;
    const fromEnv = Number(process.env['TWILIO_BATCH_INTERVAL_HOURS']);
    if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
    return 24;
  }

  private async getRollingSentCountForTransport(
    transportCuid: string,
    intervalHours: number,
  ): Promise<number> {
    const since = new Date(Date.now() - intervalHours * 3_600_000);

    return this.prisma.broadcast.count({
      where: {
        createdAt: { gte: since },
        status: {
          in: [
            BroadcastStatus.PENDING,
            BroadcastStatus.SUCCESS,
            BroadcastStatus.FAIL,
          ],
        },
        transport: transportCuid,
        attempts: { gt: 0 },
      },
    });
  }

  enrichSessionOptions(
    baseOptions: Record<string, any> | undefined,
    transport: Transport,
    totalAddresses: number,
  ): Record<string, any> {
    if (!this.isTwilioTransport(transport)) return baseOptions ?? {};

    const dailyLimit = this.getTwilioDailyLimit(transport);
    const intervalHours = this.getTwilioBatchIntervalHours(transport);

    return {
      ...(baseOptions ?? {}),
      twilioBatching: {
        enabled: true,
        dailyLimit,
        intervalHours,
        roundSentCount: 0,
        nextRoundAt: null,
        lastRoundStartedAt: new Date().toISOString(),
        totalAddresses,
      },
    };
  }

  async applySendGuard(
    sessionCuid: string,
    options: Record<string, any> | undefined,
    requestedBatchSize: number,
    transportCuid?: string,
  ): Promise<{ halt: boolean; batchSize: number }> {
    const twilioBatching = options?.['twilioBatching'] as
      | TwilioBatchingState
      | undefined;

    if (!twilioBatching?.enabled) {
      return { halt: false, batchSize: requestedBatchSize };
    }

    const {
      dailyLimit,
      roundSentCount = 0,
      intervalHours = 24,
    } = twilioBatching;
    const effectiveSentCount = transportCuid
      ? await this.getRollingSentCountForTransport(transportCuid, intervalHours)
      : roundSentCount;

    if (effectiveSentCount >= dailyLimit) {
      if (!twilioBatching.nextRoundAt) {
        const nextRoundAt = new Date(
          Date.now() + intervalHours * 3_600_000,
        ).toISOString();
        await this.prisma.session.update({
          where: { cuid: sessionCuid },
          data: {
            options: {
              ...(options ?? {}),
              twilioBatching: {
                ...twilioBatching,
                roundSentCount: effectiveSentCount,
                nextRoundAt,
              },
            },
          },
        });
        this.logger.log(
          `Twilio daily limit (${dailyLimit}) reached for session ${sessionCuid}. Sent in rolling window: ${effectiveSentCount}. Next round at ${nextRoundAt}`,
        );
      }
      return { halt: true, batchSize: requestedBatchSize };
    }

    const remaining = dailyLimit - effectiveSentCount;
    if (requestedBatchSize === 0 || requestedBatchSize > remaining) {
      return { halt: false, batchSize: remaining };
    }

    return { halt: false, batchSize: requestedBatchSize };
  }

  async recordQueuedBatch(
    sessionCuid: string,
    options: Record<string, any> | undefined,
    queuedCount: number,
  ): Promise<void> {
    const twilioBatching = options?.['twilioBatching'] as
      | TwilioBatchingState
      | undefined;
    if (!twilioBatching?.enabled) return;

    const newRoundSentCount =
      (twilioBatching.roundSentCount ?? 0) + queuedCount;
    const limitReached = newRoundSentCount >= twilioBatching.dailyLimit;
    const nextRoundAt = limitReached
      ? new Date(
          Date.now() + (twilioBatching.intervalHours ?? 24) * 3_600_000,
        ).toISOString()
      : twilioBatching.nextRoundAt;

    await this.prisma.session.update({
      where: { cuid: sessionCuid },
      data: {
        options: {
          ...(options ?? {}),
          twilioBatching: {
            ...twilioBatching,
            roundSentCount: newRoundSentCount,
            nextRoundAt,
            lastBatchAt: new Date().toISOString(),
          },
        },
      },
    });
  }

  async findDueSessionsAndReset(now = new Date()): Promise<
    Array<{
      sessionCuid: string;
      transportType: TransportType;
      scheduledCount: number;
    }>
  > {
    const rows = await this.prisma.session.findMany({
      where: {
        options: { path: ['twilioBatching', 'enabled'], equals: true },
        status: { not: SessionStatus.COMPLETED },
      },
      include: { Transport: true },
    });

    const due: Array<{
      sessionCuid: string;
      transportType: TransportType;
      scheduledCount: number;
    }> = [];

    // Track how much quota has already been reserved for each transport within
    // this single cron tick.  We query the DB once per transport and then
    // accumulate reservations in-memory so concurrent sessions sharing the
    // same Twilio account cannot all race past the limit.
    const reservedThisTick = new Map<string, number>();

    for (const session of rows) {
      const tb = (session.options as Record<string, any>)?.[
        'twilioBatching'
      ] as TwilioBatchingState | undefined;

      if (!tb?.nextRoundAt) continue;

      const dueAt = new Date(tb.nextRoundAt).getTime();
      if (Number.isNaN(dueAt) || dueAt > now.getTime()) continue;

      const scheduledCount = await this.prisma.broadcast.count({
        where: {
          session: session.cuid,
          status: BroadcastStatus.SCHEDULED,
          isComplete: false,
        },
      });
      if (scheduledCount === 0) continue;

      const transportCuid = session.Transport.cuid;
      const dailyLimit = tb.dailyLimit;
      const intervalHours = tb.intervalHours ?? 24;

      // Fetch rolling sent count from DB once per transport per tick.
      if (!reservedThisTick.has(transportCuid)) {
        const dbCount = await this.getRollingSentCountForTransport(
          transportCuid,
          intervalHours,
        );
        reservedThisTick.set(transportCuid, dbCount);
      }

      const alreadyUsed = reservedThisTick.get(transportCuid)!;
      const remaining = dailyLimit - alreadyUsed;

      if (remaining <= 0) {
        // Quota already exhausted — defer this session to the next interval.
        const newNextRoundAt = new Date(
          now.getTime() + intervalHours * 3_600_000,
        ).toISOString();
        await this.prisma.session.update({
          where: { cuid: session.cuid },
          data: {
            options: {
              ...((session.options as Record<string, any>) ?? {}),
              twilioBatching: { ...tb, nextRoundAt: newNextRoundAt },
            },
          },
        });
        this.logger.log(
          `Twilio quota exhausted for transport ${transportCuid}, deferring session ${session.cuid} to ${newNextRoundAt}`,
        );
        continue;
      }

      // Reserve the slots this session will consume (capped at remaining quota).
      const reservedCount = Math.min(scheduledCount, remaining);
      reservedThisTick.set(transportCuid, alreadyUsed + reservedCount);

      await this.prisma.session.update({
        where: { cuid: session.cuid },
        data: {
          options: {
            ...((session.options as Record<string, any>) ?? {}),
            twilioBatching: {
              ...tb,
              roundSentCount: 0,
              nextRoundAt: null,
              lastRoundStartedAt: now.toISOString(),
            },
          },
        },
      });

      due.push({
        sessionCuid: session.cuid,
        transportType: session.Transport.type as TransportType,
        scheduledCount: reservedCount,
      });
    }

    return due;
  }
}
