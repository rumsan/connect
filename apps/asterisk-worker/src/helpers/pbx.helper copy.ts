import { Logger } from '@nestjs/common';
import { Broadcast, QueueBroadcastLog } from '@rsconnect/sdk/types';
import ari from 'ari-client';

export class PBXHelper {
  private readonly logger = new Logger(PBXHelper.name);
  private _channel: ari.Channel;

  private AriServer = {
    ariServer: process.env.ASTERISK_ARI,
    ariUser: process.env.ASTERISK_ARI_USER,
    ariPass: process.env.ASTERISK_ARI_PASS,
    trunk: process.env.ASTERISK_TRUNK,
    timeout: +process.env.ASTERISK_TIMEOUT,
    audioPath: process.env.ASTERISK_AUDIO_PATH,
  };

  async broadcastAudio(broadcast: Broadcast, broadcastLog: QueueBroadcastLog) {
    const { ariServer, ariUser, ariPass, trunk, timeout, audioPath } =
      this.AriServer;
    const appName = 'rs-connect';
    const callEndpoint = `${broadcast.address}`;
    //const callEndpoint = `${trunk}/${broadcast.address}`;
    //const callEndpoint = 'SIP/704';
    const callerId = `Rahat<+9779801109670>`;

    try {
      const client = await ari.connect(ariServer, ariUser, ariPass, appName);
      await client.start(appName);

      const hangupTimeout = setTimeout(async () => {
        console.log('=====Timeout=====');
        await this.hangupCall('timeout');
      }, timeout * 1000);

      this.onStatisStart(client, broadcast.session, hangupTimeout);
      this.onStatisEnd(client);
      this.onChannelDestroyed(client);

      this._channel = await client.channels.originate({
        endpoint: callEndpoint,
        context: 'from-internal',
        channelId: broadcastLog.cuid,
        priority: 1,
        callerId,
        app: appName,
      });
      this.logger.log(`Call originated, channel ID: ${this._channel.id}`);
    } catch (err) {
      this.logger.error(`Error: ${err}`);
    }
  }

  onStatisStart(
    client: ari.Client,
    sessionCuid: string,
    hangupTimeout: NodeJS.Timeout
  ) {
    client.on('StasisStart', async (event, channel) => {
      console.log('=====StasisStart=====');
      this.logger.log(`Channel ${this._channel.id} entered Stasis`);

      try {
        clearTimeout(hangupTimeout); // Clear the timeout since the call was answered

        await this.playRecordingAndHangup(
          channel,
          client,
          //TODO `${audioPath}/${broadcast.session}`
          //`${audioPath}/wcnm3u5bbbhs97991hpfcam9`
          `${this.AriServer.audioPath}/j4t6ia9uvopqp20zm47ewyka`
        );
      } catch (err) {
        this.logger.error(`Error in StasisStart handler: ${err}`);
      }
    });
  }

  onStatisEnd(client: ari.Client) {
    client.on('StasisEnd', async (event, channel) => {
      console.log('=====StasisEnd=====');
      this.logger.log(`Channel ${channel.id} left Stasis`);
      //this.clearEventListeners();
    });
  }

  private async playRecordingAndHangup(channel, client, audio) {
    try {
      const playback = client.Playback();
      await channel.play({ media: `sound:${audio}` }, playback);
      this.logger.log('Playing recording...');

      playback.on('PlaybackFinished', async (event, media) => {
        this.hangupCall('PlaybackFinished');
        console.log('=====PlaybackFinished=====');
      });
    } catch (err) {
      this.logger.error(`Error in playRecordingAndHangup: ${err}`);
    }
  }

  clearEventListeners() {
    this._channel.removeAllListeners('StasisStart');
    this._channel.removeAllListeners('StasisEnd');
    this._channel.removeAllListeners('ChannelHangupRequest');
  }

  hangupCall(reason = 'normal') {
    setTimeout(async () => {
      try {
        if (this._channel) await this._channel.hangup();
        this.logger.log(`Call hung up by system. reason: ${reason}`);
      } catch (err) {}
    }, 500);
  }

  onChannelDestroyed(client: ari.Client) {
    client.on('ChannelDestroyed', async (event, channel) => {
      console.log('=====ChannelDestroyed=====');
      console.log(event);
      this.logger.log(`Channel ${channel.id} destroyed`);
      this.clearEventListeners();
      this._channel = null;
      await client.stop();
    });
  }
}
