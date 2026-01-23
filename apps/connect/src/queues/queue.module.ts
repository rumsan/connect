import { Global, Module } from '@nestjs/common';
import { ApiTransportModule, SmtpTransportModule } from '@rsconnect/transports';
import { PrismaModule } from '@rumsan/prisma';
import { BroadcastService } from '../broadcast/broadcast.service';
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
    TemplateModule,
  ],
  providers: [LogWorker, BroadcastService, BroadcastLogQueue],
})
export class QueueModule {}
