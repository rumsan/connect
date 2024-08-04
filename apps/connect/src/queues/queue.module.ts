import { DynamicModule, Global, Module } from '@nestjs/common';
import { AsyncOptions } from '@rumsan/connect/types';
import { ApiTransportModule, SmtpTransportModule } from '@rsconnect/transports';
import { PrismaModule } from '@rumsan/prisma';
import { ChannelWrapper } from 'amqp-connection-manager';
import { BroadcastLogModule } from '../broadcastLog/broadcast-log.module';
import { EchoWorker } from './echo.worker';
import { LogWorker } from './log.worker';
import { QueueService } from './queue.service';
import { SmtpWorker } from './smtp.worker';
import { ApiWorker } from './api.worker';

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
  providers: [QueueService, EchoWorker, LogWorker, SmtpWorker, ApiWorker],
  exports: [QueueService],
})
export class RabbitMQModule {
  // static forRoot(connectionUrl: ConnectionUrl): DynamicModule {
  //   return {
  //     module: RabbitMQModule,
  //     providers: [
  //       {
  //         provide: 'AMQP_CONNECTION',
  //         useFactory: () => {
  //           const connection = amqp.connect(connectionUrl);
  //           return connection.createChannel({
  //             setup: (channel: Channel) => {
  //               channel.assertQueue(QUEUES.TRANSPORT_API, { durable: true });
  //               channel.assertQueue(QUEUES.TRANSPORT_SMTP, { durable: true });
  //               channel.assertQueue(QUEUES.TRANSPORT_VOICE, { durable: true });
  //               channel.assertQueue(QUEUES.TRANSPORT_API, { durable: true });
  //               channel.assertQueue(QUEUES.LOG_TRANSPORT, { durable: true });
  //             },
  //           });
  //         },
  //       },
  //     ],
  //     exports: ['AMQP_CONNECTION'],
  //   };
  // }

  static forRootAsync(options: AsyncOptions<ChannelWrapper>): DynamicModule {
    const ampqProvider = {
      provide: 'AMQP_CONNECTION',
      useFactory: options.useFactory,
      inject: options.inject || [],
    };

    return {
      module: RabbitMQModule,
      providers: [ampqProvider, EchoWorker],
      exports: [ampqProvider],
    };
  }
}
