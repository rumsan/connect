import { Inject, OnModuleInit, Optional } from '@nestjs/common';
import { BatchManger, BroadcastLogQueue, TransportQueue } from '@rsconnect/queue';
import { QUEUE_ACTIONS, QUEUES } from '@rumsan/connect';
import { ISessionGate, SessionGate } from './session-gate';
import {
  Broadcast,
  BroadcastJobData,
  BroadcastStatus,
  QueueBroadcastJobData,
  QueueBroadcastLog,
  QueueJobData,
  Session,
} from '@rumsan/connect/types';
import { ChannelWrapper } from 'amqp-connection-manager';
import { ConfirmChannel } from 'amqplib';
import { IDataProvider } from '../data-providers/data-provider.interface';

export abstract class TransportWorker implements OnModuleInit {
  /** Queue this instance consumes. May be worker-specific. */
  abstract queueTransport: QUEUES;
  protected batchManager: BatchManger;
  protected sessionGate: ISessionGate = new SessionGate();

  /**
   * Transport identity recorded on broadcast logs. Workers that consume a
   * private per-instance queue override this so logs still name the transport
   * rather than the instance.
   */
  protected get transportQueueId(): QUEUES {
    return this.queueTransport;
  }

  constructor(
    @Inject('IDataProvider')
    protected readonly dataProvider: IDataProvider,
    @Inject('AMQP_CONNECTION')
    protected readonly channel: ChannelWrapper,
    protected readonly transportQueue: TransportQueue,
    // Subclasses that inject the DI singleton pass it through, so the manager
    // driving the batch loop is the same object the rest of the worker touches.
    // Without this the base built a second, orphaned instance whose reaper
    // never ran.
    @Optional() batchManager?: BatchManger,
    @Optional() protected readonly logQueue?: BroadcastLogQueue,
  ) {
    this.batchManager = batchManager ?? new BatchManger(this.transportQueue);
  }

  public async onModuleInit() {
    try {
      await this.channel.addSetup(async (channel: ConfirmChannel) => {
        await this.assertQueue(channel);

        await channel.consume(
          this.queueTransport,
          async (message) => {
            if (message) {
              const job: QueueJobData<unknown> = JSON.parse(
                message.content.toString(),
              );

              if (job.action === QUEUE_ACTIONS.READINESS_CHECK) {
                const data = job.data as { sessionCuid: string };
                this._makeTransportReady(data.sessionCuid).catch((err) =>
                  console.error(
                    `_makeTransportReady failed for session ${data.sessionCuid}:`,
                    err,
                  ),
                );
              }

              if (job.action === QUEUE_ACTIONS.BROADCAST) {
                console.log('Received broadcast job:', job);
                const broadcastData = job.data as QueueBroadcastJobData;
                this.sessionGate
                  .enqueue(broadcastData.sessionId, () =>
                    this._sendBroadcast(broadcastData),
                  )
                  .catch((err) => console.error('_sendBroadcast failed:', err));
              }

              if (job.action === QUEUE_ACTIONS.SESSION_COMPLETE) {
                const data = job.data as { sessionCuid: string };
                console.log(
                  `Received SESSION_COMPLETE for session: ${data.sessionCuid}`,
                );
                this.sessionGate.completeSession(data.sessionCuid);
              }

              channel.ack(message);
            }
          },
          {},
        );
      });
    } catch (err) {
      console.error('Error starting the consumer:', err);
    }
  }

  async assertQueue(channel: ConfirmChannel) {
    await channel.assertQueue(QUEUES.TO_CONNECT, {
      durable: true,
    });
    await channel.assertQueue(this.queueTransport, {
      durable: true,
    });
  }

  protected async _makeTransportReady(sessionCuid: string) {
    const isTransportReady = await this.makeTransportReady(sessionCuid);
    if (isTransportReady) {
      await this.transportQueue.confirmReadiness({
        sessionCuid,
        maxBatchSize: this.batchManager.batchSize,
        workerId: this.batchManager.workerId,
      });
    }
  }

  async _sendBroadcast(jobData: QueueBroadcastJobData) {
    const session: Session = await this.dataProvider.getSession(
      jobData.sessionId,
    );

    const broadcasts: Broadcast[] = await this.dataProvider.getBroadcasts(
      jobData.broadcasts.map((job) => job.broadcastId),
    );

    this.batchManager.beginBatch();
    try {
      await this._dispatchBatch(session, broadcasts, jobData);
    } finally {
      // Even if dispatch threw, release the guard and let the drain check run —
      // otherwise this worker would never ask for another batch.
      this.batchManager.finishBatch(jobData.sessionId);
    }
  }

  private async _dispatchBatch(
    session: Session,
    broadcasts: Broadcast[],
    jobData: QueueBroadcastJobData,
  ) {
    for (const job of jobData.broadcasts) {
      const broadcast = broadcasts.find((b) => b.cuid === job.broadcastId);

      if (!broadcast) {
        // The row vanished between claim and dispatch. Report it so the log
        // row reaches a terminal state instead of sitting PENDING forever.
        await this._reportFailure(
          {
            broadcastLogId: job.broadcastLogId,
            broadcastId: job.broadcastId,
            sessionId: jobData.sessionId,
            attempt: job.attempt,
            status: BroadcastStatus.FAIL,
            queue: this.transportQueueId,
            details: { errorTag: 'BROADCAST_NOT_FOUND' },
          },
          jobData.sessionId,
        );
        continue;
      }

      const broadcastLog: QueueBroadcastLog = {
        broadcastLogId: job.broadcastLogId,
        broadcastId: job.broadcastId,
        sessionId: jobData.sessionId,
        attempt: job.attempt,
        status: BroadcastStatus.SUCCESS,
        queue: this.transportQueueId,
      };

      const result = await this.sendBroadcast({
        session,
        broadcast,
        broadcastJob: job,
        broadcastLog,
      });

      // A transport that fails synchronously (e.g. an Asterisk originate that
      // never produces a channel) has no later event to report the outcome.
      // Publishing here is what stops the batch from hanging — an undrained
      // batch means this worker never asks for another one.
      if (result?.status === BroadcastStatus.FAIL) {
        await this._reportFailure(result, jobData.sessionId);
      }
    }
  }

  private async _reportFailure(log: QueueBroadcastLog, sessionCuid: string) {
    try {
      await this.logQueue?.add(log);
    } catch (err) {
      console.error(
        `Failed to publish FAIL log for ${log.broadcastLogId}:`,
        err,
      );
    }
    // Clears the slot even if it was never monitored, so an all-failed batch
    // still triggers the next READINESS_CONFIRM.
    await this.batchManager.endMonitoring(log.broadcastLogId, {
      sessionCuid,
      batchSize: this.batchManager.batchSize,
    });
  }

  abstract sendBroadcast({
    session,
    broadcastJob,
    broadcastLog,
    broadcast,
  }: {
    session: Session;
    broadcastJob: BroadcastJobData;
    broadcastLog: QueueBroadcastLog;
    broadcast?: Broadcast;
  }): Promise<QueueBroadcastLog>;

  abstract makeTransportReady(sessionCuid: string): Promise<boolean>;
}
