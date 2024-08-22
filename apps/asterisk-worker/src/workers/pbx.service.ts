// src/rabbitmq/rabbitmq.service.ts
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { BatchManger, BroadcastLogQueue } from '@rsconnect/queue';
import { Broadcast, QueueBroadcastLog } from '@rumsan/connect/types';
import ari, { Channel, Client } from 'ari-client';

@Injectable()
export class PbxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PbxService.name);
  private client: Client;
  private config;

  constructor(
    private readonly batchManager: BatchManger,
    private readonly broadcastLogQueue: BroadcastLogQueue,
  ) {
    this.config = {
      appName: 'rs-connect', //Math.floor(Math.random() * 1000000000).toString(),
      server: process.env.ASTERISK_ARI,
      user: process.env.ASTERISK_ARI_USER,
      password: process.env.ASTERISK_ARI_PASS,
      trunk: process.env.ASTERISK_TRUNK,
      timeout: +process.env.ASTERISK_TIMEOUT,
      audioPath: process.env.ASTERISK_AUDIO_PATH,
      callerId: process.env.ASTERISK_CALLER_ID,
    };
    console.log('-----------------PBXService-----------------');
  }

  async sendBroadcast(broadcast: Broadcast, broadcastLog: QueueBroadcastLog) {
    let callEndpoint = broadcast.address;
    if (this.config.trunk)
      callEndpoint = `${this.config.trunk}/${broadcast.address}`;

    const channel = await this.originateCall(
      callEndpoint,
      `${broadcastLog.broadcastId} <${broadcast.address}>`,
      [broadcastLog.broadcastLogId, broadcast.session, broadcast.address],
    );
    this.batchManager.startMonitoring(channel.id, broadcastLog);
    console.log('=====BroadcastStarted=====', channel?.caller?.number);
  }

  async originateCall(
    callEndpoint: string,
    callerId: string,
    appArgs: string[] = [],
  ) {
    return this.client.channels.originate({
      endpoint: callEndpoint,
      context: 'from-internal',
      //channelId: uniqueId,
      priority: 1,
      callerId: callerId || this.config.callerId || 'Rumsan Connect <0000>',
      app: this.config.appName,
      appArgs: appArgs.toString(),
    });
  }

  async playAudio(sessionId: string, channel: Channel) {
    //const audio = `${this.config.audioPath}/cb2ic9gls9afmjmsp0tom5mo`;
    const audio = `${this.config.audioPath}/${sessionId}`;

    const playback = this.client.Playback();
    playback.on('PlaybackFinished', async (event, media) => {
      try {
        await channel.hangup();
      } catch (error) {}
      console.log('=====PlaybackFinished=====', channel?.caller?.number);
    });

    await channel.play({ media: `sound:${audio}` }, playback);
    this.logger.log('Playing recording...');
    playback.on('PlaybackStarted', (event, media) => {
      console.log('=====PlaybackStarted=====', channel?.caller?.number);
    });
  }

  private async connect() {
    const { appName, server, user, password } = this.config;
    this.client = await ari.connect(server, user, password);

    this.client.on('StasisStart', (event, channel) =>
      this.onStasisStart(event, channel),
    );
    this.client.on('StasisEnd', (event, channel) =>
      this.onStatisEnd(event, channel),
    );
    this.client.on('ChannelDestroyed', (event, channel) =>
      this.onChannelDestroyed(event, channel),
    );

    await this.client.start(appName);
  }

  async onStasisStart(event, channel: Channel) {
    const [broadcastLogId, sessionId, address] = event.args;
    console.log('=====StasisStart=====', address);
    this.logger.log('StasisStart', channel);
    await this.playAudio(sessionId, channel);
  }

  onStatisEnd(event, channel) {
    console.log(
      '=====StasisEnd=====',
      event?.channel?.dialplan?.app_data?.split(',')?.[3],
    );
    this.logger.log(`Channel ${channel.id} left Stasis`);
  }

  onChannelDestroyed(event, channel: Channel) {
    console.log('=====ChannelDestroyed=====', channel?.caller?.number);
    this.logger.log(`Channel ${channel.id} was destroyed`);
  }

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    this.client.stop();
  }
}
