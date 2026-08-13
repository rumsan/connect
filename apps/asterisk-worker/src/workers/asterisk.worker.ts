import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/sequelize';
import {
  BatchManger,
  BroadcastLogQueue,
  TransportQueue,
  WORKER_HEARTBEAT_MS,
  WORKER_ID,
  WORKER_PRIORITY,
} from '@rsconnect/queue';
import { IDataProvider, TransportWorker } from '@rsconnect/workers';
import {
  controlRoutingKey,
  EXCHANGES,
  QUEUE_ACTIONS,
  QUEUES,
  TRANSPORT_SLUG,
  workerQueueName,
  workerRoutingKey,
} from '@rumsan/connect';
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
import { IvrModel } from '../entities/ivr.entity';
import { SessionModel } from '../entities/session.entity';

import { wait } from '../utils';
import { AudioService } from './audio.service';
import { IVRService } from './ivr.service';
import { SessionGate } from './session-gate';

/**
 * Queue this instance consumes. With WORKER_ID set each worker owns a private
 * queue bound to the transport exchange, so connect can address a batch to one
 * specific Asterisk box. Without it we fall back to the shared voice queue,
 * which keeps a single-worker deployment (and a rolling upgrade) working.
 */
const VOICE_QUEUE = WORKER_ID
  ? (workerQueueName(TRANSPORT_SLUG.VOICE, WORKER_ID) as QUEUES)
  : QUEUES.TRANSPORT_VOICE;

