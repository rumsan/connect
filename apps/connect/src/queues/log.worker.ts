import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { QUEUES } from '@rsconnect/sdk';
import { QueueBroadcastLog } from '@rsconnect/sdk/types';
import { ChannelWrapper } from 'amqp-connection-manager';
import { ConfirmChannel } from 'amqplib';
import { BroadcastLogService } from '../broadcastLog/broadcast-log.service';

@Injectable()
export class LogWorker implements OnModuleInit {
  private readonly logger = new Logger(LogWorker.name);

  constructor(
    private readonly broadcastLogService: BroadcastLogService,
    @Inject('AMQP_CONNECTION')
    private readonly channel: ChannelWrapper
  ) {}

  public async onModuleInit() {
    try {
      await this.channel.addSetup(async (channel: ConfirmChannel) => {
        await channel.assertQueue(QUEUES.LOG_TRANSPORT, { durable: true });
        await channel.consume(QUEUES.LOG_TRANSPORT, async (message) => {
          if (message) {
            const content = JSON.parse(message.content.toString());
            await this.process(content.action, content.data);
            channel.ack(message);
          }
        });
      });
      this.logger.log('Consumer service started and listening for messages.');
    } catch (err) {
      this.logger.error('Error starting the consumer:', err);
    }
  }

  async add(queue: QUEUES, data: any) {
    try {
      await this.channel.sendToQueue(queue, Buffer.from(JSON.stringify(data)), {
        persistent: true,
      });
      Logger.log('Sent To Queue');
    } catch (error) {
      console.log(error);
    }
  }

  async process(action: string, data: QueueBroadcastLog) {
    console.log(action);
    if (action === 'create') {
      await this.broadcastLogService.createViaQueue(data, (queue, job) => {
        return this.add(queue, job);
      });
    }

    if (action === 'update') {
      try {
        await this.broadcastLogService.updateDetails({
          cuid: data.cuid,
          details: data.details,
          notes: data.notes,
          status: data.status,
        });
      } catch (error) {
        console.log(error);
      }
    }
  }
}
