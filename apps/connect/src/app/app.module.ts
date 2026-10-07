import { BullModule } from '@nestjs/bull';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LogStreamModule } from '@rsconnect/log-stream';
import { QueueModule } from '@rsconnect/queue';
import {
  AmqpModule,
  ApiWorkerModule,
  DataProviderModule,
  EchoWorkerModule,
  SmtpWorkerModule,
} from '@rsconnect/workers';
import { RumsanAppModule } from '@rumsan/app';
import { EXCHANGES, QUEUES } from '@rumsan/connect';
import { PrismaModule } from '@rumsan/prisma';
import amqp from 'amqp-connection-manager';
import { Channel } from 'amqplib';
import { BroadcastModule } from '../broadcast/broadcast.module';
import { BroadcastLogModule } from '../broadcastLog/broadcast-log.module';
import { QueueModule as LocalQueueModule } from '../queues/queue.module';
import { SessionModule } from '../session/session.module';
import { TemplateModule } from '../template/template.module';
import { TransportModule } from '../transport/transport.module';
import { UsageModule } from '../usage/usage.module';
import { WebhookModule } from '../webhook/webhook.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    RumsanAppModule,
    LogStreamModule,
    PrismaModule,
    SessionModule,
    TransportModule,
    BroadcastModule,
    BroadcastLogModule,
    TemplateModule,
    QueueModule,
    WebhookModule,
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
        const amqpUrl = configService.get('AMQP_URL');
        const logger = new Logger('AMQP');
        let amqpHost = 'unknown';
        try {
          const u = new URL(amqpUrl);
          amqpHost = `${u.hostname}:${u.port || 5672}${u.pathname}`;
        } catch {}

        logger.log(`Connecting to RabbitMQ at ${amqpHost}...`);
        const connection = amqp.connect(amqpUrl);
        connection.on('connect', () =>
          logger.log(`Connected to RabbitMQ at ${amqpHost}`),
        );
        connection.on('connectFailed', ({ err }) =>
          logger.error(
            `Failed to connect to RabbitMQ at ${amqpHost}: ${err?.message}`,
          ),
        );
        connection.on('disconnect', ({ err }) =>
          logger.warn(
            `Disconnected from RabbitMQ at ${amqpHost}: ${err?.message}`,
          ),
        );
        connection.on('blocked', ({ reason }) =>
          logger.error(`RabbitMQ blocked publishing: ${reason}`),
        );
        connection.on('unblocked', () =>
          logger.log('RabbitMQ unblocked publishing'),
        );

        const channel = connection.createChannel({
          setup: async (channel: Channel) => {
            // Routes batches to one specific worker; workers declare and bind
            // their own queues to it.
            await channel.assertExchange(EXCHANGES.TRANSPORT, 'topic', {
              durable: true,
            });
            await channel.assertQueue(QUEUES.TRANSPORT_API, { durable: true });
            await channel.assertQueue(QUEUES.TRANSPORT_SMTP, { durable: true });
            await channel.assertQueue(QUEUES.TRANSPORT_VOICE, {
              durable: true,
            });
            await channel.assertQueue(QUEUES.TO_CONNECT, { durable: true });
          },
        });
        channel.on('connect', () => logger.log('RabbitMQ channel ready'));
        channel.on('error', (err) =>
          logger.error(`RabbitMQ channel error: ${err?.message}`),
        );
        channel.on('close', () => logger.warn('RabbitMQ channel closed'));
        return channel;
      },
    }),
    LocalQueueModule,
    DataProviderModule.forRootAsync('prisma'),
    ApiWorkerModule,
    EchoWorkerModule,
    SmtpWorkerModule,
    UsageModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
