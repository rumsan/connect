import { Module } from '@nestjs/common';
import { ApiProvider } from '../../data-providers/api.provider';
import { SmtpWorker } from './smtp.worker';
import { SmtpTransportModule } from '@rsconnect/transports';

@Module({
  imports: [SmtpTransportModule],
  providers: [ApiProvider, SmtpWorker],
  exports: [SmtpWorker],
})
export class SmtpWorkerModule {}
