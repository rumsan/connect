import { Module } from '@nestjs/common';
import { BroadcastLogService } from './broadcast-log.service';
import { BroadcastLogController } from './broadcast-log.controller';

@Module({
  controllers: [BroadcastLogController],
  providers: [BroadcastLogService],
  exports: [BroadcastLogService],
})
export class BroadcastLogModule {}
