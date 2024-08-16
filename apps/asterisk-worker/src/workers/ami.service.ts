import { Inject, Injectable } from '@nestjs/common';
import { QUEUE_ACTIONS, QUEUES } from '@rumsan/connect';
import {
  BroadcastStatus,
  CallDetails,
  CallDisposition,
  QueueBroadcastLog,
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
  private ami: any;
  public dialStateMap = new Map();
  public activeCalls = new Map();

  constructor(
    @Inject('AMQP_CONNECTION')
    protected readonly channel: ChannelWrapper,
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
      if (eventType === 'DialState' || eventType === 'DialEnd') {
        //        this.addToDialState(evt);
        // console.log('dialstate', evt);
        this.updateCallMonitor(evt.destuniqueid, {
          callStatus: evt.dialstatus,
        });
      }

      if (eventType === 'Hangup') {
        //console.log('hangup', evt);
        const disposition = getAsteriskDisposition(evt.cause, evt.channelstate);

        const details: CallDetails = {
          trunk: amiConfig.trunk,
          disposition,
          hangupDetails: evt,
        };

        this.addToLogQueue({
          cuid: evt.uniqueid,
          status:
            disposition === CallDisposition.ANSWERED
              ? BroadcastStatus.SUCCESS
              : BroadcastStatus.FAIL,
          details,
        });

        // this.removeFromDialState(evt);
        this.endCallMonitor(evt.uniqueid);
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

        setTimeout(() => {
          this.channel.sendToQueue(
            QUEUES.LOG_BROADCAST,
            Buffer.from(
              JSON.stringify({
                action: QUEUE_ACTIONS.BROADCAST_LOG_DETAILS,
                data: {
                  cuid: evt.uniqueid,
                  details,
                },
              }),
            ),
            {
              persistent: true,
            },
          );
        }, 1500);

        // CDR {
        //   event: 'Cdr',
        //   privilege: 'cdr,all',
        //   accountcode: '',
        //   source: 'ms72ehe7dp265e6kp5gbmqzv',
        //   destination: '',
        //   destinationcontext: 'from-pstn-toheader',
        //   callerid: '"Rahat - ms72ehe7dp265e6kp5gbmqzv" <ms72ehe7dp265e6kp5gbmqzv>',
        //   channel: 'SIP/GOIP1-00000007',
        //   destinationchannel: '',
        //   lastapplication: 'Stasis',
        //   lastdata: '89963',
        //   starttime: '2024-08-05 22:00:56',
        //   answertime: '2024-08-05 22:01:07',
        //   endtime: '2024-08-05 22:01:10',
        //   duration: '13',
        //   billableseconds: '2',
        //   disposition: 'ANSWERED',
        //   amaflags: 'DOCUMENTATION',
        //   uniqueid: '1722895256.12',
        //   userfield: ''
        // }
      }
    });
  }

  addToLogQueue(data: {
    cuid: string;
    status: BroadcastStatus;
    details: CallDetails;
  }) {
    const logData: QueueBroadcastLog = {
      ...data,
      attempt: this.activeCalls.get(data.cuid).attempt,
      broadcast: this.activeCalls.get(data.cuid).broadcast,
      queue: QUEUES.TRANSPORT_VOICE,
    };

    return this.channel.sendToQueue(
      QUEUES.LOG_BROADCAST,
      Buffer.from(
        JSON.stringify({
          action: QUEUE_ACTIONS.BROADCAST_LOG_UPDATE,
          data: logData,
        }),
      ),
      {
        persistent: true,
      },
    );
  }

  // getSIPChannels() {
  //   this.ami.action(
  //     {
  //       action: 'CoreShowChannels',
  //     },
  //     (err, res) => {
  //       if (err) {
  //         console.error('Error retrieving SIP channels:', err);
  //       } else {
  //         console.log(res);
  //         const channels = res.events.filter(
  //           (event) => event.event === 'SIPshowchannels'
  //         );
  //         console.log(`Number of SIP channels in use: ${channels.length}`);
  //       }
  //     }
  //   );
  // }

  startCallMonitor(cuid, data: { attempt: number; broadcast: string }) {
    this.activeCalls.set(cuid, { cuid, ...data });
    console.log('start:', this.activeCalls);
  }

  updateCallMonitor(cuid, data: { callStatus: string }) {
    if (!this.activeCalls.has(cuid)) return;
    this.activeCalls.set(cuid, { ...this.activeCalls.get(cuid), ...data });
    console.log('update:', this.activeCalls);
  }

  endCallMonitor(cuid) {
    this.activeCalls.delete(cuid);
    console.log('end:', this.activeCalls);
  }

  // addToDialState(event) {
  //   const { destuniqueid, dialstatus, destchannel } = event;
  //   if (destchannel && destchannel.includes(amiConfig.trunk)) {
  //     this.dialStateMap.set(destuniqueid, dialstatus);
  //   }
  //   console.log(this.dialStateMap);
  // }

  // removeFromDialState(event) {
  //   const { uniqueid } = event;

  //   this.dialStateMap.delete(uniqueid);
  //   setTimeout(() => {
  //     console.log('currrent state: ', this.dialStateMap);
  //   }, 2000);
  // }

  // getDialState() {
  //   return this.dialStateMap;
  // }

  hasAvailableChannel() {
    return this.activeCalls.size < amiConfig.trunk_max_channels;
  }
}
