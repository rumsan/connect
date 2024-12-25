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
export class IVRService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IVRService.name);
  private client: Client;
  private config;
  private ivrDialPlan;
  private timeOut: NodeJS.Timeout;
  private timeOutState: boolean;
  private activePlaybacks: Set<string> = new Set();

  constructor(
    private readonly batchManager: BatchManger,
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
    console.log(this.config);
    console.log('-----------------IVRService-----------------');
  }

  async sendBroadcast(
    broadcast: Broadcast,
    broadcastLog: QueueBroadcastLog,
    ivrJSON: string,
  ) {
    this.ivrDialPlan = ivrJSON;
    let callEndpoint = broadcast.address;
    if (this.config.trunk)
      callEndpoint = `${this.config.trunk}/${broadcast.address}`;

    const channel = await this.originateCall(
      callEndpoint,
      `${broadcastLog.broadcastId} <${broadcast.address}>`,
      [broadcastLog.broadcastLogId, broadcast.session, broadcast.address],
    );
    this.batchManager.startMonitoring(channel?.id, broadcastLog);
    console.log('=====BroadcastStarted for IVR=====', channel?.caller?.number);
  }

  async originateCall(
    callEndpoint: string,
    callerId: string,
    appArgs: string[] = [],
  ) {
    return this?.client?.channels.originate({
      endpoint: callEndpoint,
      context: 'from-internal',
      priority: 1,
      callerId: callerId || this?.config?.callerId || 'Rumsan Connect <0000>',
      app: this?.config?.appName,
      appArgs: appArgs.toString(),
    });
  }

  private async connect() {
    const { appName, server, user, password } = this.config;
    this.client = await ari.connect(server, user, password);

    this.client.on('StasisStart', (event, channel) =>
      this.onStasisStart(event, channel),
    );
    this.client.on('ChannelDtmfReceived', (event, channel) =>
      this.handleKeyPress(event, channel),
    );
    this.client.on('StasisEnd', (event, channel) =>
      this.onStasisEnd(event, channel),
    );
    this.client.on('ChannelDestroyed', (event, channel) =>
      this.onChannelDestroyed(event, channel),
    );

    await this.client.start(appName);
  }

  async onChannelDestroyed(event, channel: Channel) {
    console.log('=====ChannelDestroyed=====', channel?.caller?.number);
    this.logger.log(`Channel ${channel.id} was destroyed`);
  }

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    this.client.stop();
  }

  async onStasisStart(event, channel: Channel) {
    const [broadcastLogId, sessionId, address] = event.args;
    console.log('=====StasisStart=====', address);
    this.logger.log('StasisStart', channel);
    await this.executeIVR(channel);
  }

  async onStasisEnd(event, channel) {
    console.log(
      '=StasisEnd=',
      event?.channel?.dialplan?.app_data?.split(',')?.[3],
    );
    await this.cleanupResources(channel);
    this.logger.log(`Cleaning up the resources before channel exits stasis`);
    this.logger.log(`Channel ${channel.id} left Stasis`);
  }

  // Utility function to check if a channel exists
  async channelExists(channelId: string): Promise<boolean> {
    try {
      this.logger.log('Starting channelExists...');
      const channel = await this.client.channels.get({ channelId });
      return !!channel;
    } catch (error) {
      this.logger.log('Error on channelExists...');
      this.logger.log(
        `Channel check failed for ID ${channelId}: ${error.message}`,
      );
      return false;
    }
  }

  // Utility function to cleanup resource (playbacks, timeouts etc)
  async cleanupResources(channel: Channel) {
    try {
      if (this.timeOut) {
        clearTimeout(this.timeOut);
        this.logger.log('Cleared timeout.');
      }

      this.activePlaybacks.forEach((playbackId) => {
        const playback = this.client.Playback();
        playback.id = playbackId;
        playback
          .stop()
          .catch((e) =>
            this.logger.log(
              `Failed to stop playback ${playbackId}: ${e.message}`,
            ),
          );
        this.activePlaybacks.delete(playbackId);
      });

      if (await this.channelExists(channel?.id)) {
        await this.handleHangup(channel);
        this.logger.log(`Channel ${channel?.id} successfully hung up.`);
      } else {
        this.logger.log('Channel not found during cleanup.');
      }
    } catch (e) {
      this.logger.log(`Error during resource cleanup: ${e.message}`);
    }
  }

  // Utility function to clean up active playbacks
  cleanupActivePlaybacks() {
    try {
      this.activePlaybacks.forEach((playbackId) => {
        const playback = this.client.Playback();
        playback.id = playbackId;
        playback
          .stop()
          .catch((e) =>
            this.logger.log(
              `Failed to stop playback ${playbackId}: ${e.message}`,
            ),
          );
        this.activePlaybacks.delete(playbackId);
      });
      this.logger.log('All active playbacks stopped and cleaned up.');
    } catch (e) {
      this.logger.log(`Error during playback cleanup: ${e.message}`);
    }
  }

  // Utility function for handling playback
  async handlePlayback(channel: Channel, sound: string) {
    try {
      this.logger.log('Starting handlePlayback...');
      const playback = this.client.Playback();
      this.activePlaybacks.add(playback?.id);

      await channel.play({ media: sound }, playback);

      playback.on('PlaybackFinished', () => {
        this.logger.log(`Playback finished for sound: ${sound}`);
        this.activePlaybacks.delete(playback?.id);
      });
    } catch (e) {
      this.logger.log(
        `Error during playback for sound: ${sound}. ${e.message}`,
      );
    }
  }

  // Utility function for handling playback
  async handlePlaybackAndHangUp(channel: Channel, sound: string) {
    try {
      this.logger.log('Starting handlePlaybackAndHangUp...');
      const playback = this.client.Playback();
      this.activePlaybacks.add(playback?.id);

      await channel.play({ media: sound }, playback);

      playback.on('PlaybackFinished', async () => {
        this.logger.log(`Playback finished for sound: ${sound}`);
        this.activePlaybacks.delete(playback?.id);
        await channel.hangup();
      });
    } catch (e) {
      this.logger.log(
        `Error during playback for sound: ${sound}. ${e.message}`,
      );
    }
  }

  //============Actual Code for Logic Implementation===============

  async executeIVR(channel: Channel, menuName = 'main') {
    try {
      this.logger.log('Starting Execute IVR...');

      // Check if channel exists
      if (!(await this.channelExists(channel?.id))) {
        this.logger.log('Channel not found at start. Aborting IVR execution.');
        return;
      }

      this.timeOutState = true;
      const menuConfig = await JSON.parse(this.ivrDialPlan);
      const menu = menuConfig[menuName];
      const playback = this.client.Playback();
      this.activePlaybacks.add(playback?.id);

      if (!menu?.prompt) {
        this.logger.log('Menu prompt not found. Exiting.');
        return;
      }

      const mainPromptSound = menu.prompt.replace('.wav', '');

      const waitForInput = async () => {
        const timeout = setTimeout(async () => {
          this.logger.log('No input received. Playing wrong key prompt.');
          if (!(await this.channelExists(channel?.id))) {
            this.logger.log('Channel not found during timeout. Cleaning up.');
            await this.cleanupResources(channel);
            return;
          }

          const playback = this.client.Playback();
          this.activePlaybacks.add(playback?.id);

          await channel.play(
            { media: 'sound:you-dialed-wrong-number' },
            playback,
          );

          playback.on('PlaybackFinished', async () => {
            this.activePlaybacks.delete(playback?.id);
            const tqPlayback = this.client.Playback();
            this.activePlaybacks.add(tqPlayback?.id);

            await channel.play({ media: 'sound:privacy-thankyou' }, tqPlayback);

            tqPlayback.on('PlaybackFinished', async () => {
              await this.cleanupResources(channel);
            });
          });
        }, 10000);

        this.timeOut = timeout;
      };

      playback.on('PlaybackFinished', async () => {
        this.logger.log('Main prompt playback finished.');
        if (this.timeOutState && (await this.channelExists(channel?.id))) {
          await waitForInput();
        }
      });

      // Play main menu prompt
      await channel.play({ media: mainPromptSound }, playback);
      this.logger.log('Playing main menu prompt...');
    } catch (e) {
      if (e.message.includes('Channel not found')) {
        this.logger.log('Channel not found. Cleaning up resources.');
      } else {
        this.logger.log(`Unexpected error in Execute IVR: ${e.message}`);
      }
      await this.cleanupResources(channel);
    }
  }

  async handleKeyPress(event, channel: Channel) {
    try {
      this.logger.log('Starting handleKeyPress...');

      // Check if channel exists before proceeding
      if (!(await this.channelExists(channel?.id))) {
        this.logger.log(
          'Channel not found during key press handling. Aborting.',
        );
        return;
      }

      // Stop and cleanup any ongoing playbacks
      this.cleanupActivePlaybacks();

      // Load menu configuration
      const menuConfig = await JSON.parse(this.ivrDialPlan);
      const menu = menuConfig['main'];

      // Clear any active timeout to prevent overlaps
      if (this.timeOutState) {
        clearTimeout(this.timeOut);
        this.timeOutState = false;
        this.logger.log('Cleared timeout during handleKeyPress.');
      }

      // Find the selected menu option
      const selectedOption = menu.options.find(
        (o) => o.digit === parseInt(event.digit, 10),
      );

      if (!selectedOption) {
        this.logger.log('Invalid option. Replaying "wrong number" prompt.');

        // Play the "wrong number" prompt
        await this.handlePlaybackAndHangUp(
          channel,
          'sound:you-dialed-wrong-number',
        );
      } else {
        this.logger.log(`Valid option selected: ${selectedOption.digit}`);
        await this.handleKeyOption(channel, selectedOption);
      }
    } catch (e) {
      if (e.message.includes('Channel not found')) {
        this.logger.log('Channel not found during key press. Cleaning up.');
      } else {
        this.logger.log(`Unexpected error in handleKeyPress: ${e.message}`);
      }
      await this.cleanupResources(channel);
    }
  }

  async handleKeyOption(channel: Channel, option: any) {
    try {
      this.logger.log('Starting handleKeyOption...');

      // Check if the channel exists before proceeding
      if (!(await this.channelExists(channel?.id))) {
        this.logger.log('Channel not found during handleKeyOption. Aborting.');
        return;
      }

      switch (option?.action) {
        case 'webhook': {
          this.logger.log('Triggering webhook action...');

          if (!option?.prompt) {
            this.logger.log('No prompt specified for the webhook action.');
            return;
          }

          const promptAudio = option.prompt.replace('.wav', '');
          const playback = this.client.Playback();
          this.activePlaybacks.add(playback?.id);

          await channel.play({ media: promptAudio }, playback);

          playback.on('PlaybackFinished', async () => {
            this.activePlaybacks.delete(playback?.id);
            this.logger.log('Webhook prompt playback finished.');

            if (option?.hangup) {
              this.logger.log('Hangup requested after webhook action.');
              await this.cleanupResources(channel);
            } else {
              this.logger.log('Hangup not requested after webhook action.');
            }
          });

          break;
        }

        default: {
          this.logger.log(`Unknown action encountered: ${option?.action}`);
          const playback = this.client.Playback();
          this.activePlaybacks.add(playback?.id);

          await channel.play(
            { media: 'sound:you-dialed-wrong-number' },
            playback,
          );

          playback.on('PlaybackFinished', async () => {
            this.activePlaybacks.delete(playback?.id);
            this.logger.log(
              'Invalid option playback finished. Cleaning up resources.',
            );
            await this.cleanupResources(channel);
          });

          break;
        }
      }
    } catch (e) {
      if (e.message.includes('Channel not found')) {
        this.logger.log(
          'Channel not found during handleKeyOption. Cleaning up.',
        );
      } else {
        this.logger.log(`Unexpected error in handleKeyOption: ${e.message}`);
      }
      await this.cleanupResources(channel);
    }
  }

  async handleHangup(channel: Channel) {
    try {
      this.logger.log('Starting handleHangup...');
      for (const playbackId of this.activePlaybacks) {
        try {
          await this.client.playbacks.stop({ playbackId });
          this.logger.log(`Stopped playback with ID: ${playbackId}`);
        } catch (e) {
          this.logger.error(
            `Error stopping playback with ID: ${playbackId}`,
            e,
          );
        }
      }
      this.activePlaybacks.clear();
      // Verify if the channel still exists
      if (channel && (await this.channelExists(channel.id))) {
        await channel.hangup();
        this.logger.log(`Channel ${channel.id} hung up successfully.`);
      } else {
        this.logger.warn(
          `Channel ${channel?.id} does not exist or was already hung up.`,
        );
      }
      this.logger.log(`Channel ${channel.id} hung up successfully.`);
    } catch (e) {
      this.logger.log('Error on handleHangup...');
      console.log('Err >>>>>>>>>>', e);
    }
  }
}
