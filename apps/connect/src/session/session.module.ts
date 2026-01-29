import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { QUEUES } from '@rumsan/connect';
import { BroadcastService } from '../broadcast/broadcast.service';
import { RedisZsetSchedulerService } from '../broadcast/redis-zset-scheduler.service';
import { RedisZsetSchedulerWorker } from '../broadcast/redis-zset-scheduler.worker';
import { ScheduledWindowWorker } from '../broadcast/scheduled-window.worker';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUES.SCHEDULED,
    }),
  ],
  controllers: [SessionController],
  providers: [SessionService, BroadcastService,
    RedisZsetSchedulerService,
    RedisZsetSchedulerWorker,
    ScheduledWindowWorker,

  ],
})
export class SessionModule {}
