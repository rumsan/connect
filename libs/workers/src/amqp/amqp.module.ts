import { DynamicModule, Global, Module } from '@nestjs/common';
import { AsyncOptions } from '@rumsan/connect/types';
import { ChannelWrapper } from 'amqp-connection-manager';

export type ampqConfig = {
  url: string;
};

@Global()
@Module({
  imports: [],
  providers: [],
  exports: [],
})
export class AmqpModule {
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
      module: AmqpModule,
      providers: [ampqProvider],
      exports: [ampqProvider],
    };
  }
}
