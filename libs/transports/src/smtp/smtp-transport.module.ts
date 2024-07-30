import { Global, Module } from '@nestjs/common';
import { SmtpTransport } from './smtp.transport';

@Global()
@Module({
  providers: [SmtpTransport],
  exports: [SmtpTransport],
})
export class SmtpTransportModule {}
