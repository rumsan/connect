import { Inject, OnModuleInit } from '@nestjs/common';
import { BatchManger, TransportQueue } from '@rsconnect/queue';
import { QUEUE_ACTIONS, QUEUES } from '@rumsan/connect';
import {
  Broadcast,
  BroadcastJobData,
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
  abstract queueTransport: QUEUES;
  protected batchManager: BatchManger;

  constructor(
    @Inject('IDataProvider')
    protected readonly dataProvider: IDataProvider,
    @Inject('AMQP_CONNECTION')
    protected readonly channel: ChannelWrapper,
    protected readonly transportQueue: TransportQueue,
  ) {
    this.batchManager = new BatchManger(this.transportQueue);
  }

  public async onModuleInit() {
    try {
      await this.channel.addSetup(async (channel: ConfirmChannel) => {
        await this.assertQueue(channel);

        await channel.consume(
          this.queueTransport,
          async (message) => {
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
          },
          {},
        );
      });
    } catch (err) {
      console.error('Error starting the consumer:', err);
    }
  }

  async assertQueue(channel: ConfirmChannel) {
    await channel.assertQueue(QUEUES.TO_CONNECT, {
      durable: true,
    });
    await channel.assertQueue(this.queueTransport, {
      durable: true,
    });
  }

  private async _makeTransportReady(sessionCuid: string) {
    const session: Session = await this.dataProvider.getSession(sessionCuid);
    const isTransportReady = await this.makeTransportReady(session);
    if (isTransportReady) {
      await this.transportQueue.confirmReadiness({
        sessionCuid,
        maxBatchSize: this.batchManager.batchSize,
      });
    }
  }

  private async _sendBroadcast(jobData: QueueBroadcastJobData) {
    const session: Session = await this.dataProvider.getSession(
      jobData.sessionId,
    );

    for (const job of jobData.broadcasts) {
      const broadcastLog: QueueBroadcastLog = {
        broadcastLogId: job.broadcastLogId,
        broadcastId: job.broadcastId,
        sessionId: jobData.sessionId,
        attempt: job.attempt,
        status: BroadcastStatus.SUCCESS,
        queue: this.queueTransport,
      };

      this.batchManager.startMonitoring(broadcastLog);
    }

    for (const job of jobData.broadcasts) {
      const broadcast: Broadcast = await this.dataProvider.getBroadcast(
        job.broadcastId,
      );

      const broadcastLog: QueueBroadcastLog = {
        broadcastLogId: job.broadcastLogId,
        broadcastId: job.broadcastId,
        sessionId: jobData.sessionId,
        attempt: job.attempt,
        status: BroadcastStatus.SUCCESS,
        queue: this.queueTransport,
      };

      await this.sendBroadcast({
        session,
        broadcast,
        broadcastJob: job,
        broadcastLog,
      });
    }

    // const broadcast: Broadcast = await this.dataProvider.getBroadcast(
    //   jobData.broadcastId,
    // );

    // const broadcastLog: QueueBroadcastLog = {
    //   broadcastLogId: jobData.broadcastLogId || createId(),
    //   broadcastId: jobData.broadcastId,
    //   sessionId: jobData.sessionId,
    //   attempt: jobData.attempt,
    //   status: BroadcastStatus.SUCCESS,
    //   queue: this.queueTransport,
    // };
    // this.batchManager.startMonitoring(broadcastLog);

    // await this.sendBroadcast({
    //   session,
    //   broadcast,
    //   jobData,
    //   broadcastLog,
    // });
  }

  abstract sendBroadcast({
    session,
    broadcast,
    broadcastJob,
    broadcastLog,
  }: {
    session: Session;
    broadcast: Broadcast;
    broadcastJob: BroadcastJobData;
    broadcastLog: QueueBroadcastLog;
  }): Promise<QueueBroadcastLog>;

  abstract makeTransportReady(session: Session): Promise<boolean>;
}
