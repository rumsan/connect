import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { QUEUES } from '@rumsan/connect';
import { BroadcastController } from './broadcast.controller';
import { BroadcastService } from './broadcast.service';
import { RabbitMQModule } from '../queues/queue.module';
import { QueueService } from '../queues/queue.service';

@Module({
  imports: [
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
    RabbitMQModule,
  ],
  controllers: [BroadcastController],
  providers: [BroadcastService, QueueService],
})
export class BroadcastModule { }
