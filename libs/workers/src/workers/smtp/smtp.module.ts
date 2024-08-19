import { Module } from '@nestjs/common';
import { QueueModule } from '@rsconnect/queue';
import { SmtpTransportModule } from '@rsconnect/transports';
import { DataProviderModule } from '../../data-providers/data-provider.module';
import { SmtpWorker } from './smtp.worker';

@Module({
  imports: [SmtpTransportModule, DataProviderModule, QueueModule],
  providers: [SmtpWorker],
  exports: [SmtpWorker],
})
export class SmtpWorkerModule {}
