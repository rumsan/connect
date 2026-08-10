import { Inject, Injectable, Logger } from '@nestjs/common';
import { QUEUE_ACTIONS, QUEUES } from '@rumsan/connect';
import { QueueJobData } from '@rumsan/connect/types';
import { ChannelWrapper } from 'amqp-connection-manager';

@Injectable()
export class TransportQueue {
  private readonly logger = new Logger(TransportQueue.name);
  constructor(
    @Inject('AMQP_CONNECTION')
    private readonly _channel: ChannelWrapper,
  ) { }

  async checkReadiness(data: {
    transportToCheck: QUEUES;
    sessionCuid: string;
  }) {
    try {
      const queueJob: QueueJobData<{ sessionCuid: string }> = {
        action: QUEUE_ACTIONS.READINESS_CHECK,
        data,
      };

      return await this._channel.sendToQueue(
        data.transportToCheck,
        Buffer.from(JSON.stringify(queueJob)),
        {
          persistent: true,
          timeout: 1000,
        },
      );
    } catch (error) {
      this.logger.error(
        `checkReadiness publish failed for session ${data.sessionCuid}`,
        error,
      );
    }
    return false;
  }

  async notifySessionComplete(data: {
    transportQueue: QUEUES;
    sessionCuid: string;
  }) {
    try {
      const queueJob: QueueJobData<{ sessionCuid: string }> = {
        action: QUEUE_ACTIONS.SESSION_COMPLETE,
        data: { sessionCuid: data.sessionCuid },
      };
      this.logger.log(
        `Notifying session complete: ${data.sessionCuid} on ${data.transportQueue}`,
      );
      return await this._channel.sendToQueue(
        data.transportQueue,
        Buffer.from(JSON.stringify(queueJob)),
        {
          persistent: true,
          timeout: 1000,
        },
      );
    } catch (error) {
      this.logger.error(
        `notifySessionComplete publish failed for session ${data.sessionCuid}`,
        error,
      );
    }
    return false;
  }

  async confirmReadiness(data: { sessionCuid: string; maxBatchSize: number }) {
    try {
      const queueJob: QueueJobData<{
        sessionCuid: string;
        maxBatchSize: number;
      }> = {
        action: QUEUE_ACTIONS.READINESS_CONFIRM,
        data,
      };
      console.log('Confirming readiness for session:', data.sessionCuid);
      return await this._channel.sendToQueue(
        QUEUES.TO_CONNECT,
        Buffer.from(JSON.stringify(queueJob)),
        {
          persistent: true,
          timeout: 1000,
        },
      );
    } catch (error) {
      this.logger.error(
        `confirmReadiness publish failed for session ${data.sessionCuid}`,
        error,
      );
    }
    return false;
  }
}
