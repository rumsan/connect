import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { QUEUE_ACTIONS, QUEUES } from '@rumsan/connect';
import {
  QueueBroadcastLog,
  QueueBroadcastLogDetails,
  QueueJobData,
  QueueReadinessConfirm,
  QueueWorkerHeartbeat,
} from '@rumsan/connect/types';
import { ChannelWrapper } from 'amqp-connection-manager';
import { ConfirmChannel } from 'amqplib';
import { BroadcastService } from '../broadcast/broadcast.service';
import { BroadcastLogQueue } from '../broadcastLog/broadcast-log.queue';
import { WorkerRegistry } from '../workers/worker-registry.service';

@Injectable()
export class LogWorker implements OnModuleInit {
  private readonly logger = new Logger(LogWorker.name);

  constructor(
    private readonly broadcastLogService: BroadcastLogQueue,
    private readonly broadcastService: BroadcastService,
    private readonly workerRegistry: WorkerRegistry,
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
        const data = job.data as QueueReadinessConfirm;
        // workerId is present for multi-worker transports and routes the batch
        // back to the worker that asked; absent, this behaves as before.
        this.broadcastService
          .sendBroadcasts(data.sessionCuid, data.maxBatchSize, data.workerId)
          .catch((error) =>
            this.logger.error(
              `sendBroadcasts failed for session ${data.sessionCuid}`,
              error,
            ),
          );
      } catch (error) {
        console.log(error);
      }
    }

    if (action === QUEUE_ACTIONS.WORKER_HEARTBEAT) {
      this.workerRegistry.record(job.data as QueueWorkerHeartbeat);
    }
  }
}
