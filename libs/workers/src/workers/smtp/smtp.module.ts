import { Module } from '@nestjs/common';
import { SmtpWorker } from './smtp.worker';
import { SmtpTransportModule } from '@rsconnect/transports';
import { DataProviderModule } from '../../data-providers/data-provider.module';

@Module({
  imports: [SmtpTransportModule, DataProviderModule],
  providers: [SmtpWorker],
  exports: [SmtpWorker],
})
export class SmtpWorkerModule {}
