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

type TwilioBatchDisposition = {
  code: string;
  reason: string;
  message: string;
  nextRoundAt: string | null;
  intervalHours: number;
  dailyLimit: number;
  effectiveSentCount?: number;
  deferredCount?: number;
};

type TwilioRollingWindowUsage = {
  sentCount: number;
  oldestSentAt: Date | null;
  nextAvailableAt: string | null;
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

  private async getRollingWindowUsageForTransport(
    transportCuid: string,
    intervalHours: number,
  ): Promise<TwilioRollingWindowUsage> {
    const since = new Date(Date.now() - intervalHours * 3_600_000);

    const where = {
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
    };

    const [sentCount, oldest] = await Promise.all([
      this.prisma.broadcast.count({ where }),
      this.prisma.broadcast.findFirst({
        where,
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);

    const oldestSentAt = oldest?.createdAt ?? null;
    const nextAvailableAt = oldestSentAt
      ? new Date(oldestSentAt.getTime() + intervalHours * 3_600_000).toISOString()
      : null;

    return {
      sentCount,
      oldestSentAt,
      nextAvailableAt,
    };
  }

  private async updateScheduledDisposition(
    sessionCuid: string,
    payload: TwilioBatchDisposition,
  ): Promise<void> {
    await this.prisma.broadcast.updateMany({
      where: {
        session: sessionCuid,
        status: BroadcastStatus.SCHEDULED,
        isComplete: false,
      },
      data: {
        disposition: {
          ...payload,
          updatedAt: new Date().toISOString(),
        },
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
    const rollingUsage = transportCuid
      ? await this.getRollingWindowUsageForTransport(transportCuid, intervalHours)
      : null;

    const effectiveSentCount = rollingUsage?.sentCount ?? roundSentCount;
    const computedNextRoundAt =
      rollingUsage?.nextAvailableAt ??
      new Date(Date.now() + intervalHours * 3_600_000).toISOString();

    if (effectiveSentCount >= dailyLimit) {
      let nextRoundAt = twilioBatching.nextRoundAt;
      if (!nextRoundAt || nextRoundAt !== computedNextRoundAt) {
        nextRoundAt = computedNextRoundAt;
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
          `Twilio daily limit (${dailyLimit}) reached for session ${sessionCuid}. Sent in rolling window: ${effectiveSentCount}. Oldest sent at: ${rollingUsage?.oldestSentAt?.toISOString() ?? 'n/a'}. Next round at ${nextRoundAt}`,
        );
      }

      const deferredCount = await this.prisma.broadcast.count({
        where: {
          session: sessionCuid,
          status: BroadcastStatus.SCHEDULED,
          isComplete: false,
        },
      });

      await this.updateScheduledDisposition(sessionCuid, {
        code: 'TWILIO_BATCH_DEFERRED',
        reason: 'Delivery deferred by transport batching limits',
        message:
          'Broadcast delivery is deferred by transport limits. Remaining messages will continue in the next delivery window.',
        nextRoundAt,
        intervalHours,
        dailyLimit,
        effectiveSentCount,
        deferredCount,
      });

      return { halt: true, batchSize: requestedBatchSize };
    }

    const remaining = dailyLimit - effectiveSentCount;
    if (requestedBatchSize === 0 || requestedBatchSize > remaining) {
      const scheduledCount = await this.prisma.broadcast.count({
        where: {
          session: sessionCuid,
          status: BroadcastStatus.SCHEDULED,
          isComplete: false,
        },
      });
      const willQueue = Math.max(0, remaining);
      const deferredCount = Math.max(0, scheduledCount - willQueue);

      if (deferredCount > 0) {
        const nextRoundAt = computedNextRoundAt;

        await this.updateScheduledDisposition(sessionCuid, {
          code: 'TWILIO_BATCH_DEFERRED',
          reason: 'Delivery deferred by transport batching limits',
          message:
            'Broadcast delivery is deferred by transport limits. Remaining messages will continue in the next delivery window.',
          nextRoundAt,
          intervalHours,
          dailyLimit,
          effectiveSentCount,
          deferredCount,
        });
      }

      return { halt: false, batchSize: remaining };
    }

    return { halt: false, batchSize: requestedBatchSize };
  }

  async recordQueuedBatch(
    sessionCuid: string,
    options: Record<string, any> | undefined,
    queuedCount: number,
    transportCuid?: string,
  ): Promise<void> {
    const twilioBatching = options?.['twilioBatching'] as
      | TwilioBatchingState
      | undefined;
    if (!twilioBatching?.enabled) return;

    const intervalHours = twilioBatching.intervalHours ?? 24;
    const fallbackRoundSentCount =
      (twilioBatching.roundSentCount ?? 0) + queuedCount;

    const rollingUsage = transportCuid
      ? await this.getRollingWindowUsageForTransport(transportCuid, intervalHours)
      : null;

    const effectiveSentCount = rollingUsage?.sentCount ?? fallbackRoundSentCount;
    const limitReached = effectiveSentCount >= twilioBatching.dailyLimit;
    const nextRoundAt = limitReached
      ? rollingUsage?.nextAvailableAt ??
        new Date(Date.now() + intervalHours * 3_600_000).toISOString()
      : twilioBatching.nextRoundAt;

    await this.prisma.session.update({
      where: { cuid: sessionCuid },
      data: {
        options: {
          ...(options ?? {}),
          twilioBatching: {
            ...twilioBatching,
            roundSentCount: effectiveSentCount,
            nextRoundAt,
            lastBatchAt: new Date().toISOString(),
          },
        },
      },
    });

    if (limitReached) {
      const deferredCount = await this.prisma.broadcast.count({
        where: {
          session: sessionCuid,
          status: BroadcastStatus.SCHEDULED,
          isComplete: false,
        },
      });

      if (deferredCount > 0) {
        await this.updateScheduledDisposition(sessionCuid, {
          code: 'TWILIO_BATCH_DEFERRED',
          reason: 'Delivery deferred by transport batching limits',
          message:
            'Broadcast delivery is deferred by transport limits. Remaining messages will continue in the next delivery window.',
          nextRoundAt,
          intervalHours,
          dailyLimit: twilioBatching.dailyLimit,
          effectiveSentCount,
          deferredCount,
        });
      }
    }
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
    const baseUsageByTransport = new Map<string, TwilioRollingWindowUsage>();
    const reservedThisTick = new Map<string, number>();

    for (const session of rows) {
      const tb = (session.options as Record<string, any>)?.[
        'twilioBatching'
      ] as TwilioBatchingState | undefined;

      if (!tb?.nextRoundAt) continue;

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

      // Fetch rolling window usage from DB once per transport per tick.
      if (!baseUsageByTransport.has(transportCuid)) {
        const usage = await this.getRollingWindowUsageForTransport(
          transportCuid,
          intervalHours,
        );
        baseUsageByTransport.set(transportCuid, usage);
      }

      const baseUsage = baseUsageByTransport.get(transportCuid)!;
      const reserved = reservedThisTick.get(transportCuid) ?? 0;
      const alreadyUsed = baseUsage.sentCount + reserved;
      const remaining = dailyLimit - alreadyUsed;

      if (remaining <= 0) {
        // Quota exhausted in current rolling window.
        const newNextRoundAt =
          baseUsage.nextAvailableAt ??
          new Date(now.getTime() + intervalHours * 3_600_000).toISOString();

        await this.updateScheduledDisposition(session.cuid, {
          code: 'TWILIO_BATCH_DEFERRED',
          reason: 'Delivery deferred by transport batching limits',
          message:
            'Broadcast delivery is deferred by transport limits. Remaining messages will continue in the next delivery window.',
          nextRoundAt: newNextRoundAt,
          intervalHours,
          dailyLimit,
          effectiveSentCount: alreadyUsed,
          deferredCount: scheduledCount,
        });

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
      reservedThisTick.set(transportCuid, reserved + reservedCount);

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
