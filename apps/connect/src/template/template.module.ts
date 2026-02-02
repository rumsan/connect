import { Module } from '@nestjs/common';
import {
  TemplateHttpClientService,
  TemplateProviderFactory,
  TemplateSyncService,
  TemplateVerificationService,
} from '@rsconnect/templates';
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
  ],
  exports: [
    TemplateService,
    TemplateVerificationService,
    TemplateProviderFactory,
    TemplateSyncService,
  ],
})
export class TemplateModule {}
