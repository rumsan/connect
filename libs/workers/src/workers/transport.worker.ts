import { Inject, OnModuleInit } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { QUEUES } from '@rsconnect/sdk';
import {
  Broadcast,
  BroadcastStatus,
  QueueBroadcastJobData,
  QueueBroadcastLog,
  QueueJobData,
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
    protected readonly channel: ChannelWrapper,
  ) {}

  public async onModuleInit() {
    try {
      await this.channel.addSetup(async (channel: ConfirmChannel) => {
        await this.assertQueue(channel);
        await channel.consume(QUEUES.READY_TRANSPORT, async (message) => {
          if (message) {
            const content: QueueJobData<{ sessionId: string }> = JSON.parse(
              message.content.toString(),
            );
            console.log(content.name as QUEUES);
            //this._makeTransportReady(content.data.sessionId);
            // await this.dataProvider.updateSessionStatus(
            //   content.data.sessionId,
            //   'READY',
            // );
            channel.ack(message);
          }
        });
        await channel.consume(this.TransportQueue, async (message) => {
          if (message) {
            const content: QueueJobData<QueueBroadcastJobData> = JSON.parse(
              message.content.toString(),
            );

            const broadcastLog = await this._process(content.data);
            if (broadcastLog !== null) {
              await this.addToLogQueue<QueueBroadcastLog>(broadcastLog);
            }
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
    await channel.assertQueue(QUEUES.READY_TRANSPORT, { durable: true });
    await channel.assertQueue(this.TransportQueue, { durable: true });
  }

  addToLogQueue<T>(data: T) {
    return this.channel.sendToQueue(
      QUEUES.LOG_TRANSPORT,
      Buffer.from(JSON.stringify({ action: 'create', data })),
      {
        persistent: true,
      },
    );
  }

  private async _makeTransportReady(sessionId: string) {
    console.log('session', sessionId);
  }

  private async _process(
    jobData: QueueBroadcastJobData,
  ): Promise<QueueBroadcastLog | null> {
    const session: Session = await this.dataProvider.getSession(
      jobData.sessionId,
    );
    const broadcast: Broadcast = await this.dataProvider.getBroadcast(
      jobData.broadcastId,
    );

    const broadcastLog: QueueBroadcastLog = {
      cuid: createId(),
      broadcast: jobData.broadcastId,
      attempt: +jobData.attempt + 1,
      status: BroadcastStatus.SUCCESS,
      queue: this.TransportQueue,
    };

    return this.process({ session, broadcast, jobData, broadcastLog });
  }

  abstract process({
    session,
    broadcast,
    jobData,
    broadcastLog,
  }: {
    session: Session;
    broadcast: Broadcast;
    jobData: QueueBroadcastJobData;
    broadcastLog: QueueBroadcastLog;
  }): Promise<QueueBroadcastLog | null>;
}
