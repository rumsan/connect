import { Inject, OnModuleInit } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { QUEUE_ACTIONS, QUEUES } from '@rumsan/connect';
import {
  Broadcast,
  BroadcastStatus,
  QueueBroadcastJobData,
  QueueBroadcastLog,
  QueueJobData,
  Session,
} from '@rumsan/connect/types';
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
        await channel.consume(this.TransportQueue, async (message) => {
          if (message) {
            const job: QueueJobData<unknown> = JSON.parse(
              message.content.toString(),
            );

            if (job.action === QUEUE_ACTIONS.READINESS_CHECK) {
              const data = job.data as { sessionCuid: string };
              this._makeTransportReady(data.sessionCuid).then();
            }

            if (job.action === QUEUE_ACTIONS.BROADCAST) {
              this._sendBroadcast(job.data as QueueBroadcastJobData).then();
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
    await channel.assertQueue(QUEUES.LOG_BROADCAST, { durable: true });
    await channel.assertQueue(this.TransportQueue, { durable: true });
  }

  private _addToLogQueue<T>(action: QUEUE_ACTIONS, data: T) {
    return this.channel.sendToQueue(
      QUEUES.LOG_BROADCAST,
      Buffer.from(JSON.stringify({ action, data })),
      {
        persistent: true,
      },
    );
  }

  private async _makeTransportReady(sessionCuid: string) {
    const session: Session = await this.dataProvider.getSession(sessionCuid);
    const isTransportReady = await this.makeTransportReady(session);
    if (isTransportReady) {
      await this._addToLogQueue(QUEUE_ACTIONS.READINESS_CONFIRM, {
        sessionCuid,
      });
    }
  }

  private async _sendBroadcast(jobData: QueueBroadcastJobData) {
    const session: Session = await this.dataProvider.getSession(
      jobData.sessionId,
    );

    const broadcast: Broadcast = await this.dataProvider.getBroadcast(
      jobData.broadcastId,
    );

    const broadcastLog: QueueBroadcastLog = {
      cuid: jobData.broadcastLogId || createId(),
      broadcast: jobData.broadcastId,
      attempt: +jobData.attempt,
      status: BroadcastStatus.SUCCESS,
      queue: this.TransportQueue,
    };

    const result = await this.sendBroadcast({
      session,
      broadcast,
      jobData,
      broadcastLog,
    });
    if (result.sendLog) {
      setTimeout(async () => {
        await this._addToLogQueue<QueueBroadcastLog>(
          QUEUE_ACTIONS.BROADCAST_LOG_UPDATE,
          result.log,
        );
      }, 500);
    }
  }

  abstract sendBroadcast({
    session,
    broadcast,
    jobData,
    broadcastLog,
  }: {
    session: Session;
    broadcast: Broadcast;
    jobData: QueueBroadcastJobData;
    broadcastLog: QueueBroadcastLog;
  }): Promise<{ sendLog: boolean; log: QueueBroadcastLog }>;

  abstract makeTransportReady(session: Session): Promise<boolean>;
}
