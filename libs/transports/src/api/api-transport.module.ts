import { Global, Module } from '@nestjs/common';
import { ApiTransport } from './api.transport';

@Global()
@Module({
  providers: [ApiTransport],
  exports: [ApiTransport],
})
export class ApiTransportModule {}
