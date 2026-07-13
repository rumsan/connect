import { Module } from '@nestjs/common';
import { PrismaModule } from '@rumsan/prisma';
import { BroadcastModule } from '../broadcast/broadcast.module';
import { AdnSmsStatusService } from './adn-sms-status.service';
import { AdnSmsStatusWorker } from './adn-sms-status.worker';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

@Module({
  imports: [PrismaModule, BroadcastModule],
  controllers: [WebhookController],
  providers: [WebhookService, AdnSmsStatusService, AdnSmsStatusWorker],
})
export class WebhookModule {}
