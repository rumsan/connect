import { Module } from '@nestjs/common';
import {
  TemplateHttpClientService,
  TemplateProviderFactory,
  TemplateSyncService,
  TemplateVerificationService,
} from '@rsconnect/templates';
import { TemplateApprovalWorker } from './template-approval.worker';
import { TemplateWebhookController } from './template-webhook.controller';
import { TemplateController } from './template.controller';
import { TemplateService } from './template.service';

@Module({
  controllers: [TemplateController, TemplateWebhookController],
  providers: [
    TemplateService,
    TemplateVerificationService,
    TemplateProviderFactory,
    TemplateHttpClientService,
    TemplateSyncService,
    TemplateApprovalWorker,
  ],
  exports: [
    TemplateService,
    TemplateVerificationService,
    TemplateProviderFactory,
    TemplateSyncService,
  ],
})
export class TemplateModule {}
