import { Module } from '@nestjs/common';
import { ApiTransportModule } from '@rsconnect/transports';
import { ApiWorker } from './api.worker';
import { DataProviderModule } from '../../data-providers/data-provider.module';

@Module({
  imports: [ApiTransportModule, DataProviderModule],
  providers: [ApiWorker],
  exports: [ApiWorker],
})
export class ApiWorkerModule {}
