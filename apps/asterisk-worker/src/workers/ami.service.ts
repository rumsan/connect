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
  // BUG FIX: Per-channel DTMF tracking instead of a single shared array.
  // The old code used one ivrSequence[] for ALL concurrent calls, causing
  // jumbled reports where digits from different calls were mixed together.
  private ivrSequences = new Map<string, string[]>();
  private ivrSequenceTimestamps = new Map<string, number>();
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private ivrReaperTimer: NodeJS.Timeout | null = null;
  private isDestroyed = false;
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
    this.connect();
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

  connect() {
    // Clean up the previous instance to prevent socket/listener leaks
    if (this.ami) {
      try {
        this.ami.removeAllListeners();
        this.ami.disconnect();
      } catch (_) {
        // ignore cleanup errors
      }
      this.ami = null;
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
      if (!this.isDestroyed) {
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
          // ARI-recorded DTMF is authoritative — keyed by Stasis channelId
          // which exactly matches our broadcast. AMI DTMF kept as fallback
          // (AMI events fire on the bridged SIP leg whose uniqueid may differ
          // from the Stasis channel).
          const ariSequence = this.channelStateManager.getDtmfSequence(
            evt.uniqueid,
          );
          const amiSequence = this.ivrSequences.get(evt.uniqueid) || [];
          const ivrSequence =
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

          this.ivrSequences.delete(evt.uniqueid);
          this.ivrSequenceTimestamps.delete(evt.uniqueid);

          // Read playback observability BEFORE Stasis cleanup races
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
            ivrSequence: [...ivrSequence], // snapshot copy
          };
          await this.broadcastLogQueue.addVoice(broadcastLog);
          await this.batchManager.endMonitoring(evt.uniqueid);
          this.channelStateManager.consumePlaybackSnapshot(evt.uniqueid);
          this.logger.log(
            `Call Hangup: ${evt.uniqueid}, status=${status}${errorTag ? ` (${errorTag})` : ''}, DTMF: [${ivrSequence.join(',')}]`,
          );
        } else {
          // Not a tracked call — clean up any stale DTMF data just in case
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
        // Track DTMF digit per-channel using uniqueid
        const uniqueid = evt.uniqueid;
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

  private scheduleReconnect() {
    if (this.reconnectTimer) return; // already scheduled

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
      this.connect();
    }, delay);
  }

  onModuleDestroy() {
    this.isDestroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ivrReaperTimer) {
      clearInterval(this.ivrReaperTimer);
      this.ivrReaperTimer = null;
    }
    if (this.ami) {
      try {
        this.ami.removeAllListeners();
        this.ami.disconnect();
      } catch (_) {
        // ignore
      }
    }
  }
}

// ======== DialState-Event ========
// {
//   event: 'DialState',
//   privilege: 'call,all',
//   destchannel: 'SIP/704-0000001a',
//   destchannelstate: '5',
//   destchannelstatedesc: 'Ringing',
//   destcalleridnum: '704',
//   destcalleridname: 'jpiecxxxaxz498g0v16kpgji',
//   destconnectedlinenum: '<unknown>',
//   destconnectedlinename: 'jpiecxxxaxz498g0v16kpgji',
//   destlanguage: 'en',
//   destaccountcode: '',
//   destcontext: 'from-internal',
//   destexten: '',
//   destpriority: '1',
//   destuniqueid: 'adl1es25xc3dka56gpmvfe9g',
//   destlinkedid: 'adl1es25xc3dka56gpmvfe9g',
//   dialstatus: 'RINGING'
// }

// ======== DialEnd-Event ========
// {
//   event: 'DialEnd',
//   privilege: 'call,all',
//   destchannel: 'SIP/704-0000001a',
//   destchannelstate: '6',
//   destchannelstatedesc: 'Up',
//   destcalleridnum: '704',
//   destcalleridname: 'jpiecxxxaxz498g0v16kpgji',
//   destconnectedlinenum: '<unknown>',
//   destconnectedlinename: 'jpiecxxxaxz498g0v16kpgji',
//   destlanguage: 'en',
//   destaccountcode: '',
//   destcontext: 'from-internal',
//   destexten: '',
//   destpriority: '1',
//   destuniqueid: 'adl1es25xc3dka56gpmvfe9g',
//   destlinkedid: 'adl1es25xc3dka56gpmvfe9g',
//   dialstatus: 'ANSWER'
// }

// ======== Hangup-Event ========
// {
//   event: 'Hangup',
//   privilege: 'call,all',
//   channel: 'SIP/704-00000018',
//   channelstate: '6',
//   channelstatedesc: 'Up',
//   calleridnum: '704',
//   calleridname: 'a9i507avmekfky2qcatczci9',
//   connectedlinenum: '<unknown>',
//   connectedlinename: 'a9i507avmekfky2qcatczci9',
//   language: 'en',
//   accountcode: '',
//   context: 'from-internal',
//   exten: '',
//   priority: '1',
//   uniqueid: 'wmfbnp8qx09j9ayaj90x17jh',
//   linkedid: 'wmfbnp8qx09j9ayaj90x17jh',
//   cause: '16',
//   'cause-txt': 'Normal Clearing'
// }

// ======== CDR-Event ========
// {
//   event: 'Cdr',
//   privilege: 'cdr,all',
//   accountcode: '',
//   source: '704',
//   destination: '',
//   destinationcontext: 'from-internal',
//   callerid: '"hq1h9q3u881iwhxjr9ltmiam" <704>',
//   channel: 'SIP/704-0000001b',
//   destinationchannel: '',
//   lastapplication: 'Stasis',
//   lastdata: 'rs-connect',
//   starttime: '2024-08-18 09:52:16',
//   answertime: '2024-08-18 09:52:20',
//   endtime: '2024-08-18 09:52:22',
//   duration: '5',
//   billableseconds: '1',
//   disposition: 'ANSWERED',
//   amaflags: 'DOCUMENTATION',
//   uniqueid: 'ayaoiiip9q9mvukq9w6ajeas',
//   userfield: ''
// }
