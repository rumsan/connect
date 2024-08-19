import { Inject, Injectable, Logger } from '@nestjs/common';
import { QUEUE_ACTIONS, QUEUES } from '@rumsan/connect';
import { QueueBroadcastJobData, QueueJobData } from '@rumsan/connect/types';
import { ChannelWrapper } from 'amqp-connection-manager';

@Injectable()
export class BroadcastQueue {
  private readonly logger = new Logger(BroadcastQueue.name);
  constructor(
    @Inject('AMQP_CONNECTION')
    private readonly _channel: ChannelWrapper,
  ) {}

  async broadcast(queue: QUEUES, data: QueueBroadcastJobData) {
    try {
      const queueJob: QueueJobData<QueueBroadcastJobData> = {
        action: QUEUE_ACTIONS.BROADCAST,
        data,
      };

      return this._channel.sendToQueue(
        queue,
        Buffer.from(JSON.stringify(queueJob)),
        {
          persistent: true,
          timeout: 1000,
        },
      );
    } catch (error) {
      this.logger.error(error);
    }
    return false;
  }

  async broadcastBulk(queue: QUEUES, data: QueueBroadcastJobData[]) {
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
      this.logger.error(error);
    }
  }
}
