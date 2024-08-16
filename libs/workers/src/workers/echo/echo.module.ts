import { Module } from '@nestjs/common';
import { DataProviderModule } from '../../data-providers/data-provider.module';
import { EchoWorker } from './echo.worker';

@Module({
  imports: [DataProviderModule],
  providers: [EchoWorker],
  exports: [EchoWorker],
})
export class EchoWorkerModule {}
