import { Inject, Injectable, Logger } from '@nestjs/common';
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

const amiConfig = {
  host: process.env.ASTERISK_HOST,
  port: Number(process.env.ASTERISK_AMI_PORT),
  username: process.env.ASTERISK_AMI_USER,
  password: process.env.ASTERISK_AMI_PASS,
  trunk: process.env.ASTERISK_TRUNK,
  trunk_max_channels: Number(process.env.ASTERISK_TRUNK_CHANNELS),
};

@Injectable()
export class AMIService {
  private readonly logger = new Logger(AMIService.name);
  private ami: any;
  // BUG FIX: Per-channel DTMF tracking instead of a single shared array.
  // The old code used one ivrSequence[] for ALL concurrent calls, causing
  // jumbled reports where digits from different calls were mixed together.
  private ivrSequences = new Map<string, string[]>();

  constructor(
    @Inject('AMQP_CONNECTION')
    protected readonly channel: ChannelWrapper,
    private readonly batchManager: BatchManger,
    private readonly broadcastLogQueue: BroadcastLogQueue,
  ) {
    this.connect();
  }

  connect() {
    console.log(amiConfig);
    this.ami = new AsteriskManager(
      amiConfig.port,
      amiConfig.host,
      amiConfig.username,
      amiConfig.password,
      true,
    );

    this.ami.keepConnected();
    this.ami.action();

    this.ami.on('managerevent', async (evt) => {
      const eventType = evt.event;

      if (eventType === 'Hangup') {
        const disposition = getAsteriskDisposition(evt.cause, evt.channelstate);
        const broadcastLog: QueueBroadcastLogVoice = this.batchManager.getLog(
          evt.uniqueid,
        );

        if (broadcastLog) {
          // Retrieve the per-channel DTMF sequence and clean up
          const ivrSequence = this.ivrSequences.get(evt.uniqueid) || [];
          this.ivrSequences.delete(evt.uniqueid);

          broadcastLog.status =
            disposition === CallDisposition.ANSWERED
              ? BroadcastStatus.SUCCESS
              : BroadcastStatus.FAIL;
          broadcastLog.details = {
            trunk: amiConfig.trunk,
            disposition,
            hangupDetails: evt,
            ivrSequence: [...ivrSequence], // snapshot copy
          };
          await this.broadcastLogQueue.addVoice(broadcastLog);
          await this.batchManager.endMonitoring(evt.uniqueid);
          this.logger.log(
            `Call Hangup: ${evt.uniqueid}, DTMF sequence: [${ivrSequence.join(',')}]`,
          );
        } else {
          // Not a tracked call — clean up any stale DTMF data just in case
          this.ivrSequences.delete(evt.uniqueid);
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
        this.logger.debug(
          `DTMF digit '${evt.digit}' recorded for channel ${uniqueid}`,
        );
      }
    });
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
