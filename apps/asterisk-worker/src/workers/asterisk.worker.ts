import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  BatchManger,
  BroadcastLogQueue,
  TransportQueue,
} from '@rsconnect/queue';
import { IDataProvider, TransportWorker } from '@rsconnect/workers';
import { QUEUE_ACTIONS, QUEUES } from '@rumsan/connect';
import {
  Broadcast,
  BroadcastJobData,
  BroadcastStatus,
  CallDetails,
  CallDisposition,
  QueueBroadcastJobData,
  QueueBroadcastLog,
  QueueBroadcastLogVoice,
  QueueJobData,
  Session,
} from '@rumsan/connect/types';
import { ChannelWrapper } from 'amqp-connection-manager';
import { ConfirmChannel } from 'amqplib';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { IvrModel } from '../entities/ivr.entity';
import { SessionModel } from '../entities/session.entity';

import { wait } from '../utils';
import { AudioService } from './audio.service';
import { IVRService } from './ivr.service';
import { SessionGate } from './session-gate';

@Injectable()
export class AsteriskWorker extends TransportWorker {
  queueTransport: QUEUES = QUEUES.TRANSPORT_VOICE;
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
    super(dataProvider, channel, transportQueue);
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
    } catch (err) {
      this.logger.error('Error starting the consumer:', err);
    }
  }

  /**
   * Calls actually handed to Asterisk in the batch being processed. A broadcast
   * that never reaches `originateCall` is never registered with the BatchManager,
   * so nothing will call `endMonitoring()` for it — if a whole batch is rejected
   * before dialing, the next batch has to be requested explicitly.
   */
  private callsPlacedInBatch = 0;

  override async _sendBroadcast(jobData: QueueBroadcastJobData) {
    this.callsPlacedInBatch = 0;
    await super._sendBroadcast(jobData);

    if (this.callsPlacedInBatch === 0) {
      this.logger.warn(
        `No call placed for session ${jobData.sessionId} — requesting next batch`,
      );
      await this.transportQueue.confirmReadiness({
        sessionCuid: jobData.sessionId,
        maxBatchSize: this.batchManager.batchSize,
      });
    }
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

    if (!isValidPhoneNumber(broadcast.address, 'NP')) {
      this.logger.warn(
        `Invalid phone number for broadcast ${broadcast.cuid}: ${broadcast.address}`,
      );
      await this.reportFailure(
        broadcastLog,
        CallDisposition.INVALID_PHONE,
        'INVALID_PHONE',
        'Invalid phone number',
      );
      return broadcastLog;
    }

    try {
      if (session?.message?.meta?.type === 'new-ivr') {
        const { jsonData } = await this.ivrCache.findOne({
          where: { url: session?.message?.content.split('/').pop() },
        });
        await this.ivrService.sendBroadcast(broadcast, broadcastLog, jsonData);
      } else {
        await this.ivrService.sendBroadcast(broadcast, broadcastLog);
      }
      this.callsPlacedInBatch += 1;
    } catch (e: any) {
      console.log(e);
      // The call never reached Asterisk, so no Hangup event will ever report
      // this broadcast — its disposition has to be published from here.
      await this.reportFailure(
        broadcastLog,
        CallDisposition.FAILED,
        'ORIGINATE_FAILED',
        e.message,
      );
    }
    return broadcastLog;
  }

  /**
   * Reports a broadcast that failed before Asterisk ever saw it. Mirrors the
   * disposition shape AMIService publishes on Hangup so the broadcast report
   * looks the same whether the call failed here or on the wire.
   */
  private async reportFailure(
    broadcastLog: QueueBroadcastLog,
    disposition: CallDisposition,
    errorTag: string,
    notes?: string,
  ) {
    const details: CallDetails = {
      trunk: process.env.ASTERISK_TRUNK,
      disposition,
      errorTag,
      playbackOk: false,
      playbackStarted: false,
      playbackFailed: false,
      ivrSequence: [],
    };

    broadcastLog.status = BroadcastStatus.FAIL;
    broadcastLog.details = { disposition: details, status: 'FAIL' };
    broadcastLog.notes = notes;

    await this.broadcastLogQueue.addVoice(
      broadcastLog as QueueBroadcastLogVoice,
    );
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
