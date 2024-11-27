import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import ari, { Channel, Client, Playback } from 'ari-client';

@Injectable()
export class IncomingAudio implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IncomingAudio.name);
  private client: Client;
  private config;

  constructor() {
    this.config = {
      appName: 'rs-connect-santosh', //Math.floor(Math.random() * 1000000000).toString(),
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

  private async connect() {
    const { appName, server, user, password } = this.config;

    try {
      this.client = await ari.connect(server, user, password);

      // Attach event handlers to ARI client
      this.client.on('StasisStart', (event, incoming) =>
        this.onStasisStart(event, incoming)
      );
      this.client.on('StasisEnd', (event, channel) =>
        this.onStasisEnd(event, channel)
      );
      this.client.on('ChannelDestroyed', (event, channel) =>
        this.onChannelDestroyed(event, channel)
      );
      // Log a successful connection
      this.logger.log('Connected to ARI');

      // Start the ARI application
      await this.client.start(appName);
    } catch (error) {
      this.logger.error('Failed to connect to ARI:', error);

      // Reconnect after a delay
      setTimeout(() => this.connect(), 5000); // Retry connection after 5 seconds
    }
  }

  async onStasisStart(event, incoming: Channel) {
    console.log('=====StasisStart=====');
    this.logger.log('StasisStart');
    try {
      await incoming.answer();
      await this.playAudio(incoming);
    } catch (error) {}
  }

  onStasisEnd(event, channel) {
    console.log('=====StasisEnd=====');
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

  async playAudio(incoming: Channel) {
    //const audio = `${this.config.audioPath}/zev7ahgky7ed5tq68ak191lr`; //NTC
    const audio = `${this.config.audioPath}/vm9o6c4445ai9j1zs02gv5pm`; //GOIP
    //const audio = `${this.config.audioPath}/${sessionId}`;

    const playback = this.client.Playback();
    playback.on('PlaybackFinished', async (event, media) => {
      try {
        //await incoming.hangup();
      } catch (error) {}
      console.log('=====PlaybackFinished=====', incoming?.caller?.number);
    });

    await incoming.play(
      {
        media: `sound://github.com/pbxware/asterisk-sounds/raw/master/demo-congrats.wav`,
        lang: 'en',
        offsetms: 0,
        skipms: 0,
        playbackId: 'demo-congrats',
      },
      playback,
      (err, playback) => {
        this.registerDtmfListeners(err, playback, incoming);
      }
    );
    this.logger.log('Playing recording...');
    playback.on('PlaybackStarted', (event, media) => {
      console.log('=====PlaybackStarted=====', incoming?.caller?.number);
    });
  }

  registerDtmfListeners(err, playback: Playback, incoming) {
    incoming.on(
      'ChannelDtmfReceived',
      /**
       *  Handle DTMF events to control playback. 5 pauses the playback, 8
       *  unpauses the playback, 4 moves the playback backwards, 6 moves the
       *  playback forwards, 2 restarts the playback, and # stops the playback
       *  and hangups the channel.
       *
       *  @callback channelDtmfReceivedCallback
       *  @memberof playback-example
       *  @param {Object} event - the full event object
       *  @param {module:resources~Channel} channel - the channel on which
       *    the dtmf event occured
       */
      async (event, channel) => {
        playback.stop();
        const digit = event.digit;

        switch (digit) {
          case '1':
            console.log('=====DTMF 1=====');
            break;
          case '2':
            console.log('=====DTMF 2=====');
            await this.recordAudio(channel);
            break;
          case '3':
            console.log('=====DTMF 3=====');
            await this.playRecordedAudio(channel);
            break;
          default:
            console.error('Unknown DTMF ', digit);
        }
      }
    );
  }

  async recordAudio(channel: Channel) {
    // Record
    //channel.mute();
    const recording = this.client.LiveRecording(channel.id.replace('.', '_'));
    console.log(recording.name);
    recording.on('RecordingFinished', (event, liveRecording) => {
      console.log('=====RecordingFinished=====');
      const playback = this.client.Playback();
      channel.play({ media: 'sound:vm-msgsaved' }, playback, function (err) {});
    });
    recording.on('RecordingFailed', (event, liveRecording) => {
      console.log('=====RecordingFailed=====');
    });
    recording.on('RecordingStarted', (event, liveRecording) => {
      console.log('=====RecordingStarted=====');
    });

    const opts = {
      name: channel.id.replace('.', '_'),
      format: 'wav',
      maxSilenceSeconds: 2,
      maxDurationSeconds: 60,
      beep: true,
      ifExists: 'overwrite',
      terminateOn: '#',
    };

    // Record a message
    await channel.record(opts, recording, function (err) {});
  }

  async playRecordedAudio(channel) {
    const playback = this.client.Playback();
    playback.on('PlaybackFinished', async (event, media) => {
      try {
        channel.hangup();
      } catch (error) {}
      console.log('=====PlaybackFinished=====', channel?.caller?.number);
    });
    this.client.recordings.listStored((err, recordings) => {
      if (err) {
        console.error(err);
        return;
      }
      const recording = recordings[recordings.length - 1];
      console.log(channel.id.replace('.', '_'));
      channel.play(
        { media: `recording:${channel.id.replace('.', '_')}` },
        playback,
        function (err) {
          if (err) {
            console.error(err);
          }
        }
      );
    });
  }
}
