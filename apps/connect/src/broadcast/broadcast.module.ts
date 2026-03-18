import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { QUEUES } from '@rumsan/connect';
import {
  TWILIO_BATCHING_BROADCAST_PORT,
  TwilioBatchingService,
  TwilioBatchingWorker,
} from '@rsconnect/transports';
import { TemplateModule } from '../template/template.module';
import { BroadcastValidationService } from './broadcast-validation.service';
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
    TemplateModule,
  ],
  controllers: [BroadcastController],
  providers: [
    BroadcastService,
    {
      provide: TWILIO_BATCHING_BROADCAST_PORT,
      useExisting: BroadcastService,
    },
    BroadcastValidationService,
    RedisZsetSchedulerService,
    RedisZsetSchedulerWorker,
    ScheduledWindowWorker,
    TwilioBatchingService,
    TwilioBatchingWorker,
  ],
  exports: [
    BroadcastService,
    BroadcastValidationService,
    RedisZsetSchedulerService,
    RedisZsetSchedulerWorker,
    ScheduledWindowWorker,
    TwilioBatchingService,
  ],
})
export class BroadcastModule {}
