import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import {
  TWILIO_BATCHING_BROADCAST_PORT,
  TwilioBatchingService,
  TwilioBatchingWorker,
} from '@rsconnect/transports';
import { QUEUES } from '@rumsan/connect';
import { SessionTimingService } from '../session/session-timing.service';
import { TemplateModule } from '../template/template.module';
import { WorkerRegistryModule } from '../workers/worker-registry.module';
import { BroadcastPriceWorker } from './broadcast-price.worker';
import { BroadcastReclaimWorker } from './broadcast-reclaim.worker';
import { BroadcastValidationService } from './broadcast-validation.service';
import { BroadcastController } from './broadcast.controller';
import { BroadcastService } from './broadcast.service';
import { RedisZsetSchedulerService } from './redis-zset-scheduler.service';
import { RedisZsetSchedulerWorker } from './redis-zset-scheduler.worker';
import { ScheduledWindowWorker } from './scheduled-window.worker';
import { SessionAssignmentService } from './session-assignment.service';

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
    WorkerRegistryModule,
  ],
  controllers: [BroadcastController],
  providers: [
    BroadcastService,
    SessionAssignmentService,
    BroadcastReclaimWorker,
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
    BroadcastPriceWorker,
    SessionTimingService,
  ],
  exports: [
    BroadcastService,
    SessionAssignmentService,
    SessionTimingService,
    BroadcastValidationService,
    RedisZsetSchedulerService,
    RedisZsetSchedulerWorker,
    ScheduledWindowWorker,
    TwilioBatchingService,
  ],
})
export class BroadcastModule {}
