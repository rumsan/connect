import { Inject, Injectable } from '@nestjs/common';
import { QUEUES } from '@rumsan/connect';
import { BroadcastStatus, QueueBroadcastLog } from '@rumsan/connect/types';
import { IDataProvider } from '@rsconnect/workers';
import { ChannelWrapper } from 'amqp-connection-manager';
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
export class AMIService {
  private ami: any;
  private dialStateMap = new Map();

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
        // console.log('DIALSTATE', evt);
        this.addToDialState(evt);
      }

      if (eventType === 'Hangup') {
        console.log('HANGUP', evt);

        this.removeFromDialState(evt);
      }

      if (eventType === 'Cdr') {
        // console.log('CDR', evt);

        setTimeout(() => {
          this.addToLogQueue<any>({
            cuid: evt.source,
            status: BroadcastStatus.SUCCESS,
            details: {
              answerTime: evt.answertime,
              endTime: evt.endtime,
              duration: +evt.billableseconds,
              disposition: evt.disposition,
              uniqueId: evt.uniqueid,
            },
          });
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

  addToLogQueue<T>(data: T) {
    return this.channel.sendToQueue(
      QUEUES.LOG_TRANSPORT,
      Buffer.from(JSON.stringify({ action: 'update', data })),
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

  addToDialState(event) {
    //console.log(event);
    const { destuniqueid, destcalleridnum, destchannel } = event;
    if (destchannel && destchannel.includes(amiConfig.trunk)) {
      this.dialStateMap.set(destuniqueid, destcalleridnum);
    }
  }

  removeFromDialState(event) {
    const { uniqueid } = event;
    this.dialStateMap.delete(uniqueid);
  }

  getDialState() {
    return this.dialStateMap;
  }

  hasAvailableChannel() {
    return this.dialStateMap.size < amiConfig.trunk_max_channels;
  }
}
