import { Module } from '@nestjs/common';
import { BroadcastLogService } from './broadcast-log.service';
import { BroadcastLogController } from './broadcast-log.controller';
import { QueueService } from '../queues/queue.service';
import { RabbitMQModule } from '../queues/queue.module';

@Module({
  //imports: [RabbitMQModule],
  controllers: [BroadcastLogController],
  providers: [BroadcastLogService],
  exports: [BroadcastLogService],
})
export class BroadcastLogModule {}
