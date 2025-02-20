import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  BatchManger as BatchManager,
  BroadcastLogQueue,
} from '@rsconnect/queue';
import { Broadcast, QueueBroadcastLog } from '@rumsan/connect/types';
import ari, { Channel, Client } from 'ari-client';

interface IVRMenuOption {
  digit: number;
  prompt?: string;
  hangup?: boolean;
  action?: string; // For webhooks
  destination?: string; // For webhooks
}

interface IVRMenu {
  prompt: string;
  options: IVRMenuOption[];
}

interface IVRDialPlan {
  main: IVRMenu;
  [key: string]: IVRMenu; // For other menus
}
@Injectable()
export class IVRService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IVRService.name);
  private client: Client;
  private config;
  private ivrDialPlan: IVRDialPlan | null;
  private activePlaybacks;
  private hangupTimers;

  constructor(
    private readonly batchManager: BatchManager,
    private readonly broadcastLogQueue: BroadcastLogQueue,
  ) {
    this.config = {
      appName: 'rs-connect',
      server: process.env.ASTERISK_ARI,
      user: process.env.ASTERISK_ARI_USER,
      password: process.env.ASTERISK_ARI_PASS,
      trunk: process.env.ASTERISK_TRUNK,
      timeout: +process.env.ASTERISK_TIMEOUT,
      audioPath: process.env.ASTERISK_AUDIO_PATH,
      callerId: process.env.ASTERISK_CALLER_ID,
    };
    this.activePlaybacks = new Map(); // Maps channelId -> Playback instance
    this.hangupTimers = new Map(); // Maps channelId -> hangup instance
    this.logger.log('IVRService initialized', this.config);
  }

  callEndpoint = (broadcastAddress: string) => {
    if (broadcastAddress.startsWith('+977')) {
      broadcastAddress = broadcastAddress.slice(4);
    }
    return `${this.config.trunk}/${broadcastAddress}`;
  };

  async sendBroadcast(
    broadcast: Broadcast,
    broadcastLog: QueueBroadcastLog,
    ivrJSON?: string,
  ) {
    try {
      this.ivrDialPlan = ivrJSON ? JSON.parse(ivrJSON) : null;

      const channel = await this.originateCall(
        this.callEndpoint(broadcast.address),
        `${broadcastLog.broadcastId} <${broadcast.address}>`,
        [broadcastLog.broadcastLogId, broadcast.session, broadcast.address],
      );

      this.batchManager.startMonitoring(channel?.id, broadcastLog);
      this.logger.log('Broadcast started for IVR', channel?.caller?.number);

      this.client.on('StasisStart', async (event, incoming) => {
        if (event.channel.id !== channel.id) return;
        try {
          await incoming.answer();
          this.logger.log(`Call Answered: ${incoming.caller.number}`);
          const mainPrompt = this.ivrDialPlan?.main?.prompt.replace('.wav', '');

          if (mainPrompt) {
            this.playPrompt(incoming?.id, mainPrompt);
          }
        } catch (error) {
          this.logger.error('Error answering the call:', error);
        }
      });

      this.client.on('ChannelDtmfReceived', async (event, channel) => {
        try {
          this.handleDTMF(channel, event.digit);
        } catch (error) {
          this.logger.error('Error at ChannelDtmfReceived the call:', error);
        }
      });
    } catch (error) {
      this.logger.error('Error at ChannelDtmfReceived', error);
    }
  }

  async originateCall(
    callEndpoint: string,
    callerId: string,
    appArgs: string[] = [],
  ) {
    try {
      return await this.client.channels.originate({
        endpoint: callEndpoint,
        context: 'from-internal',
        priority: 1,
        callerId: callerId || this.config.callerId || 'Rumsan Connect <0000>',
        app: this.config.appName,
        appArgs: appArgs.toString(),
      });
    } catch (error) {
      this.logger.error('Error originating call', error);
      throw error;
    }
  }

  private async connect() {
    try {
      const { appName, server, user, password } = this.config;
      this.logger.log('Initiating ARI connection');

      this.client = await ari.connect(server, user, password);
      await this.client.start(appName);

      this.logger.log('ARI connected');
    } catch (error) {
      this.logger.error('Error connecting to ARI', error);
      throw error;
    }
  }

  async onModuleInit() {
    this.logger.log('Module Init');
    await this.connect();
  }

  async onModuleDestroy() {
    if (this.client) {
      this.logger.log('Stopping ARI client');
      this.client.stop();
    }
  }

  //////////// WORK FLOW CODE ///////////

  private async playPrompt(channelId, media) {
    try {
      // Stop any active playback
      await this.stopActivePlayback(channelId);
      this.cancelScheduledHangup(channelId);

      // Create a new playback
      const playback = this.client.Playback();
      this.activePlaybacks.set(channelId, playback);
      // console.log({ activePlaybacks: this.activePlaybacks });
      await this.client.channels.play({
        channelId: channelId,
        playbackId: playback.id,
        media: media,
      });

      console.log(`Playback started: ${media} on channel: ${channelId}`);

      // Handle playback completion
      playback.once('PlaybackFinished', () => {
        console.log(`Playback finished on channel: ${channelId}`);
        this.activePlaybacks.delete(channelId);
        // Schedule hangup after 10 seconds
        this.scheduleHangup(channelId, 10000); // 10000 ms = 10s
      });
    } catch (error) {
      console.error(`Error playing prompt: ${error.message}`);
    }
  }

  // Stop any active playback on a channel
  async stopActivePlayback(channelId) {
    try {
      if (this.activePlaybacks.has(channelId)) {
        const playback = this.activePlaybacks.get(channelId);
        await playback.stop();
        console.log(`Stopped active playback on channel: ${channelId}`);
        this.activePlaybacks.delete(channelId);
      }
    } catch (error) {
      console.error(`Error stopping playback: ${error.message}`);
    }
  }

  // Schedule call hangup after a delay
  async scheduleHangup(channelId, delay) {
    if (this.hangupTimers.has(channelId)) {
      this.cancelScheduledHangup(channelId);
    }

    const timer = setTimeout(async () => {
      try {
        console.log(`Attempting to hang up channel: ${channelId}`);
        await this.client.channels.hangup({ channelId });
        console.log(`Channel ${channelId} successfully hung up.`);
        this.cleanupChannel(channelId);
      } catch (error) {
        console.error(
          `Error hanging up channel ${channelId}: ${error.message}`,
        );
      }
    }, delay);

    this.hangupTimers.set(channelId, timer);
    this.logger.log(
      `Scheduled hangup for channel ${channelId} in ${delay / 1000} seconds`,
    );
  }

  // Cancel a scheduled hangup for a specific channel
  cancelScheduledHangup(channelId) {
    if (this.hangupTimers.has(channelId)) {
      clearTimeout(this.hangupTimers.get(channelId));
      this.hangupTimers.delete(channelId);
      console.log(`Cancelled scheduled hangup for channel: ${channelId}`);
    }
  }

  // Cleanup resources when the call ends
  cleanupChannel(channelId) {
    this.stopActivePlayback(channelId);
    this.cancelScheduledHangup(channelId);
    console.log(`Cleaned up resources for channel: ${channelId}`);
  }

  // HANDLE DTMF SIGNALS

  async handleDTMF(channel: Channel, digit: string) {
    try {
      this.logger.log(`DTMF received: ${digit} on channel: ${channel.id}`);
      await this.stopActivePlayback(channel.id);
      // Cancel any scheduled hangup if new interaction occurs
      this.cancelScheduledHangup(channel.id);
      const options = this.ivrDialPlan?.main?.options || [];
      const option = options.find((opt) => opt.digit === parseInt(digit));
      // switch (digit) {
      //   case '1':
      //     await this.playPrompt(channel.id, 'sound:morning');
      //     break;
      //   case '2':
      //     await this.playPrompt(channel.id, 'sound:evening');
      //     break;
      //   default:
      //     await this.playPrompt(channel.id, 'sound:option-is-invalid');
      // }
      // Play the corresponding prompt
      if (option) {
        if (option.prompt) {
          await this.playPrompt(channel.id, option.prompt.replace('.wav', ''));
        }
      } else {
        await this.playPrompt(channel.id, 'sound:option-is-invalid');
      }

      // TODO: Trigger the webhook if provided
      // if (option.action === 'webhook' && option.destination) {
      //   this.sendWebhook(option.destination, { channelId: channel.id, digit });
      // }
    } catch (error) {
      this.logger.error(`Error handling DTMF: ${error.message}`);
    }
  }
}
