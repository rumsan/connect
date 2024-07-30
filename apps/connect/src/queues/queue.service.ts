import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { QUEUES } from '@rsconnect/sdk';
import { QueueBroadcastJob } from '@rsconnect/sdk/types';
import { ChannelWrapper } from 'amqp-connection-manager';

@Injectable()
export class QueueService {
  constructor(
    @Inject('AMQP_CONNECTION')
    private readonly _channel: ChannelWrapper
  ) {}

  async add(queue: QUEUES, data: QueueBroadcastJob) {
    const result = await this._channel.sendToQueue(
      queue,
      Buffer.from(JSON.stringify(data)),
      {
        persistent: true,
        timeout: 1000,
      }
    );
    return result;
  }

  async addBulk(queue: QUEUES, data: QueueBroadcastJob[]) {
    try {
      for (const item of data) {
        await this._channel.sendToQueue(
          queue,
          Buffer.from(JSON.stringify(item)),
          {
            persistent: true,
          }
        );
      }
    } catch (error) {
      Logger.log('Error adding to queue');
    }
  }
}
