import { Module } from '@nestjs/common';
import { ApiTransportModule } from '@rsconnect/transports';
import { ApiProvider } from '../../data-providers/api.provider';
import { ApiWorker } from './api.worker';

@Module({
  imports: [ApiTransportModule],
  providers: [ApiProvider, ApiWorker],
  exports: [ApiWorker],
})
export class ApiWorkerModule {}
