import { Module } from '@nestjs/common';
import { ApiProvider } from '../../data-providers/api.provider';
import { EchoWorker } from './echo.worker';

@Module({
  providers: [ApiProvider, EchoWorker],
  exports: [EchoWorker],
})
export class EchoWorkerModule {}
