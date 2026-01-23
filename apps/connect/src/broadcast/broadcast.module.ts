import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { QUEUES } from '@rumsan/connect';
import { TemplateModule } from '../template/template.module';
import { QueueModule } from '../queues/queue.module';
import { BroadcastController } from './broadcast.controller';
import { BroadcastService } from './broadcast.service';

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
    QueueModule,
    TemplateModule,
  ],
  controllers: [BroadcastController],
  providers: [BroadcastService],
})
export class BroadcastModule {}
