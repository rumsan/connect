import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { QUEUES } from '@rumsan/connect';
import { BroadcastModule } from '../broadcast/broadcast.module';
import { ScheduleProcessor } from '../processors/schedule.processor';
import { TemplateModule } from '../template/template.module';
import { BroadcastLogController } from './broadcast-log.controller';
import { BroadcastLogQueue } from './broadcast-log.queue';
import { BroadcastLogService } from './broadcast-log.service';

@Module({
  imports: [
    TemplateModule,
    BroadcastModule,
    BullModule.registerQueue({
      name: QUEUES.SCHEDULED,
    }),
  ],
  controllers: [BroadcastLogController],
  providers: [
    BroadcastLogService,
    BroadcastLogQueue,
    ScheduleProcessor,
  ],
  exports: [BroadcastLogService, BroadcastLogQueue],
})
export class BroadcastLogModule {}
