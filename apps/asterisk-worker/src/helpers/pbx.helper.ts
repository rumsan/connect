import { Logger } from '@nestjs/common';
import { BatchManger, BroadcastLogQueue } from '@rsconnect/queue';
import {
  Broadcast,
  BroadcastStatus,
  CallDetails,
  CallDisposition,
  QueueBroadcastLog,
} from '@rumsan/connect/types';
import ari from 'ari-client';

export class PBXHelper {
  private readonly logger = new Logger(PBXHelper.name);
  private isChannelDestroyed = false;
  private client: any;

  //generate random number
  private generateRandomNumber() {
    return Math.floor(Math.random() * 1000000000);
  }

  private AriServer = {
    appName: Math.floor(Math.random() * 1000000000).toString(),
    ariServer: process.env.ASTERISK_ARI,
    ariUser: process.env.ASTERISK_ARI_USER,
    ariPass: process.env.ASTERISK_ARI_PASS,
    trunk: process.env.ASTERISK_TRUNK,
    timeout: +process.env.ASTERISK_TIMEOUT,
    audioPath: process.env.ASTERISK_AUDIO_PATH,
    callerId: process.env.ASTERISK_CALLER_ID,
  };

  constructor(
    private readonly batchManager: BatchManger,
    private readonly broadcastLogQueue: BroadcastLogQueue,
  ) {
    console.log('-----------------PBXHelper-----------------');
  }

  async broadcastAudio(broadcast: Broadcast, broadcastLog: QueueBroadcastLog) {
    const {
      appName,
      ariServer,
      ariUser,
      ariPass,
      trunk,
      timeout,
      audioPath,
      callerId,
    } = this.AriServer;

    let callEndpoint = broadcast.address;
    if (trunk) callEndpoint = `${trunk}/${broadcast.address}`;

    try {
      this.client = await ari.connect(ariServer, ariUser, ariPass, appName);
      await this.client.start(appName);

      const channel = await this.client.channels.originate({
        endpoint: callEndpoint,
        context: 'from-internal',
        channelId: broadcastLog.broadcastLogId,
        priority: 1,
        callerId: broadcast.session,
        app: appName,
      });

      console.log(callEndpoint);

      //this.onStatisStart(client, broadcast.session, callEndpoint);

      this.client.on('StasisStart', async (event, channel) => {
        await this.onStatisStart(
          event,
          channel,
          broadcast.session,
          callEndpoint,
        );
      });
      //this.onStatisEnd(client, callEndpoint);
      this.client.on('StasisEnd', async (event, channel) => {
        await this.onStatisEnd(event, channel, callEndpoint);
      });

      //this.onChannelDestroyed(client, callEndpoint);
      this.client.on('ChannelDestroyed', async (event, channel) => {
        await this.onChannelDestroyed(
          event,
          channel,
          this.client,
          callEndpoint,
        );
      });

      this.logger.log(`Call originated, channel ID: ${channel.id}`);
    } catch (err) {
      console.log('=====Error=====');
      const details: CallDetails = {
        trunk: this.AriServer.trunk,
        disposition: CallDisposition.FAILED,
      };
      broadcastLog.status = BroadcastStatus.FAIL;
      broadcastLog.details = details;
      setTimeout(async () => {
        await this.broadcastLogQueue.add(broadcastLog);
        await this.batchManager.endMonitoring(broadcastLog.broadcastLogId);
      }, 1500);
      this.logger.error(`Error: ${err}`);
    }
  }

  async onStatisStart(
    event,
    channel,
    sessionCuid: string,
    callEndpoint: string,
  ) {
    console.log('=====StasisStart=====', callEndpoint);
    this.logger.log(`Channel ${channel.id} entered Stasis`);

    // const hangupTimeout = setTimeout(async () => {
    //   console.log('=====Timeout=====', channel.id);
    //   await this.hangupCall(channel, 'timeout');
    // }, this.AriServer.timeout * 1000);

    try {
      //clearTimeout(hangupTimeout); // Clear the timeout since the call was answered

      // await this.playRecordingAndHangup(
      //   channel,
      //   client,
      //   //TODO
      //   //`${this.AriServer.audioPath}/${sessionCuid}`,
      //   `${this.AriServer.audioPath}/cb2ic9gls9afmjmsp0tom5mo`,
      //   callEndpoint,
      // );

      //const audio = `${this.AriServer.audioPath}/${sessionCuid}`;
      const audio = `${this.AriServer.audioPath}/cb2ic9gls9afmjmsp0tom5mo`;

      const playback = this.client.Playback();
      playback.on('PlaybackFinished', async (event, media) => {
        console.log('=====PlaybackFinished=====', callEndpoint);
        this.logger.log('PlaybackFinished');
        this.hangupCall(channel, 'PlaybackFinished');
      });

      await channel.play({ media: `sound:${audio}` }, playback);
      this.logger.log('Playing recording...');
      console.log('=====PlaybackStarted=====', callEndpoint);
    } catch (err) {
      this.logger.error(`Error in StasisStart handler: ${err}`);
    }
  }

  onStatisEnd(event, channel, callEndpoint: string) {
    console.log('=====StasisEnd=====', callEndpoint);
    this.logger.log(`Channel ${channel.id} left Stasis`);
    //this.clearEventListeners(channel);
  }

  // private async playRecordingAndHangup(channel, client, audio, callEndpoint) {
  //   try {
  //     const playback = client.Playback();
  //     await channel.play({ media: `sound:${audio}` }, playback);
  //     this.logger.log('Playing recording...');
  //     console.log('=====PlaybackStarted=====', callEndpoint);

  //     playback.on('PlaybackFinished', async (event, media) => {
  //       console.log('=====PlaybackFinished=====', callEndpoint);
  //       this.logger.log('PlaybackFinished');
  //       this.hangupCall(channel, 'PlaybackFinished');
  //     });
  //   } catch (err) {
  //     this.logger.error(`Error in playRecordingAndHangup: ${err}`);
  //   }
  // }

  // clearEventListeners(channel) {
  //   channel.removeAllListeners('StasisStart');
  //   channel.removeAllListeners('StasisEnd');
  //   channel.removeAllListeners('ChannelHangupRequest');
  // }

  hangupCall(channel: ari.Channel, reason = 'normal') {
    setTimeout(async () => {
      try {
        if (!this.isChannelDestroyed) await channel.hangup();
        this.logger.log(`Call hung up by system. reason: ${reason}`);
      } catch (err) {
        this.logger.error(`Error in hangupCall: ${err}`);
      }
    }, 500);
  }

  onChannelDestroyed(event, channel, client, callEndpoint: string) {
    console.log('=====ChannelDestroyed=====', callEndpoint);
    this.logger.log(`Channel ${channel.id} destroyed`);
    //this.clearEventListeners(channel);
    this.isChannelDestroyed = true;
    client.stop();
  }
}