// A decommissioned worker's queue would otherwise accumulate messages forever.
// Only applies while nothing is consuming, so a live worker is never affected.
const QUEUE_IDLE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AsteriskWorker extends TransportWorker {
  queueTransport: QUEUES = VOICE_QUEUE;

  /** Logs name the transport, not this instance's private queue. */
  protected override get transportQueueId(): QUEUES {
    return QUEUES.TRANSPORT_VOICE;
  }

  private readonly logger = new Logger(AsteriskWorker.name);

  constructor(
    @Inject('IDataProvider')
    override readonly dataProvider: IDataProvider,
    @Inject('AMQP_CONNECTION')
    override readonly channel: ChannelWrapper,
    @InjectModel(SessionModel)
    private sessionCache: typeof SessionModel,
    @InjectModel(IvrModel)
    private ivrCache: typeof IvrModel,
    private readonly audioService: AudioService,
    override readonly transportQueue: TransportQueue,
    private readonly broadcastLogQueue: BroadcastLogQueue,
    override readonly batchManager: BatchManger,
    private readonly ivrService: IVRService,
    private readonly sessionGate: SessionGate,
  ) {
    super(dataProvider, channel, transportQueue, batchManager, broadcastLogQueue);
  }

  public override async onModuleInit() {
    try {
      await this.channel.addSetup(async (channel: ConfirmChannel) => {
        await this.assertQueue(channel);
        await channel.prefetch(1);

        await channel.consume(
          this.queueTransport,
          async (message) => {
            if (!message) return;

            const job: QueueJobData<unknown> = JSON.parse(
              message.content.toString(),
            );

            if (job.action === QUEUE_ACTIONS.READINESS_CHECK) {
              const data = job.data as { sessionCuid: string };
              this.sessionGate.enqueue(data.sessionCuid, () =>
                this._makeTransportReady(data.sessionCuid),
              );
            }

            if (job.action === QUEUE_ACTIONS.BROADCAST) {
              const data = job.data as QueueBroadcastJobData;
              this.sessionGate.enqueue(data.sessionId, () =>
                this._sendBroadcast(data),
              );
            }

            if (job.action === QUEUE_ACTIONS.SESSION_COMPLETE) {
              const data = job.data as { sessionCuid: string };
              this.logger.log(
                `Received SESSION_COMPLETE for session: ${data.sessionCuid}`,
              );
              this.sessionGate.completeSession(data.sessionCuid);
            }

            channel.ack(message);
          },
          {},
        );
      });
      this.logger.log(
        `Voice worker ${WORKER_ID ?? '(shared queue)'} consuming ${
          this.queueTransport
        } (priority=${WORKER_PRIORITY}, capacity=${this.batchManager.batchSize})`,
      );
    } catch (err) {
      this.logger.error('Error starting the consumer:', err);
    }
  }

  /**
   * Declares this worker's private queue and binds it to the transport
   * exchange: one key for batches addressed to us, one for fleet-wide control
   * messages.
   */
  override async assertQueue(channel: ConfirmChannel) {
    await channel.assertQueue(QUEUES.TO_CONNECT, { durable: true });

    if (!WORKER_ID) {
      await channel.assertQueue(this.queueTransport, { durable: true });
      return;
    }

    await channel.assertExchange(EXCHANGES.TRANSPORT, 'topic', {
      durable: true,
    });
    await channel.assertQueue(this.queueTransport, {
      durable: true,
      arguments: { 'x-expires': QUEUE_IDLE_EXPIRY_MS },
    });
    await channel.bindQueue(
      this.queueTransport,
      EXCHANGES.TRANSPORT,
      workerRoutingKey(TRANSPORT_SLUG.VOICE, WORKER_ID),
    );
    await channel.bindQueue(
      this.queueTransport,
      EXCHANGES.TRANSPORT,
      controlRoutingKey(TRANSPORT_SLUG.VOICE),
    );
  }

  /**
   * Connect builds its worker roster from these — there is no registration
   * step, so a worker that stops heartbeating simply stops being assigned work.
   */
  @Interval(WORKER_HEARTBEAT_MS)
  async sendHeartbeat() {
    if (!WORKER_ID) return;
    await this.transportQueue.sendHeartbeat({
      workerId: WORKER_ID,
      transport: TRANSPORT_SLUG.VOICE,
      priority: WORKER_PRIORITY,
      capacity: this.batchManager.batchSize,
      activeSessionCuid: this.sessionGate.activeSession,
      inFlight: this.batchManager.processingBroadcasts.size,
    });
  }

  /** Snapshot for the health endpoint. */
  get status() {
    return {
      workerId: WORKER_ID ?? null,
      priority: WORKER_PRIORITY,
      capacity: this.batchManager.batchSize,
      queue: this.queueTransport,
      activeSession: this.sessionGate.activeSession,
      pendingSessions: this.sessionGate.pendingCount,
      inFlight: this.batchManager.processingBroadcasts.size,
    };
  }

  async sendBroadcast(data: {
    session: Session;
    broadcast: Broadcast;
    broadcastJob: BroadcastJobData;
    broadcastLog: QueueBroadcastLog;
  }): Promise<QueueBroadcastLog> {
    const { session, broadcast, broadcastLog } = data;
    broadcastLog.status = BroadcastStatus.PENDING;
    this.logger.log('Sending broadcast for session:', session.cuid);
    try {
      if (session?.message?.meta?.type === 'new-ivr') {
        const { jsonData } = await this.ivrCache.findOne({
          where: { url: session?.message?.content.split('/').pop() },
        });
        await this.ivrService.sendBroadcast(broadcast, broadcastLog, jsonData);
      } else {
        await this.ivrService.sendBroadcast(broadcast, broadcastLog);
      }
    } catch (e: any) {
      console.log(e);
      broadcastLog.status = BroadcastStatus.FAIL;
      broadcastLog.details = { error: e.message };
    }
    return broadcastLog;
  }
  async makeTransportReady(sessionCuid: string) {
    try {
      const session: Session = await this.dataProvider.getSession(sessionCuid);
      this.logger.log('Preparing audio for Session:', session);
      //return true;
      const cacheSession = await this.sessionCache.findOne({
        where: { cuid: session.cuid },
      });

      if (!cacheSession) {
        await this.sessionCache.create({
          cuid: session.cuid,
          hasAudio: true,
        });
      }

      if (session.message.meta.type === 'new-ivr') {
        const cacheIvr = await this.ivrCache.findOne({
          where: { url: session?.message?.content.split('/').pop() },
        });
        if (!cacheIvr) {
          const { url, preparedData } = await this.audioService.makeJSONReady(
            session,
          );
          await this.ivrCache.create({
            url,
            jsonData: JSON.stringify(preparedData),
          });
        }
        await wait(5000);
      } else {
        this.logger.log('Preparing audio file for Asterisk');
        await this.audioService.makeAudioReady(session);
      }
      await wait(15000);
      return true;
    } catch (e: any) {
      this.logger.error(e.message);
      return false;
    }
  }
}
