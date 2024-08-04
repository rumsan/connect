import { Global, Module } from '@nestjs/common';
import { ApiTransportModule, SmtpTransportModule } from '@rsconnect/transports';
import { PrismaModule } from '@rumsan/prisma';
import { BroadcastLogModule } from '../broadcastLog/broadcast-log.module';
import { LogWorker } from './log.worker';
import { QueueService } from './queue.service';

export type ampqConfig = {
  url: string;
};

@Global()
@Module({
  imports: [
    BroadcastLogModule,
    PrismaModule,
    SmtpTransportModule,
    ApiTransportModule,
  ],
  providers: [QueueService, LogWorker],
  exports: [QueueService],
})
export class QueueModule {}
