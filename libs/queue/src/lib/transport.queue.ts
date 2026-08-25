import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  EXCHANGES,
  QUEUE_ACTIONS,
  QUEUES,
  workerRoutingKey,
} from '@rumsan/connect';
import {
  QueueJobData,
  QueueReadinessConfirm,
  QueueSessionComplete,
  QueueSessionTiming,
  QueueWorkerHeartbeat,
} from '@rumsan/connect/types';
import { ChannelWrapper } from 'amqp-connection-manager';
import { transportSlugFromQueue } from './transport-slug';

const PUBLISH_OPTIONS = { persistent: true, timeout: 1000 };

@Injectable()
export class TransportQueue {
  private readonly logger = new Logger(TransportQueue.name);
  constructor(
    @Inject('AMQP_CONNECTION')
    private readonly _channel: ChannelWrapper,
  ) {}

  /**
   * Publish to one specific worker when `workerId` is given, otherwise to the
   * transport's shared queue. The fallback is what keeps single-worker
   * transports — and a pre-upgrade voice worker — working untouched.
   */
  private publish(
    queue: QUEUES,
    workerId: string | undefined,
    job: QueueJobData<unknown>,
  ) {
    const payload = Buffer.from(JSON.stringify(job));

    if (!workerId) {
      return this._channel.sendToQueue(queue, payload, PUBLISH_OPTIONS);
    }

    return this._channel.publish(
      EXCHANGES.TRANSPORT,
      workerRoutingKey(transportSlugFromQueue(queue), workerId),
      payload,
      PUBLISH_OPTIONS,
    );
  }

  async checkReadiness(data: {
    transportToCheck: QUEUES;
    sessionCuid: string;
    workerId?: string;
  }) {
    try {
      const queueJob: QueueJobData<{
        transportToCheck: QUEUES;
        sessionCuid: string;
        workerId?: string;
      }> = {
        action: QUEUE_ACTIONS.READINESS_CHECK,
        data,
      };

      return await this.publish(data.transportToCheck, data.workerId, queueJob);
    } catch (error) {
      this.logger.error(
        `checkReadiness publish failed for session ${data.sessionCuid}${
          data.workerId ? ` (worker ${data.workerId})` : ''
        }`,
        error,
      );
    }
    return false;
  }

  async notifySessionComplete(data: {
    transportQueue: QUEUES;
    sessionCuid: string;
    workerId?: string;
  }) {
    try {
      const queueJob: QueueJobData<QueueSessionComplete> = {
        action: QUEUE_ACTIONS.SESSION_COMPLETE,
        data: { sessionCuid: data.sessionCuid, workerId: data.workerId },
      };
      this.logger.log(
        `Notifying session complete: ${data.sessionCuid} on ${
          data.workerId ?? data.transportQueue
        }`,
      );
      return await this.publish(data.transportQueue, data.workerId, queueJob);
    } catch (error) {
      this.logger.error(
        `notifySessionComplete publish failed for session ${data.sessionCuid}`,
        error,
      );
    }
    return false;
  }

  async confirmReadiness(data: QueueReadinessConfirm) {
    try {
      const queueJob: QueueJobData<QueueReadinessConfirm> = {
        action: QUEUE_ACTIONS.READINESS_CONFIRM,
        data,
      };
      this.logger.log(
        `Confirming readiness for session ${data.sessionCuid}${
          data.workerId ? ` as worker ${data.workerId}` : ''
        } (batch ${data.maxBatchSize})`,
      );
      return await this._channel.sendToQueue(
        QUEUES.TO_CONNECT,
        Buffer.from(JSON.stringify(queueJob)),
        PUBLISH_OPTIONS,
      );
    } catch (error) {
      this.logger.error(
        `confirmReadiness publish failed for session ${data.sessionCuid}`,
        error,
      );
    }
    return false;
  }

  /**
   * Liveness/capacity announcement. Dropped silently on failure — the registry
   * treats a missed heartbeat as staleness, which is the correct reaction to a
   * broker hiccup anyway.
   */
  async sendHeartbeat(data: QueueWorkerHeartbeat) {
    try {
      const queueJob: QueueJobData<QueueWorkerHeartbeat> = {
        action: QUEUE_ACTIONS.WORKER_HEARTBEAT,
        data,
      };
      return await this._channel.sendToQueue(
        QUEUES.TO_CONNECT,
        Buffer.from(JSON.stringify(queueJob)),
        // Not persistent: a heartbeat that outlives its interval is worthless.
        { persistent: false, timeout: 1000, expiration: 60_000 },
      );
    } catch (error) {
      this.logger.warn(
        `heartbeat publish failed for worker ${data.workerId}: ${
          (error as Error).message
        }`,
      );
    }
  }

  async reportSessionTiming(
    action: QUEUE_ACTIONS.SESSION_START | QUEUE_ACTIONS.SESSION_END,
    data: QueueSessionTiming,
  ) {
    try {
      const queueJob: QueueJobData<QueueSessionTiming> = { action, data };
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
        `${action} publish failed for session ${data.sessionCuid}`,
        error,
      );
    }
    return false;
  }
}
