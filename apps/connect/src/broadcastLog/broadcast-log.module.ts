import { Module } from '@nestjs/common';
import { BroadcastLogService } from './broadcast-log.service';
import { BroadcastLogController } from './broadcast-log.controller';
import { BroadcastLogQueue } from './broadcast-log.queue';

@Module({
  controllers: [BroadcastLogController],
  providers: [BroadcastLogService, BroadcastLogQueue],
  exports: [BroadcastLogService, BroadcastLogQueue],
})
export class BroadcastLogModule {}
