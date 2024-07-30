import { Injectable, Logger } from '@nestjs/common';
import * as ariClient from 'ari-client';

interface TransportDetails {
  transportId: number;
  ariHost: string;
  ariPort: string;
  sftpPort: string;
  ariFolder: string;
  ariPassword: string;
  ariProtocol: string;
  ariUsername: string;
  ariBaseEndpoint: string;
}

interface ConsumerDetails {
  discordId: string | null;
  discordToken: string | null;
  name: string;
  email: string;
  phone: string;
}

interface CommunicationLog {}

interface IVRRequestData {
  id: number;
  details: ConsumerDetails;
  appId: string;
  notifiedInbound: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  CommunicationLog: CommunicationLog[];
  transportDetails: TransportDetails;
  campaignId: number;
  body: string;
  trunk: string;
  route: string;
  callerNo: string;
}

@Injectable()
export class PBXHelper {
  private readonly logger = new Logger(PBXHelper.name);

  private NTCARIServer = {
    ariServer: process.env.NTC_ARI_CONN_STRING,
    ariUser: process.env.NTC_ARI_USER,
    ariPass: process.env.NTC_ARI_PASS,
  };

  private GOIPARIServer = {
    ariServer: process.env.GOIP_ARI_CONN_STRING,
    ariUser: process.env.GOIP_ARI_USER,
    ariPass: process.env.GOIP_ARI_PASS,
  };

  async sendNTCIVR(data: IVRRequestData): Promise<void> {
    try {
      const { ariServer, ariUser, ariPass } = this.NTCARIServer;

      const phone = data.details.phone;
      const sanitizedPhone = phone.substring(phone.length - 10);
      const callEndpoint = `SIP/${process.env.NTC_TRUNK}/${sanitizedPhone}`;
      const audio = data.body.split('.')[0];
      const mappedFolder = 'recording';

      const client = await this.connectToAri(ariServer, ariUser, ariPass);

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
        data.callerNo,
      );
      const { id: channelId } = channel;

      return new Promise((resolve, reject) => {
        let callTimeout: NodeJS.Timeout;

        channel.on('StasisStart', async (event) => {
          this.logger.log('StasisStart');
          clearTimeout(callTimeout);
          try {
            if (channel && channel.id === channelId) {
              await this.playSound(channel, client, audio, mappedFolder);
              await this.hangupChannel(client, channel, channelId);
            }
            resolve();
          } catch (err) {
            this.logger.error('Error during playback or hangup:', err);
            reject();
          }
        });

        channel.on('StasisEnd', async (event) => {
          this.logger.log('StasisEnd');
          clearTimeout(callTimeout);
          try {
            this.clearEventListeners(channel);
            resolve();
          } catch (err) {
            reject();
            this.logger.error('StatisEnd Error:', err);
          }
        });

        callTimeout = setTimeout(() => {
          this.logger.error('Call timed out', channelId);
          this.clearEventListeners(channel);
          reject();
        }, 25000); //default nepal timeout
      });
    } catch (err) {
      this.logger.error('IVR Error', err);
      console.log(err);
    }
  }

  async sendIVR(data: IVRRequestData): Promise<void> {
    try {
      const { ariServer, ariUser, ariPass } = this.GOIPARIServer;

      const callEndpoint = `SIP/${data.trunk}/${data.route}${data.details.phone}`;
      const audio = data.body.split('.')[0];
      const mappedFolder = 'recording';

      const client = await this.connectToAri(ariServer, ariUser, ariPass);

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
        data.callerNo,
      );

      const { id: channelId } = channel;

      return new Promise((resolve, reject) => {
        let callTimeout: NodeJS.Timeout;

        channel.on('StasisStart', async (event) => {
          this.logger.log('StasisStart');
          clearTimeout(callTimeout);
          try {
            if (channel && channel.id === channelId) {
              await this.playSound(channel, client, audio, mappedFolder);
              await this.hangupChannel(client, channel, channelId);
            }
            resolve();
          } catch (err) {
            this.logger.error('Error during playback or hangup:', err);
            reject();
          }
        });

        channel.on('StasisEnd', async (event) => {
          this.logger.log('StasisEnd');
          clearTimeout(callTimeout);
          try {
            this.clearEventListeners(channel);
            resolve();
          } catch (err) {
            reject();
            this.logger.error('StatisEnd Error:', err);
          }
        });

        callTimeout = setTimeout(() => {
          this.logger.error('Call timed out', channelId);
          this.clearEventListeners(channel);
          reject();
        }, 25000); //default nepal timeout
      });
    } catch (err) {
      this.logger.error('IVR Error', err);
      console.log(err);
    }
  }

  async connectToAri(
    ariServer: string,
    ariUsername: string,
    ariPassword: string,
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
    callerNo: string,
  ): Promise<ariClient.Channel> {
    return new Promise((resolve, reject) => {
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
        },
      );
    });
  }

  async playSound(
    channel: ariClient.Channel,
    client: ariClient.Client,
    audioFile: string,
    mappedFolder?: string,
  ) {
    return new Promise((resolve, reject) => {
      const playback = client.Playback();
      channel.play(
        {
          media: mappedFolder ? `${mappedFolder}:${audioFile}` : `${audioFile}`,
        },
        playback,
        (err) => {
          if (err) {
            reject(err);
          }
        },
      );

      playback.once('PlaybackFinished', (r) => {
        console.log(r);

        resolve(playback);
      });
    });
  }

  async hangupChannel(
    client: ariClient.Client,
    channel: ariClient.Channel,
    channelId: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (channel && channel.id === channelId) {
        channel.hangup((err) => {
          if (err) {
            console.log('hangup err', err);
            reject(err);
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
      // channel.hangup();
      // client.channels.hangup({ channelId }, (err) => {
      //   if (err) {
      //     reject(err);
      //   } else {
      //     resolve();
      //   }
      // });
    });
  }

  clearEventListeners(channel: ariClient.Channel) {
    channel.removeAllListeners('StasisStart');
    channel.removeAllListeners('StasisEnd');
    channel.removeAllListeners('ChannelHangupRequest');
  }
}
