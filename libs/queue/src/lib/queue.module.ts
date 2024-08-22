import { DynamicModule, Global, Module } from '@nestjs/common';
import { AsyncOptions } from '@rumsan/connect/types';
import { ChannelWrapper } from 'amqp-connection-manager';
import { BatchManger } from './batch.manager';
import { BroadcastLogQueue } from './broadcast-log.queue';
import { BroadcastQueue } from './broadcast.queue';
import { TransportQueue } from './transport.queue';

@Global()
@Module({
  providers: [BroadcastQueue, BroadcastLogQueue, TransportQueue, BatchManger],
  exports: [BroadcastQueue, BroadcastLogQueue, TransportQueue, BatchManger],
})
export class QueueModule {
  static forRootAsync(options: AsyncOptions<ChannelWrapper>): DynamicModule {
    const ampqProvider = {
      provide: 'AMQP_CONNECTION',
      useFactory: options.useFactory,
      inject: options.inject || [],
    };

    return {
      module: QueueModule,
      providers: [ampqProvider],
      exports: [ampqProvider],
    };
  }
}
