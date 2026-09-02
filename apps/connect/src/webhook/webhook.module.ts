import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { PrismaModule } from '@rumsan/prisma';
import { BroadcastModule } from '../broadcast/broadcast.module';
import { AdnSmsStatusService } from './adn-sms-status.service';
import { AdnSmsStatusWorker } from './adn-sms-status.worker';
import { SESSION_WEBHOOK_QUEUE } from './session-webhook.queue';
import { SessionWebhookService } from './session-webhook.service';
import { SessionWebhookWorker } from './session-webhook.worker';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

@Module({
  imports: [
    PrismaModule,
    BroadcastModule,
    BullModule.registerQueue({ name: SESSION_WEBHOOK_QUEUE }),
  ],
  controllers: [WebhookController],
  providers: [
    WebhookService,
    AdnSmsStatusService,
    AdnSmsStatusWorker,
    SessionWebhookService,
    SessionWebhookWorker,
  ],
})
export class WebhookModule {}
