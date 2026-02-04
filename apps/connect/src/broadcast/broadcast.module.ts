import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { QUEUES } from '@rumsan/connect';
import { TemplateModule } from '../template/template.module';
import { QueueModule } from '../queues/queue.module';
import { BroadcastController } from './broadcast.controller';
import { BroadcastService } from './broadcast.service';
import { RedisZsetSchedulerService } from './redis-zset-scheduler.service';
import { RedisZsetSchedulerWorker } from './redis-zset-scheduler.worker';
import { ScheduledWindowWorker } from './scheduled-window.worker';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.registerQueue({
      name: QUEUES.TRANSPORT_API,
    }),
    BullModule.registerQueue({
      name: QUEUES.TRANSPORT_ECHO,
    }),
    BullModule.registerQueue({
      name: QUEUES.TRANSPORT_SMTP,
    }),
    BullModule.registerQueue({
      name: QUEUES.TRANSPORT_VOICE,
    }),
    BullModule.registerQueue({
      name: QUEUES.SCHEDULED,
    }),
    QueueModule,
    TemplateModule,
  ],
  controllers: [BroadcastController],
  providers: [
    BroadcastService,
    RedisZsetSchedulerService,
    RedisZsetSchedulerWorker,
    ScheduledWindowWorker,
  ],
})
export class BroadcastModule {}
