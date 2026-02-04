import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
  Session,
  SessionStatus,
  Transport,
} from '@prisma/client';
import { PrismaService } from '@rumsan/prisma';
import { TransportType, TriggerType } from '@rumsan/connect/types';
import { BroadcastService } from './broadcast.service';
import { RedisZsetSchedulerService } from './redis-zset-scheduler.service';
import { BROADCAST_CONSTANTS } from './broadcast.constants';

/**
 * Worker that monitors the database for scheduled messages that are entering
 * the scheduling window. Messages scheduled beyond the window are not queued
 * immediately to avoid memory issues with far-future schedules.
 */
@Injectable()
export class ScheduledWindowWorker {
  private readonly logger = new Logger(ScheduledWindowWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly broadcastService: BroadcastService,
    private readonly redisZsetScheduler: RedisZsetSchedulerService,
  ) {}

  /**
   * Get the scheduling window in milliseconds from configuration
   * @private
   */
  private getWindowMs(): number {
    const hours = Number(
      process.env.BROADCAST_SCHEDULE_WINDOW_HOURS ?? 
      BROADCAST_CONSTANTS.DEFAULT_SCHEDULE_WINDOW_HOURS,
    );
    return hours * 60 * 60 * 1000;
  }

  /**
   * Check for scheduled messages entering the scheduling window
   * Runs every 60 seconds to poll database for NEW scheduled sessions
   */
  @Interval(BROADCAST_CONSTANTS.WINDOW_WORKER_INTERVAL_MS)
  async tick() {
    const now = Date.now();
    const windowMs = this.getWindowMs();
    const windowEnd = new Date(now + windowMs);

    // Pick only NEW scheduled sessions; once processing starts, status changes.
    const sessions = await this.prisma.session.findMany({
      where: {
        triggerType: TriggerType.SCHEDULED,
        status: SessionStatus.NEW as SessionStatus,
      },
      include: {
        Transport: true,
      },
      take: 200,
    });

    if (!sessions.length) return;

    for (const s of sessions as (Session & { Transport: Transport })[]) {
      const runAtMs = new Date(
        (s.options as any)?.scheduledTimestamp,
      ).getTime();
      if (!runAtMs || Number.isNaN(runAtMs)) continue;

      // Only schedule when runAt is within [now - windowMs, now + windowMs]
      // so that: (a) far-future items are skipped, (b) missed items get re-enqueued.
      if (runAtMs > windowEnd.getTime()) continue;

      const delay = Math.max(0, runAtMs - now);

      try {
        if (this.redisZsetScheduler.isEnabled()) {
          await this.redisZsetScheduler.schedule(
            s.cuid,
            s.Transport.type as unknown as TransportType,
            runAtMs,
          );
        } else {
          await this.broadcastService.scheduleWithBullDelay(
            s.cuid,
            s.Transport.type as unknown as TransportType,
            delay,
          );
        }
      } catch (err) {
        this.logger.error(
          `Failed to enqueue scheduled session ${s.cuid}`,
          err as Error,
        );
      }
    }
  }
}