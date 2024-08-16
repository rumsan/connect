import { Global, Module } from '@nestjs/common';
import { ApiTransportModule, SmtpTransportModule } from '@rsconnect/transports';
import { PrismaModule } from '@rumsan/prisma';
import { BroadcastLogModule } from '../broadcastLog/broadcast-log.module';
import { BroadcastLogQueue } from '../broadcastLog/broadcast-log.queue';
import { LogWorker } from './log.worker';
import { QueueService } from './queue.service';
import { BroadcastService } from '../broadcast/broadcast.service';

export type ampqConfig = {
  url: string;
};

@Global()
@Module({
  imports: [
    PrismaModule,
    SmtpTransportModule,
    ApiTransportModule,
    BroadcastLogModule,
  ],
  providers: [QueueService, LogWorker, BroadcastService, BroadcastLogQueue],
  exports: [QueueService],
})
export class QueueModule {}
