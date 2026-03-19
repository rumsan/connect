import { Module } from '@nestjs/common';
import { PrismaModule } from '@rumsan/prisma';
import { BroadcastModule } from '../broadcast/broadcast.module';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

@Module({
  imports: [PrismaModule, BroadcastModule],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
