import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { BatchManger, BroadcastLogQueue } from '@rsconnect/queue';
import {
  BroadcastStatus,
  CallDetails,
  CallDisposition,
  QueueBroadcastLogVoice,
} from '@rumsan/connect/types';
import { ChannelWrapper } from 'amqp-connection-manager';
import AsteriskManager from 'asterisk-manager';
import { getAsteriskDisposition } from '../utils';
import { ChannelStateManager } from './channel-state.manager';

const amiConfig = {
  host: process.env.ASTERISK_HOST,
  port: Number(process.env.ASTERISK_AMI_PORT),
  username: process.env.ASTERISK_AMI_USER,
  password: process.env.ASTERISK_AMI_PASS,
  trunk: process.env.ASTERISK_TRUNK,
  trunk_max_channels: Number(process.env.ASTERISK_TRUNK_CHANNELS),
};

const RECONNECT_BASE_MS = 10_000;
const RECONNECT_MAX_MS = 60_000;

@Injectable()
export class AMIService implements OnModuleDestroy {
  private readonly logger = new Logger(AMIService.name);
  private ami: any;
  private ivrSequences = new Map<string, string[]>();
  private ivrSequenceTimestamps = new Map<string, number>();
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private ivrReaperTimer: NodeJS.Timeout | null = null;
  private isDestroyed = false;
  private sessionActive = false;
  private readonly ivrSequenceTtlMs =
    +(process.env['IVR_SEQUENCE_TTL_MS'] as string) || 300_000;
  private readonly reaperIntervalMs =
    +(process.env['REAPER_INTERVAL_MS'] as string) || 60_000;

  constructor(
    @Inject('AMQP_CONNECTION')
    protected readonly channel: ChannelWrapper,
    private readonly batchManager: BatchManger,
    private readonly broadcastLogQueue: BroadcastLogQueue,
    private readonly channelStateManager: ChannelStateManager,
  ) {
    this.startIvrReaper();
  }

  private startIvrReaper() {
    this.ivrReaperTimer = setInterval(() => {
      const now = Date.now();
      const expired: string[] = [];
      for (const [id, ts] of this.ivrSequenceTimestamps.entries()) {
        if (now - ts > this.ivrSequenceTtlMs) expired.push(id);
      }
      for (const id of expired) {
        this.logger.warn(
          `Reaper expiring stale ivrSequence ${id} (age=${now - (this.ivrSequenceTimestamps.get(id) ?? 0)}ms)`,
        );
        this.ivrSequences.delete(id);
        this.ivrSequenceTimestamps.delete(id);
      }
    }, this.reaperIntervalMs);
    this.ivrReaperTimer.unref?.();
  }

