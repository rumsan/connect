import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  EXCHANGES,
  QUEUE_ACTIONS,
  QUEUES,
  workerRoutingKey,
} from '@rumsan/connect';
import { QueueBroadcastJobData, QueueJobData } from '@rumsan/connect/types';
import { ChannelWrapper } from 'amqp-connection-manager';
import { transportSlugFromQueue } from './transport-slug';

@Injectable()
export class BroadcastQueue {
  private readonly logger = new Logger(BroadcastQueue.name);
  constructor(
    @Inject('AMQP_CONNECTION')
    private readonly _channel: ChannelWrapper,
  ) {}

  /**
   * Hand a claimed batch to the one worker that asked for it. The rows in
   * `data.broadcasts` are already owned by that worker in the DB, so this
   * message must not be allowed to reach any other consumer.
   */
  async broadcastToWorker(
    queue: QUEUES,
    workerId: string,
    data: QueueBroadcastJobData,
  ) {
    try {
      const queueJob: QueueJobData<QueueBroadcastJobData> = {
        action: QUEUE_ACTIONS.BROADCAST,
        data,
      };

      return await this._channel.publish(
        EXCHANGES.TRANSPORT,
        workerRoutingKey(transportSlugFromQueue(queue), workerId),
        Buffer.from(JSON.stringify(queueJob)),
        { persistent: true, timeout: 1000 },
      );
    } catch (error) {
      this.logger.error(
        `broadcastToWorker failed for session ${data.sessionId} worker ${workerId}`,
        error,
      );
    }
    return false;
  }

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
