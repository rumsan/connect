import { BullModule } from '@nestjs/bull';
import { Global, Module } from '@nestjs/common';
import { ApiTransportModule, SmtpTransportModule } from '@rsconnect/transports';
import { QUEUES } from '@rumsan/connect';
import { PrismaModule } from '@rumsan/prisma';
import { BroadcastModule } from '../broadcast/broadcast.module';
import { BroadcastLogModule } from '../broadcastLog/broadcast-log.module';
import { BroadcastLogQueue } from '../broadcastLog/broadcast-log.queue';
import { TemplateModule } from '../template/template.module';
import { LogWorker } from './log.worker';

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
    BroadcastModule,
    BullModule.registerQueue({
      name: QUEUES.SCHEDULED,
    }),
    TemplateModule,
  ],
  providers: [
    LogWorker,
    BroadcastLogQueue,
  ],
})
export class QueueModule {}
