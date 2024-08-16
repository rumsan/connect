import { Inject, Injectable, Logger } from '@nestjs/common';
import { QUEUE_ACTIONS, QUEUES } from '@rumsan/connect';
import { QueueBroadcastJobData, QueueJobData } from '@rumsan/connect/types';
import { ChannelWrapper } from 'amqp-connection-manager';

@Injectable()
export class QueueService {
  constructor(
    @Inject('AMQP_CONNECTION')
    private readonly _channel: ChannelWrapper,
  ) {}

  async queueTransportReadiness(queue: QUEUES, data: { sessionCuid: string }) {
    const queueJob: QueueJobData<{ sessionCuid: string }> = {
      action: QUEUE_ACTIONS.READINESS_CHECK,
      data,
    };

    const result = await this._channel.sendToQueue(
      queue,
      Buffer.from(JSON.stringify(queueJob)),
      {
        persistent: true,
        timeout: 1000,
      },
    );
    return result;
  }

  async queueBroadcast(queue: QUEUES, data: QueueBroadcastJobData) {
    const queueJob: QueueJobData<QueueBroadcastJobData> = {
      action: QUEUE_ACTIONS.BROADCAST,
      data,
    };

    const result = await this._channel.sendToQueue(
      queue,
      Buffer.from(JSON.stringify(queueJob)),
      {
        persistent: true,
        timeout: 1000,
      },
    );
    return result;
  }

  async queueBroadcastInBulk(queue: QUEUES, data: QueueBroadcastJobData[]) {
    try {
      for (const item of data) {
        const queueJob: QueueJobData<QueueBroadcastJobData> = {
          action: QUEUE_ACTIONS.BROADCAST,
          data: item,
        };
        await this._channel.sendToQueue(
          queue,
          Buffer.from(JSON.stringify(queueJob)),
          {
            persistent: true,
          },
        );
      }
    } catch (error) {
      Logger.log('Error adding to queue');
    }
  }
}
