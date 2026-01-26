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
import ari, { Channel, Client, Playback } from 'ari-client';

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

interface ChannelState {
  channelId: string;
  ivrDialPlan: IVRDialPlan | null;
  sessionId: string;
  broadcastLogId: string;
  address: string;
  activePlayback: Playback | null;
  activePlaybackId: string | null; // Track playback ID to prevent stale event handlers
  hangupTimer: NodeJS.Timeout | null;
  isActive: boolean;
}
@Injectable()
export class IVRService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IVRService.name);
  private client: Client;
  private config;
  private channelStates: Map<string, ChannelState>; // Maps channelId -> ChannelState

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
    this.channelStates = new Map(); // Maps channelId -> ChannelState
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
      const ivrDialPlan = ivrJSON ? JSON.parse(ivrJSON) : null;

      const channel = await this.originateCall(
        this.callEndpoint(broadcast.address),
        `${broadcastLog.broadcastId} <${broadcast.address}>`,
        [broadcastLog.broadcastLogId, broadcast.session, broadcast.address],
      );

      if (!channel?.id) {
        throw new Error('Failed to originate call - no channel ID returned');
      }

      // Create and store channel state
      const channelState: ChannelState = {
        channelId: channel.id,
        ivrDialPlan,
        sessionId: broadcast.session,
        broadcastLogId: broadcastLog.broadcastLogId,
        address: broadcast.address,
        activePlayback: null,
        activePlaybackId: null,
        hangupTimer: null,
        isActive: true,
      };

      this.channelStates.set(channel.id, channelState);
      this.batchManager.startMonitoring(channel.id, broadcastLog);
      this.logger.log(
        `Broadcast started for IVR - Channel: ${channel.id}, Address: ${broadcast.address}`,
      );
    } catch (error) {
      this.logger.error('Error in sendBroadcast:', error);
      throw error;
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
    // Register event listeners only once at startup

    // Handle StasisStart - when a channel enters the Stasis application
    this.client.on('StasisStart', async (event, incomingChannel) => {
      try {
        const channelId = event.channel.id;
        const [broadcastLogId, sessionId, incomingAddress] = event.args || [];

        // Get channel state
        const channelState = this.channelStates.get(channelId);
        if (!channelState) {
          this.logger.warn(
            `StasisStart received for unknown channel: ${channelId}`,
          );
          return;
        }

        // Update state with actual session info if available
        if (sessionId) channelState.sessionId = sessionId;
        if (broadcastLogId) channelState.broadcastLogId = broadcastLogId;
        if (incomingAddress) channelState.address = incomingAddress;

        await incomingChannel.answer();
        this.logger.log(
          `Call Answered: ${incomingChannel.caller.number} on channel: ${channelId}`,
        );

        // Check if this is an IVR call or regular audio call
        if (channelState.ivrDialPlan?.main?.prompt) {
          const mainPrompt = channelState.ivrDialPlan.main.prompt.replace(
            '.wav',
            '',
          );
          await this.playPrompt(channelId, mainPrompt);
        } else {
          // Regular audio playback
          await this.playAudio(channelState.sessionId, incomingChannel);
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
        this.cleanupChannel(channelId);
      } catch (error) {
        this.logger.error('Error in StasisEnd handler:', error);
      }
    });

    // Handle channel state changes (including hangup)
    this.client.on('ChannelStateChange', async (event) => {
      try {
        const channelId = event.channel.id;
        const state = event.channel.state;

        // If channel is hung up, cleanup
        if (state === 'Down' || state === 'Rsrvd') {
          const channelState = this.channelStates.get(channelId);
          if (channelState?.isActive) {
            this.logger.log(
              `Channel ${channelId} state changed to ${state}, cleaning up`,
            );
            this.cleanupChannel(channelId);
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

  async playAudio(sessionId: string, channel: Channel) {
    const channelId = channel.id;
    const channelState = this.channelStates.get(channelId);

    if (!channelState || !channelState.isActive) {
      this.logger.warn(
        `Attempted to play audio on inactive or unknown channel: ${channelId}`,
      );
      return;
    }

    const audio = `${this.config.audioPath}/${sessionId}`;
    const playbackId = `${channelId}-${audio}`;

    const playback = this.client.Playback();
    channelState.activePlayback = playback;
    channelState.activePlaybackId = playbackId;

    playback.once('PlaybackFinished', async () => {
      // Only process if this is still the active playback
      if (channelState.activePlaybackId !== playbackId) {
        this.logger.log(
          `PlaybackFinished for stale playback ${playbackId} on channel: ${channelId}, ignoring`,
        );
        return;
      }

      try {
        if (channelState.isActive) {
          await channel.hangup();
        }
      } catch (error) {
        this.logger.error(
          `Error hanging up channel ${channelId} after playback:`,
          error,
        );
      }
      this.logger.log(
        `PlaybackFinished for channel: ${channelId}, caller: ${channel?.caller?.number}`,
      );
      channelState.activePlayback = null;
      channelState.activePlaybackId = null;
    });

    await channel.play(
      { playbackId: playbackId, media: `sound:${audio}` },
      playback,
    );
    this.logger.log(`Playing recording for channel: ${channelId}`);
    playback.once('PlaybackStarted', () => {
      this.logger.log(
        `PlaybackStarted for channel: ${channelId}, caller: ${channel?.caller?.number}`,
      );
    });
  }

  //////////// WORK FLOW CODE ///////////
  private async playPrompt(channelId: string, media: string) {
    const channelState = this.channelStates.get(channelId);
    if (!channelState || !channelState.isActive) {
      this.logger.warn(
        `Attempted to play prompt on inactive or unknown channel: ${channelId}`,
      );
      return;
    }

    try {
      // Stop any active playback
      await this.stopActivePlayback(channelId);
      this.cancelScheduledHangup(channelId);

      // Create a new playback
      const playback = this.client.Playback();
      const playbackId = playback.id;
      channelState.activePlayback = playback;
      channelState.activePlaybackId = playbackId;

      await this.client.channels.play({
        channelId: channelId,
        playbackId: playbackId,
        media: media,
      });

      this.logger.log(`Playback started: ${media} on channel: ${channelId}`);

      // Handle playback completion
      playback.once('PlaybackFinished', () => {
        // Only process if this is still the active playback
        if (channelState.activePlaybackId !== playbackId) {
          this.logger.log(
            `PlaybackFinished for stale playback ${playbackId} on channel: ${channelId}, ignoring`,
          );
          return;
        }

        this.logger.log(`Playback finished on channel: ${channelId}`);
        channelState.activePlayback = null;
        channelState.activePlaybackId = null;
        // Schedule hangup after 10 seconds if channel is still active
        if (channelState.isActive) {
          this.scheduleHangup(channelId, 10000); // 10000 ms = 10s
        }
      });
    } catch (error) {
      this.logger.error(
        `Error playing prompt on channel ${channelId}: ${error.message}`,
      );
      channelState.activePlayback = null;
      channelState.activePlaybackId = null;
    }
  }

  // Stop any active playback on a channel
  async stopActivePlayback(channelId: string) {
    const channelState = this.channelStates.get(channelId);
    if (!channelState) {
      return;
    }

    try {
      if (channelState.activePlayback) {
        // Clear the playback ID first to prevent event handlers from firing
        const oldPlaybackId = channelState.activePlaybackId;
        channelState.activePlaybackId = null;
        
        await channelState.activePlayback.stop();
        this.logger.log(
          `Stopped active playback ${oldPlaybackId} on channel: ${channelId}`,
        );
        channelState.activePlayback = null;
      }
    } catch (error) {
      this.logger.error(
        `Error stopping playback on channel ${channelId}: ${error.message}`,
      );
      channelState.activePlayback = null;
      channelState.activePlaybackId = null;
    }
  }

  // Schedule call hangup after a delay
  async scheduleHangup(channelId: string, delay: number) {
    const channelState = this.channelStates.get(channelId);
    if (!channelState || !channelState.isActive) {
      return;
    }

    // Cancel any existing hangup timer
    this.cancelScheduledHangup(channelId);

    const timer = setTimeout(async () => {
      try {
        // Double-check channel is still active before hanging up
        const currentState = this.channelStates.get(channelId);
        if (currentState?.isActive) {
          this.logger.log(`Attempting to hang up channel: ${channelId}`);
          await this.client.channels.hangup({ channelId });
          this.logger.log(`Channel ${channelId} successfully hung up.`);
          this.cleanupChannel(channelId);
        }
      } catch (error) {
        this.logger.error(
          `Error hanging up channel ${channelId}: ${error.message}`,
        );
        // Still cleanup even if hangup fails
        this.cleanupChannel(channelId);
      }
    }, delay);

    channelState.hangupTimer = timer;
    this.logger.log(
      `Scheduled hangup for channel ${channelId} in ${delay / 1000} seconds`,
    );
  }

  // Cancel a scheduled hangup for a specific channel
  cancelScheduledHangup(channelId: string) {
    const channelState = this.channelStates.get(channelId);
    if (!channelState) {
      return;
    }

    if (channelState.hangupTimer) {
      clearTimeout(channelState.hangupTimer);
      channelState.hangupTimer = null;
      this.logger.log(`Cancelled scheduled hangup for channel: ${channelId}`);
    }
  }

  // Cleanup resources when the call ends
  cleanupChannel(channelId: string) {
    const channelState = this.channelStates.get(channelId);
    if (!channelState) {
      return;
    }

    // Mark channel as inactive first to prevent new operations
    channelState.isActive = false;

    // Stop any active playback (this will also clear activePlaybackId)
    this.stopActivePlayback(channelId);

    // Cancel any scheduled hangup
    this.cancelScheduledHangup(channelId);

    // Ensure playback ID is cleared
    channelState.activePlaybackId = null;

    // Remove channel state
    this.channelStates.delete(channelId);

    this.logger.log(`Cleaned up resources for channel: ${channelId}`);
  }

  // HANDLE DTMF SIGNALS
  async handleDTMF(channel: Channel, digit: string) {
    const channelId = channel.id;
    const channelState = this.channelStates.get(channelId);

    // Verify channel exists and is active
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

    // Verify this is an IVR call (has dial plan)
    if (!channelState.ivrDialPlan) {
      this.logger.warn(
        `DTMF received for non-IVR channel: ${channelId}, digit: ${digit}`,
      );
      return;
    }

    try {
      this.logger.log(`DTMF received: ${digit} on channel: ${channelId}`);
      await this.stopActivePlayback(channelId);
      // Cancel any scheduled hangup if new interaction occurs
      this.cancelScheduledHangup(channelId);

      // If digit is '0', replay the main IVR prompt
      if (digit === '0') {
        const mainPrompt = channelState.ivrDialPlan.main?.prompt;
        if (mainPrompt) {
          await this.playPrompt(
            channelId,
            mainPrompt.replace('.wav', ''),
          );
        }
        return;
      }

      const options = channelState.ivrDialPlan.main?.options || [];
      const option = options.find((opt) => opt.digit === parseInt(digit));

      // Play the corresponding prompt
      if (option && option.prompt) {
        await this.playPrompt(channelId, option.prompt.replace('.wav', ''));
      } else {
        await this.playPrompt(channelId, 'sound:option-is-invalid');
      }

      // TODO: Trigger the webhook if provided
      // if (option?.action === 'webhook' && option?.destination) {
      //   this.sendWebhook(option.destination, { channelId, digit });
      // }
    } catch (error) {
      this.logger.error(
        `Error handling DTMF on channel ${channelId}: ${error.message}`,
      );
    }
  }
}
