import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { QUEUE_ACTIONS, QUEUES } from '@rumsan/connect';
import {
  QueueBroadcastLog,
  QueueBroadcastLogDetails,
  QueueJobData,
} from '@rumsan/connect/types';
import { ChannelWrapper } from 'amqp-connection-manager';
import { ConfirmChannel } from 'amqplib';
import { BroadcastService } from '../broadcast/broadcast.service';
import { BroadcastLogQueue } from '../broadcastLog/broadcast-log.queue';

@Injectable()
export class LogWorker implements OnModuleInit {
  private readonly logger = new Logger(LogWorker.name);

  constructor(
    private readonly broadcastLogService: BroadcastLogQueue,
    private readonly broadcastService: BroadcastService,
    @Inject('AMQP_CONNECTION')
    private readonly channel: ChannelWrapper,
  ) { }

  public async onModuleInit() {
    try {
      await this.channel.addSetup(async (channel: ConfirmChannel) => {
        await channel.assertQueue(QUEUES.TO_CONNECT, { durable: true });

        await channel.consume(QUEUES.TO_CONNECT, async (message) => {
          if (message) {
            const content: QueueJobData<QueueBroadcastLog> = JSON.parse(
              message.content.toString(),
            );
            await this.process(content);
            channel.ack(message);
          }
        });
      });
      this.logger.log('Consumer service started and listening for messages.');
    } catch (err) {
      this.logger.error('Error starting the consumer:', err);
    }
  }

  async process(job: QueueJobData<unknown>) {
    const { action } = job;

    if (action === QUEUE_ACTIONS.BROADCAST_LOG_UPDATE) {
      try {
        const data = job.data as QueueBroadcastLog;
        await this.broadcastLogService.update(data);
      } catch (error) {
        console.log(error);
      }
    }

    if (action === QUEUE_ACTIONS.BROADCAST_LOG_DETAILS) {
      try {
        const data = job.data as QueueBroadcastLogDetails;
        await this.broadcastLogService.updateDetails(data);
      } catch (error) {
        console.log(error);
      }
    }

    if (action === QUEUE_ACTIONS.READINESS_CONFIRM) {
      try {
        console.log("CONFIRMING READINESS")
        const data = job.data as { sessionCuid: string; maxBatchSize: number };
        this.broadcastService
          .sendBroadcasts(data.sessionCuid, data.maxBatchSize)
          .then();
      } catch (error) {
        console.log(error);
      }
    }
  }
}
