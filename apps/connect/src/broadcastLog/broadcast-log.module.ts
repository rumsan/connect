import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { QUEUES } from '@rumsan/connect';
import { BroadcastService } from '../broadcast/broadcast.service';
import { RedisZsetSchedulerService } from '../broadcast/redis-zset-scheduler.service';
import { RedisZsetSchedulerWorker } from '../broadcast/redis-zset-scheduler.worker';
import { ScheduledWindowWorker } from '../broadcast/scheduled-window.worker';
import { ScheduleProcessor } from '../processors/schedule.processor';
import { BroadcastLogController } from './broadcast-log.controller';
import { BroadcastLogQueue } from './broadcast-log.queue';
import { BroadcastLogService } from './broadcast-log.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUES.SCHEDULED,
    }),
  ],
  controllers: [BroadcastLogController],
  providers: [
    BroadcastLogService,
    BroadcastLogQueue,
    BroadcastService,
    ScheduleProcessor,
    RedisZsetSchedulerService,
    RedisZsetSchedulerWorker,
    ScheduledWindowWorker,
  ],
  exports: [BroadcastLogService, BroadcastLogQueue],
})
export class BroadcastLogModule {}
