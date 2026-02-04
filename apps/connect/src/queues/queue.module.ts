import { BullModule } from '@nestjs/bull';
import { Global, Module } from '@nestjs/common';
import { ApiTransportModule, SmtpTransportModule } from '@rsconnect/transports';
import { QUEUES } from '@rumsan/connect';
import { PrismaModule } from '@rumsan/prisma';
import { BroadcastService } from '../broadcast/broadcast.service';
import { RedisZsetSchedulerService } from '../broadcast/redis-zset-scheduler.service';
import { RedisZsetSchedulerWorker } from '../broadcast/redis-zset-scheduler.worker';
import { ScheduledWindowWorker } from '../broadcast/scheduled-window.worker';
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
    BullModule.registerQueue({
      name: QUEUES.SCHEDULED,
    }),
    TemplateModule,
  ],
  providers: [
    LogWorker,
    BroadcastService,
    BroadcastLogQueue,
    RedisZsetSchedulerService,
    RedisZsetSchedulerWorker,
    ScheduledWindowWorker,
  ],
})
export class QueueModule {}
