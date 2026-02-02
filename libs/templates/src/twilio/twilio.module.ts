import { Module } from '@nestjs/common';
import { TwilioWhatsAppTemplateProvider } from './twilio-template.provider';
import { TemplateHttpClientService } from '../utils/http-client.service';

@Module({
  providers: [TwilioWhatsAppTemplateProvider, TemplateHttpClientService],
  exports: [TwilioWhatsAppTemplateProvider],
})
export class TwilioTemplateModule {}
