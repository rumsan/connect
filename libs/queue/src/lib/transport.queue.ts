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

      return this._channel.sendToQueue(
        data.transportToCheck,
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
}
