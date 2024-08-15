import { Inject, Injectable, Logger } from '@nestjs/common';
import { QUEUES } from '@rsconnect/sdk';
import { QueueBroadcastJobData, QueueJobData } from '@rsconnect/sdk/types';
import { ChannelWrapper } from 'amqp-connection-manager';

@Injectable()
export class QueueService {
  constructor(
    @Inject('AMQP_CONNECTION')
    private readonly _channel: ChannelWrapper,
  ) {}

  async queueTransportReadiness(queue: QUEUES, data: { sessionId: string }) {
    const queueJob: QueueJobData<{ sessionId: string }> = {
      name: queue,
      data,
    };

    const result = await this._channel.sendToQueue(
      QUEUES.READY_TRANSPORT,
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
      name: 'broadcast',
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
          name: 'broadcast',
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
