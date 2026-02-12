import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueueModule } from '@rsconnect/queue';
import {
  AmqpModule,
  ApiWorkerModule,
  DataProviderModule,
  EchoWorkerModule,
  SmtpWorkerModule,
} from '@rsconnect/workers';
import { RumsanAppModule } from '@rumsan/app';
import { QUEUES } from '@rumsan/connect';
import { PrismaModule } from '@rumsan/prisma';
import amqp from 'amqp-connection-manager';
import { Channel } from 'amqplib';
import { BroadcastModule } from '../broadcast/broadcast.module';
import { BroadcastLogModule } from '../broadcastLog/broadcast-log.module';
import { QueueModule as LocalQueueModule } from '../queues/queue.module';
import { SessionModule } from '../session/session.module';
import { TemplateModule } from '../template/template.module';
import { TransportModule } from '../transport/transport.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RumsanAppModule,
    PrismaModule,
    SessionModule,
    TransportModule,
    BroadcastModule,
    BroadcastLogModule,
    TemplateModule,
    QueueModule,

    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST'),
          port: +configService.get('REDIS_PORT'),
          password: configService.get('REDIS_PASSWORD'),
        },
        defaultJobOptions: {
          removeOnComplete: 20,
          removeOnFail: 200,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      }),
    }),

    AmqpModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const connection = amqp.connect(configService.get('AMQP_URL'));
        return connection.createChannel({
          setup: (channel: Channel) => {
            channel.assertQueue(QUEUES.TRANSPORT_API, { durable: true });
            channel.assertQueue(QUEUES.TRANSPORT_SMTP, { durable: true });
            channel.assertQueue(QUEUES.TRANSPORT_VOICE, { durable: true });
            channel.assertQueue(QUEUES.TO_CONNECT, { durable: true });
          },
        });
      },
    }),
    LocalQueueModule,
    DataProviderModule.forRootAsync('prisma'),
    ApiWorkerModule,
    EchoWorkerModule,
    SmtpWorkerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
