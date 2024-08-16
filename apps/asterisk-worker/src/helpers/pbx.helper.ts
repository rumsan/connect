import { Injectable, Logger } from '@nestjs/common';
import {
  Broadcast,
  BroadcastStatus,
  CallDetails,
  CallDisposition,
  QueueBroadcastLog,
  QueueBroadcastVoiceLog,
} from '@rumsan/connect/types';
import ari from 'ari-client';
import { QueueService } from '../workers/queue.service';
import { AMIService } from '../workers/ami.service';

@Injectable()
export class PBXHelper {
  private readonly logger = new Logger(PBXHelper.name);
  private isChannelDestroyed = false;

  private AriServer = {
    appName: process.env.ASTERISK_APP_NAME,
    ariServer: process.env.ASTERISK_ARI,
    ariUser: process.env.ASTERISK_ARI_USER,
    ariPass: process.env.ASTERISK_ARI_PASS,
    trunk: process.env.ASTERISK_TRUNK,
    timeout: +process.env.ASTERISK_TIMEOUT,
    audioPath: process.env.ASTERISK_AUDIO_PATH,
    callerId: process.env.ASTERISK_CALLER_ID,
  };

  constructor(
    private readonly queue: QueueService,
    private readonly amiService: AMIService,
  ) {}

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

    //const callEndpoint = `${broadcast.address}`;
    const callEndpoint = `${trunk}/${broadcast.address}`;
    //const callEndpoint = 'SIP/704';

    try {
      const client = await ari.connect(ariServer, ariUser, ariPass, appName);
      await client.start(appName);

      const channel = await client.channels.originate({
        endpoint: callEndpoint,
        context: 'from-internal',
        channelId: broadcastLog.cuid,
        priority: 1,
        callerId,
        app: appName,
      });

      this.amiService.startCallMonitor(broadcastLog.cuid, {
        attempt: broadcastLog.attempt,
        broadcast: broadcastLog.broadcast,
      });

      const hangupTimeout = setTimeout(async () => {
        console.log('=====Timeout=====', channel.id);
        await this.hangupCall(channel, 'timeout');
      }, timeout * 1000);

      this.onStatisStart(
        client,
        broadcast.session,
        broadcastLog,
        hangupTimeout,
      );
      this.onStatisEnd(client);
      this.onChannelDestroyed(client, broadcastLog);

      this.logger.log(`Call originated, channel ID: ${channel.id}`);
    } catch (err) {
      const details: CallDetails = {
        trunk: this.AriServer.trunk,
        disposition: CallDisposition.FAILED,
      };
      broadcastLog.status = BroadcastStatus.FAIL;
      broadcastLog.details = details;
      setTimeout(async () => {
        await this.queue.addToLogQueue(broadcastLog);
      }, 1500);
      this.amiService.endCallMonitor(broadcastLog.cuid);
      this.logger.error(`Error: ${err}`);
    }
  }

  onStatisStart(
    client: ari.Client,
    sessionCuid: string,
    broadcastLog: QueueBroadcastLog,
    hangupTimeout: NodeJS.Timeout,
  ) {
    client.on('StasisStart', async (event, channel) => {
      this.logger.log(`Channel ${channel.id} entered Stasis`);

      try {
        clearTimeout(hangupTimeout); // Clear the timeout since the call was answered

        await this.playRecordingAndHangup(
          channel,
          client,
          //TODO
          `${this.AriServer.audioPath}/${sessionCuid}`,
          //`${this.AriServer.audioPath}/q2vep0n91il16jfb03idp8lf`,
          //`${this.AriServer.audioPath}/j4t6ia9uvopqp20zm47ewyka`,
        );
      } catch (err) {
        this.logger.error(`Error in StasisStart handler: ${err}`);
      }
    });
  }

  onStatisEnd(client: ari.Client) {
    client.on('StasisEnd', async (event, channel) => {
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
        this.hangupCall(channel, 'PlaybackFinished');
      });
    } catch (err) {
      this.logger.error(`Error in playRecordingAndHangup: ${err}`);
    }
  }

  clearEventListeners(channel) {
    channel.removeAllListeners('StasisStart');
    channel.removeAllListeners('StasisEnd');
    channel.removeAllListeners('ChannelHangupRequest');
  }

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

  onChannelDestroyed(client: ari.Client, broadcastLog: QueueBroadcastLog) {
    client.on('ChannelDestroyed', async (event, channel) => {
      // logData.details = {
      //   trunk: this.AriServer.trunk,
      //   disposition: CallDisposition.ANSWERED,
      //   uniqueId: channel.id,
      //   hangupCode: getHangupCause(event.cause).toString(),
      // };
      // this.queue.addLog(logData);
      this.logger.log(`Channel ${channel.id} destroyed`);
      this.clearEventListeners(channel);
      this.isChannelDestroyed = true;
      await client.stop();
    });
  }
}

// trunk: string;
// disposition: CallDisposition;
// answerTime?: Date;
// endTime?: Date;
// duration?: number;
// uniqueId?: string;
// hangupCode?: string;
// hangupDetails?: Record<string, string>;
// cdr?: Record<string, string>;
