import { Module } from '@nestjs/common';
import { BroadcastLogService } from './broadcast-log.service';
import { BroadcastLogController } from './broadcast-log.controller';
import { BroadcastLogQueue } from './broadcast-log.queue';
import { BroadcastService } from '../broadcast/broadcast.service';
import { TemplateModule } from '../template/template.module';

@Module({
  imports: [TemplateModule],
  controllers: [BroadcastLogController],
  providers: [BroadcastLogService, BroadcastLogQueue, BroadcastService],
  exports: [BroadcastLogService, BroadcastLogQueue],
})
export class BroadcastLogModule {}
