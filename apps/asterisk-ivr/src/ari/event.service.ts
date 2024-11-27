import { Inject, Injectable, Logger } from '@nestjs/common';
import AsteriskManager from 'asterisk-manager';

const amiConfig = {
  host: process.env.ASTERISK_HOST,
  port: Number(process.env.ASTERISK_AMI_PORT),
  username: process.env.ASTERISK_AMI_USER,
  password: process.env.ASTERISK_AMI_PASS,
  trunk: process.env.ASTERISK_TRUNK,
  trunk_max_channels: Number(process.env.ASTERISK_TRUNK_CHANNELS),
};

@Injectable()
export class EventService {
  private readonly logger = new Logger(EventService.name);
  private ami: any;

  constructor() {
    this.connect();
  }

  connect() {
    console.log(amiConfig);
    this.ami = new AsteriskManager(
      amiConfig.port,
      amiConfig.host,
      amiConfig.username,
      amiConfig.password,
      true
    );

    this.ami.keepConnected();
    this.ami.action();

    this.ami.on('managerevent', async (evt) => {
      const eventType = evt.event;
      //console.log('=====', eventType);
      if (eventType !== 'VarSet') {
        //console.log(evt);
      }

      if (eventType === 'Hangup') {
        //console.log('Hangup Event', evt);
        console.log('=====> Call Received: ', evt.calleridnum);
      }

      if (eventType === 'Cdr') {
        // const [appName, broadcastLogId] = evt.lastdata.split(',');
        // if (broadcastLogId) {
        //   setTimeout(async () => {
        //     await this.broadcastLogQueue.updateDetailsVoice({
        //       broadcastLogId,
        //       status: BroadcastStatus.SUCCESS,
        //       details,
        //     });
        //     this.logger.log(`CDR Sent: ${broadcastLogId}`);
        //   }, 5000);
        // }
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
