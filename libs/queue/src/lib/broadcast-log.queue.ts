import { Inject, Injectable, Logger } from '@nestjs/common';
import { QUEUE_ACTIONS, QUEUES } from '@rumsan/connect';
import {
  QueueBroadcastLog,
  QueueBroadcastLogDetails,
  QueueBroadcastLogVoice,
  QueueBroadcastLogVoiceDetails,
  QueueJobData,
} from '@rumsan/connect/types';
import { ChannelWrapper } from 'amqp-connection-manager';

@Injectable()
export class BroadcastLogQueue {
  private readonly logger = new Logger(BroadcastLogQueue.name);
  constructor(
    @Inject('AMQP_CONNECTION')
    private readonly _channel: ChannelWrapper,
  ) {}

  async add(data: QueueBroadcastLog) {
    try {
      const queueJob: QueueJobData<QueueBroadcastLog> = {
        action: QUEUE_ACTIONS.BROADCAST_LOG_UPDATE,
        data,
      };

      return this._channel.sendToQueue(
        QUEUES.TO_CONNECT,
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

  addVoice(data: QueueBroadcastLogVoice) {
    return this.add(data);
  }

  async updateDetails(data: QueueBroadcastLogDetails) {
    try {
      const queueJob: QueueJobData<QueueBroadcastLogDetails> = {
        action: QUEUE_ACTIONS.BROADCAST_LOG_DETAILS,
        data,
      };

      return this._channel.sendToQueue(
        QUEUES.TO_CONNECT,
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

  async updateDetailsVoice(data: QueueBroadcastLogVoiceDetails) {
    return this.updateDetails(data);
  }
}
