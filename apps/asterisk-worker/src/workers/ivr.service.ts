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
import { randomUUID } from 'crypto';
import { ChannelStateManager } from './channel-state.manager';
import { PlaybackService } from './playback.service';

@Injectable()
export class IVRService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IVRService.name);
  private client: Client;
  private config;

  constructor(
    private readonly batchManager: BatchManager,
    private readonly broadcastLogQueue: BroadcastLogQueue,
    private readonly channelStateManager: ChannelStateManager,
    private readonly playbackService: PlaybackService,
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
    const ivrDialPlan = ivrJSON ? JSON.parse(ivrJSON) : null;

    // BUG FIX: Pre-generate channelId and register state BEFORE originate
    // to prevent race condition where StasisStart fires before state is set
    const channelId = randomUUID();

    this.channelStateManager.registerChannel({
      channelId,
      ivrDialPlan,
      sessionId: broadcast.session,
      broadcastLogId: broadcastLog.broadcastLogId,
      address: broadcast.address,
    });

    try {
      await this.originateCall(
        channelId,
        this.callEndpoint(broadcast.address),
        `${broadcastLog.broadcastId} <${broadcast.address}>`,
        [broadcastLog.broadcastLogId, broadcast.session, broadcast.address],
      );

      this.batchManager.startMonitoring(channelId, broadcastLog);
      this.logger.log(
        `Broadcast started for IVR - Channel: ${channelId}, Address: ${broadcast.address}`,
      );
    } catch (error) {
      // Clean up pre-registered state on originate failure
      this.channelStateManager.removeChannel(channelId);
      this.logger.error('Error in sendBroadcast:', error);
      throw error;
    }
  }

  async originateCall(
    channelId: string,
    callEndpoint: string,
    callerId: string,
    appArgs: string[] = [],
  ) {
    try {
      return await this.client.channels.originate({
        channelId,
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

      // Share the ARI client with dependent services
      this.channelStateManager.setClient(this.client);
      this.playbackService.setClient(this.client);

      this.logger.log('ARI connected');
    } catch (error) {
      this.logger.error('Error connecting to ARI', error);
      throw error;
    }
  }

  async onModuleInit() {
    this.logger.log('Module Init');
    await this.connect();

    // Handle StasisStart - when a channel enters the Stasis application
    this.client.on('StasisStart', async (event, incomingChannel) => {
      try {
        const channelId = event.channel.id;
        const [broadcastLogId, sessionId, incomingAddress] = event.args || [];

        const channelState = this.channelStateManager.getState(channelId);
        if (!channelState) {
          this.logger.warn(
            `StasisStart received for unknown channel: ${channelId}`,
          );
          return;
        }

        if (sessionId) channelState.sessionId = sessionId;
        if (broadcastLogId) channelState.broadcastLogId = broadcastLogId;
        if (incomingAddress) channelState.address = incomingAddress;

        await incomingChannel.answer();
        this.logger.log(
          `Call Answered: ${incomingChannel.caller.number} on channel: ${channelId}`,
        );

        if (channelState.ivrDialPlan?.main?.prompt) {
          const mainPrompt = channelState.ivrDialPlan.main.prompt.replace(
            '.wav',
            '',
          );
          await this.playbackService.playPrompt(channelId, mainPrompt);
        } else {
          await this.playbackService.playAudio(
            channelState.sessionId,
            incomingChannel,
          );
        }
      } catch (error) {
        this.logger.error('Error in StasisStart handler:', error);
      }
    });

    // Handle DTMF events
    this.client.on('ChannelDtmfReceived', async (event, channel) => {
      try {
        await this.handleDTMF(channel, event.digit);
      } catch (error) {
        this.logger.error('Error in ChannelDtmfReceived handler:', error);
      }
    });

    // Handle channel hangup events
    this.client.on('StasisEnd', async (event) => {
      try {
        const channelId = event.channel.id;
        this.logger.log(`StasisEnd received for channel: ${channelId}`);
        await this.channelStateManager.cleanupChannel(channelId);
      } catch (error) {
        this.logger.error('Error in StasisEnd handler:', error);
      }
    });

    // Handle channel state changes (including hangup)
    this.client.on('ChannelStateChange', async (event) => {
      try {
        const channelId = event.channel.id;
        const state = event.channel.state;

        if (state === 'Down' || state === 'Rsrvd') {
          const channelState = this.channelStateManager.getState(channelId);
          if (channelState?.isActive) {
            this.logger.log(
              `Channel ${channelId} state changed to ${state}, cleaning up`,
            );
            await this.channelStateManager.cleanupChannel(channelId);
          }
        }
      } catch (error) {
        this.logger.error('Error in ChannelStateChange handler:', error);
      }
    });
  }

  async onModuleDestroy() {
    if (this.client) {
      this.logger.log('Stopping ARI client');
      this.client.stop();
    }
  }

  // HANDLE DTMF SIGNALS
  async handleDTMF(channel: Channel, digit: string) {
    const channelId = channel.id;
    const channelState = this.channelStateManager.getState(channelId);

    if (!channelState) {
      this.logger.warn(
        `DTMF received for unknown channel: ${channelId}, digit: ${digit}`,
      );
      return;
    }

    if (!channelState.isActive) {
      this.logger.warn(
        `DTMF received for inactive channel: ${channelId}, digit: ${digit}`,
      );
      return;
    }

    if (!channelState.ivrDialPlan) {
      this.logger.warn(
        `DTMF received for non-IVR channel: ${channelId}, digit: ${digit}`,
      );
      return;
    }

    try {
      this.logger.log(`DTMF received: ${digit} on channel: ${channelId}`);
      await this.channelStateManager.stopActivePlayback(channelId);
      this.channelStateManager.cancelScheduledHangup(channelId);

      // Digit '0' replays the main IVR prompt
      if (digit === '0') {
        const mainPrompt = channelState.ivrDialPlan.main?.prompt;
        if (mainPrompt) {
          await this.playbackService.playPrompt(
            channelId,
            mainPrompt.replace('.wav', ''),
          );
        }
        return;
      }

      const options = channelState.ivrDialPlan.main?.options || [];
      const option = options.find((opt) => opt.digit === parseInt(digit));

      if (option?.prompt) {
        await this.playbackService.playPrompt(
          channelId,
          option.prompt.replace('.wav', ''),
          option.hangup === true,
        );
      } else {
        await this.playbackService.playPrompt(
          channelId,
          'sound:option-is-invalid',
        );
      }

      // TODO: Trigger the webhook if provided
      // if (option?.action === 'webhook' && option?.destination) {
      //   this.sendWebhook(option.destination, { channelId, digit });
      // }
    } catch (err) {
      this.logger.error(
        `Error handling DTMF on channel ${channelId}: ${(err as Error).message}`,
      );
    }
  }
}
