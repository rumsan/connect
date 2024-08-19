import { Module } from '@nestjs/common';
import { QueueModule } from '@rsconnect/queue';
import { ApiTransportModule } from '@rsconnect/transports';
import { DataProviderModule } from '../../data-providers/data-provider.module';
import { ApiWorker } from './api.worker';

@Module({
  imports: [ApiTransportModule, DataProviderModule, QueueModule],
  providers: [ApiWorker],
  exports: [ApiWorker],
})
export class ApiWorkerModule {}
