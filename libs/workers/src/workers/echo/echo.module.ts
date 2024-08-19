import { Module } from '@nestjs/common';
import { QueueModule } from '@rsconnect/queue';
import { DataProviderModule } from '../../data-providers/data-provider.module';
import { EchoWorker } from './echo.worker';

@Module({
  imports: [DataProviderModule, QueueModule],
  providers: [EchoWorker],
  exports: [EchoWorker],
})
export class EchoWorkerModule {}
