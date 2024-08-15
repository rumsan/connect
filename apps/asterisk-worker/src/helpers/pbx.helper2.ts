import { Injectable, Logger } from '@nestjs/common';
import { Broadcast, QueueBroadcastLog } from '@rumsan/connect/types';
import * as ariClient from 'ari-client';

@Injectable()
export class PBXHelper {
  private readonly logger = new Logger(PBXHelper.name);

  private AriServer = {
    ariServer: process.env.ASTERISK_ARI,
    ariUser: process.env.ASTERISK_ARI_USER,
    ariPass: process.env.ASTERISK_ARI_PASS,
    trunk: process.env.ASTERISK_TRUNK,
    timeout: +process.env.ASTERISK_TIMEOUT,
  };

  audioFolder = process.env.ASTERISK_AUDIO_PATH; // 'recording';

  async broadcastAudio(
    broadcast: Broadcast,
    broadcastLog: QueueBroadcastLog
  ): Promise<void> {
    try {
      const { ariServer, ariUser, ariPass, trunk, timeout } = this.AriServer;

      const callEndpoint = `${trunk}/${broadcast.address}`;
      //const callEndpoint = 'SIP/704';
      const audio = 'wcnm3u5bbbhs97991hpfcam9';

      const client = await this.connectToAri(ariServer, ariUser, ariPass);

      //const appName = broadcast.cuid;
      const appName = (
        Math.floor(Math.random() * (99999 - 10000 + 1)) + 10000
      ).toString();
      client.start(appName);

      this.logger.log('Connected to Ari.');
      this.logger.log('Call endpoint', callEndpoint);

      const channel = await this.originateCall(
        appName,
        client,
        callEndpoint,
        broadcastLog.cuid
      );

      const { id: channelId } = channel;

      return new Promise((resolve, reject) => {
        const callTimeout: NodeJS.Timeout = setTimeout(() => {
          this.logger.error('Call timed out', channelId);
          this.clearEventListeners(channel);
          reject();
        }, timeout * 1000);

        channel.on('StasisStart', async (event) => {
          this.logger.log('StasisStart');
          clearTimeout(callTimeout);
          try {
            if (channel && channel.id === channelId) {
              await this.playSound(channel, client, audio, this.audioFolder);
            }
            resolve();
          } catch (err) {
            this.logger.error('Error during playback or hangup:', err);
            reject();
          }
        });

        channel.on('StasisEnd', async (event) => {
          this.logger.log('StasisEnd');
          //console.log(event);
          clearTimeout(callTimeout);
          try {
            this.clearEventListeners(channel);
            resolve();
          } catch (err) {
            reject();
            this.logger.error('StatisEnd Error:', err);
          }
        });
      });
    } catch (err) {
      this.logger.error('IVR Error', err);
      console.log(err);
    }
  }

  async connectToAri(
    ariServer: string,
    ariUsername: string,
    ariPassword: string
  ): Promise<ariClient.Client> {
    this.logger.log('Connecting to Ari.');
    return new Promise((resolve, reject) => {
      ariClient.connect(ariServer, ariUsername, ariPassword, (err, client) => {
        if (err) {
          console.log('Ari connection err:', err);
          reject(err);
        } else {
          resolve(client);
        }
      });
    });
  }

  async originateCall(
    appName: string,
    client: ariClient.Client,
    callEndpoint: string,
    callerNo: string
  ): Promise<ariClient.Channel> {
    return new Promise((resolve, reject) => {
      console.log('callerNo:', callerNo);
      client.channels.originate(
        {
          endpoint: callEndpoint,
          app: appName,
          context: 'from-internal',
          callerId: `Rahat <${callerNo}>`,
          // timeout: 30,
        },
        (err, channel) => {
          if (err) {
            this.logger.error('Call origiate err:', err);
            reject(err);
          } else {
            resolve(channel);
          }
        }
      );
    });
  }

  async playSound(
    channel: ariClient.Channel,
    client: ariClient.Client,
    audioFile: string,
    mappedFolder?: string
  ) {
    const media = mappedFolder
      ? `sound:${mappedFolder}/${audioFile}`
      : `${audioFile}`;

    console.log('Playing media:', media);
    return new Promise((resolve, reject) => {
      const playback = client.Playback();
      playback.once('PlaybackFinished', async (r) => {
        console.log(r);
        if (r.playback?.state !== 'failed') {
          //TODO: Do something??? state is "failed", when the audio file is not found or user hangs up in the middle of listening. If the full audio is played, state is "done".
        }

        try {
          await this.hangupChannel(channel, channel.id);
        } catch (err) {}
        resolve(playback);
      });
      channel.play(
        {
          media,
        },
        playback,
        (err) => {
          if (err) {
            reject(err);
          }
        }
      );
    });
  }

  async hangupChannel(
    channel: ariClient.Channel,
    channelId: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (channel && channel.id === channelId) {
        channel.hangup((err) => {
          if (err) {
            console.log('hangup err', err?.message);
            reject(err);
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  clearEventListeners(channel: ariClient.Channel) {
    channel.removeAllListeners('StasisStart');
    channel.removeAllListeners('StasisEnd');
    channel.removeAllListeners('ChannelHangupRequest');
  }
}
