import { Global, Module } from '@nestjs/common';
import { ApiWorkerModule } from './api/api.module';
import { EchoWorkerModule } from './echo/echo.module';
import { SmtpWorkerModule } from './smtp/smtp.module';

@Global()
@Module({
  imports: [ApiWorkerModule, EchoWorkerModule, SmtpWorkerModule],
})
export class WorkerModule {}