  connectForSession() {
    if (this.ami) return;

    this.sessionActive = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.logger.log('Connecting to AMI...');
    this.ami = new AsteriskManager(
      amiConfig.port,
      amiConfig.host,
      amiConfig.username,
      amiConfig.password,
      true,
    );

    this.ami.action();

    this.ami.on('connect', () => {
      this.logger.log('AMI connected and authenticated');
      this.reconnectAttempts = 0;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    });

    this.ami.on('close', () => {
      this.logger.warn('AMI connection closed');
      this.ami = null;
      if (this.sessionActive && !this.isDestroyed) {
        this.scheduleReconnect();
      }
    });

    this.ami.on('end', () => {
      this.logger.warn('AMI connection ended');
    });

    this.ami.on('error', (err: Error) => {
      this.logger.error(`AMI connection error: ${err?.message ?? String(err)}`);
    });

    this.ami.on('managerevent', async (evt) => {
      const eventType = evt.event;

      if (eventType === 'Hangup') {
        const disposition = getAsteriskDisposition(evt.cause, evt.channelstate);
        const broadcastLog: QueueBroadcastLogVoice = this.batchManager.getLog(
          evt.uniqueid,
        );

        if (broadcastLog) {
          const isIvr = this.channelStateManager.isIvrChannel(evt.uniqueid);
          let ivrSequence: string[] = [];

          if (isIvr) {
            const ariSequence = this.channelStateManager.getDtmfSequence(
              evt.uniqueid,
            );
            const amiSequence = this.ivrSequences.get(evt.uniqueid) || [];
            ivrSequence =
              ariSequence.length > 0 ? ariSequence : amiSequence;

            if (
              ariSequence.length > 0 &&
              amiSequence.length > 0 &&
              ariSequence.join(',') !== amiSequence.join(',')
            ) {
              this.logger.warn(
                `DTMF mismatch for ${evt.uniqueid}: ARI=[${ariSequence.join(',')}] AMI=[${amiSequence.join(',')}] (using ARI)`,
              );
            }
          }

          this.ivrSequences.delete(evt.uniqueid);
          this.ivrSequenceTimestamps.delete(evt.uniqueid);

          const ps = this.channelStateManager.getPlaybackStatus(evt.uniqueid);
          const answered = disposition === CallDisposition.ANSWERED;
          const playbackOk =
            ps?.playbackStarted === true && ps?.playbackFailed !== true;

          let status: BroadcastStatus;
          let errorTag: string | undefined;
          if (!answered) {
            status = BroadcastStatus.FAIL;
          } else if (!playbackOk) {
            status = BroadcastStatus.FAIL;
            errorTag = 'ANSWERED_NO_PLAYBACK';
          } else {
            status = BroadcastStatus.SUCCESS;
          }

          broadcastLog.status = status;
          broadcastLog.details = {
            trunk: amiConfig.trunk,
            disposition,
            playbackOk,
            playbackStarted: ps?.playbackStarted ?? false,
            playbackFailed: ps?.playbackFailed ?? false,
            playbackError: ps?.playbackError,
            errorTag,
            hangupDetails: evt,
            ivrSequence: [...ivrSequence],
          };
          await this.broadcastLogQueue.addVoice(broadcastLog);
          await this.batchManager.endMonitoring(evt.uniqueid);
          this.channelStateManager.consumePlaybackSnapshot(evt.uniqueid);
          this.logger.log(
            `Call Hangup: ${evt.uniqueid}, status=${status}${errorTag ? ` (${errorTag})` : ''}, DTMF: [${ivrSequence.join(',')}]`,
          );
        } else {
          this.ivrSequences.delete(evt.uniqueid);
          this.ivrSequenceTimestamps.delete(evt.uniqueid);
          console.log('=====> Call Received: ', evt.calleridnum);
        }
      }

      if (eventType === 'Cdr') {
        const details: CallDetails = {
          trunk: amiConfig.trunk,
          disposition: CallDisposition.ANSWERED,
          answerTime: evt.answertime,
          endTime: evt.endtime,
          duration: +evt.billableseconds,
          cdr: evt,
        };

        const [appName, broadcastLogId] = evt.lastdata.split(',');
        if (broadcastLogId) {
          setTimeout(async () => {
            await this.broadcastLogQueue.updateDetailsVoice({
              broadcastLogId,
              status: BroadcastStatus.SUCCESS,
              details,
            });
            this.logger.log(`CDR Sent: ${broadcastLogId}`);
          }, 5000);
        }
      }

      if (eventType === 'DTMFEnd') {
        const uniqueid = evt.uniqueid;
        if (!this.channelStateManager.isIvrChannel(uniqueid)) {
          return;
        }
        if (!this.ivrSequences.has(uniqueid)) {
          this.ivrSequences.set(uniqueid, []);
        }
        const sequence = this.ivrSequences.get(uniqueid);
        if (sequence) {
          sequence.push(evt.digit);
        }
        this.ivrSequenceTimestamps.set(uniqueid, Date.now());
        this.logger.debug(
          `DTMF digit '${evt.digit}' recorded for channel ${uniqueid}`,
        );
      }
    });
  }

  disconnectForSession() {
    this.sessionActive = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ami) {
      try {
        this.ami.removeAllListeners();
        this.ami.disconnect();
      } catch (_) {
        // ignore
      }
      this.ami = null;
    }
    this.reconnectAttempts = 0;
    this.logger.log('AMI disconnected for session');
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;

    this.reconnectAttempts += 1;
    const delay = Math.min(
      RECONNECT_BASE_MS * this.reconnectAttempts,
      RECONNECT_MAX_MS,
    );
    this.logger.warn(
      `Scheduling AMI reconnect in ${delay / 1000}s (attempt #${this.reconnectAttempts})`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.sessionActive && !this.isDestroyed) {
        this.connectForSession();
      }
    }, delay);
  }

  onModuleDestroy() {
    this.isDestroyed = true;
    this.disconnectForSession();
    if (this.ivrReaperTimer) {
      clearInterval(this.ivrReaperTimer);
      this.ivrReaperTimer = null;
    }
  }
}
