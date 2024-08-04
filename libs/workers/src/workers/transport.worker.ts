import { Inject, OnModuleInit } from '@nestjs/common';
import { QUEUES } from '@rsconnect/sdk';
import {
  QueueBroadcastJob,
  QueueBroadcastJobData,
  QueueBroadcastLog,
  Session,
} from '@rsconnect/sdk/types';
import { ChannelWrapper } from 'amqp-connection-manager';
import { ConfirmChannel } from 'amqplib';
import { IDataProvider } from '../data-providers/data-provider.interface';

export abstract class TransportWorker implements OnModuleInit {
  abstract TransportQueue: QUEUES;
  constructor(
    @Inject('IDataProvider')
    protected readonly dataProvider: IDataProvider,
    @Inject('AMQP_CONNECTION')
    protected readonly channel: ChannelWrapper
  ) {}

  public async onModuleInit() {
    try {
      await this.channel.addSetup(async (channel: ConfirmChannel) => {
        await this.assertQueue(channel);
        await channel.consume(this.TransportQueue, async (message) => {
          if (message) {
            const content: QueueBroadcastJob = JSON.parse(
              message.content.toString()
            );

            const broadcastLog = await this._process(content.data);
            await this.addToLogQueue<QueueBroadcastLog>(broadcastLog);
            channel.ack(message);
          }
        });
      });
    } catch (err) {
      console.error('Error starting the consumer:', err);
    }
  }

  async assertQueue(channel: ConfirmChannel) {
    await channel.assertQueue(QUEUES.LOG_TRANSPORT, { durable: true });
    await channel.assertQueue(this.TransportQueue, { durable: true });
  }

  addToLogQueue<T>(data: T) {
    return this.channel.sendToQueue(
      QUEUES.LOG_TRANSPORT,
      Buffer.from(JSON.stringify(data)),
      {
        persistent: true,
      }
    );
  }

  private async _process(
    data: QueueBroadcastJobData
  ): Promise<QueueBroadcastLog> {
    const session: Session = await this.dataProvider.getSession(data.sessionId);
    return this.process(session, data);
  }

  abstract process(
    session: Session,
    data: QueueBroadcastJobData
  ): Promise<QueueBroadcastLog>;
}
