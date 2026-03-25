import { Module } from '@nestjs/common';
import { TwilioWhatsAppTemplateProvider } from './twilio-template.provider';
import { TemplateHttpClientService } from '../utils/http-client.service';
import { TwilioService } from './twilio.service';

@Module({
  providers: [
    TwilioWhatsAppTemplateProvider,
    TemplateHttpClientService,
    TwilioService,
  ],
  exports: [TwilioWhatsAppTemplateProvider, TwilioService],
})
export class TwilioTemplateModule {}
