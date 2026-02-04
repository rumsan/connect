import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { TransportType } from '@rumsan/connect/types';
import { BroadcastService } from './broadcast.service';
import { RedisZsetSchedulerService } from './redis-zset-scheduler.service';
import { BROADCAST_CONSTANTS } from './broadcast.constants';

@Injectable()
export class RedisZsetSchedulerWorker implements OnModuleInit {
  private readonly logger = new Logger(RedisZsetSchedulerWorker.name);

  constructor(
    private readonly scheduler: RedisZsetSchedulerService,
    private readonly broadcastService: BroadcastService,
  ) {}

  async onModuleInit() {
    if (!this.scheduler.isEnabled()) return;
    const requeued = await this.scheduler.requeueStuckProcessing(Date.now());
    if (requeued > 0) {
      this.logger.warn(`Re-queued ${requeued} stuck scheduled items.`);
    }
  }

  @Interval(BROADCAST_CONSTANTS.SCHEDULER_TICK_INTERVAL_MS)
  async tick() {
    if (!this.scheduler.isEnabled()) return;

    const batchSize = Number(
      process.env.BROADCAST_SCHEDULER_BATCH_SIZE ?? 
      BROADCAST_CONSTANTS.DEFAULT_SCHEDULER_BATCH_SIZE
    );
    const ids = await this.scheduler.claimDueIds(Date.now(), batchSize);
    if (!ids.length) return;

    for (const id of ids) {
      const payload = await this.scheduler.getPayload(id);
      if (!payload) {
        // Payload missing/corrupt; clean up processing marker.
        await this.scheduler.markProcessed(id);
        continue;
      }

      this.broadcastService.checkTransportReadiness(
        payload.sessionCuid,
        payload.transportType as TransportType,
      );

      await this.scheduler.markProcessed(id);
    }
  }
}