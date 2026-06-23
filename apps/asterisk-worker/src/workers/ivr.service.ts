import {
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  BatchManger as BatchManager,
  BroadcastLogQueue,
} from '@rsconnect/queue';
import { Broadcast, QueueBroadcastLog } from '@rumsan/connect/types';
import ari, { Channel, Client } from 'ari-client';
import { randomBytes } from 'crypto';
import { EventEmitter } from 'events';
import { ChannelStateManager } from './channel-state.manager';
import { PlaybackService } from './playback.service';

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 2_000;

@Injectable()
export class IVRService implements OnModuleDestroy {
  private readonly logger = new Logger(IVRService.name);
  private client: Client | null = null;
  private config;
  private isConnected = false;
  private isShuttingDown = false;
  private broadcastAddressPrefix: string | null;

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
    this.broadcastAddressPrefix = process.env.BROADCAST_ADDRESS_PREFIX || null;
    this.logger.log('IVRService initialized');
  }

  get connected(): boolean {
    return this.isConnected;
  }

  callEndpoint = (broadcastAddress: string) => {
    if (broadcastAddress.startsWith('+977')) {
      this.logger.log(`Stripping '+977' prefix from broadcast address: ${broadcastAddress}`);
      broadcastAddress = broadcastAddress.slice(4);
    }
    if (broadcastAddress.startsWith('977')) {
      this.logger.log(`Stripping '977' prefix from broadcast address: ${broadcastAddress}`);
      broadcastAddress = broadcastAddress.slice(3);
    }

    if (this.broadcastAddressPrefix) {
      this.logger.log(`Applying broadcast address prefix: ${this.broadcastAddressPrefix} to ${broadcastAddress}`);
      broadcastAddress = `${this.broadcastAddressPrefix}${broadcastAddress}`;
    }

    this.logger.log(`Constructed call endpoint for broadcast address: ${broadcastAddress}`);
    return `${this.config.trunk}/${broadcastAddress}`;
  };

  async connectForSession(): Promise<void> {
    if (this.isConnected && this.client) return;

    this.logger.log('Connecting ARI for session');
    await this.connect();
    this.setupEventHandlers();
    this.logger.log('ARI connected for session');
  }

  disconnectForSession(): void {
    if (this.client) {
      this.logger.log('Disconnecting ARI for session');
      (this.client as unknown as EventEmitter).removeAllListeners();
      try { this.client.stop(); } catch (_) { /* ignore */ }
      this.client = null;
    }
    this.isConnected = false;
    this.channelStateManager.clearClient();
    this.playbackService.clearClient();
  }

  async sendBroadcast(
    broadcast: Broadcast,
    broadcastLog: QueueBroadcastLog,
    ivrJSON?: string,
  ) {
    if (!this.isConnected || !this.client) {
      throw new Error('ARI not connected');
    }

    this.logger.log(
      `ARI connection state: isConnected=${this.isConnected}, clientId=${(this.client as any)?._id?.() ?? 'unset'}`,
    );

    const ivrDialPlan = ivrJSON ? JSON.parse(ivrJSON) : null;

    const channelId = randomBytes(12).toString('hex');

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
    if (!this.client) {
      throw new Error('ARI client not available');
    }
    try {
      return await this.client.channels.originate({
        channelId,
        endpoint: callEndpoint,
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

      try {
        await this.client.applications.get({ applicationName: appName });
      } catch (err) {
        throw new Error(
          `Stasis app '${appName}' did not register with Asterisk: ${(err as Error).message}`,
        );
      }

      this.isConnected = true;
      const client = this.client;

      client.once('WebSocketReconnecting', (err: Error) => {
        if (this.isShuttingDown) return;
        this.isConnected = false;
        this.logger.warn(
          `ARI WebSocket dropped (${err?.message ?? 'unknown'}) — attempting mid-session reconnect`,
        );
        this.midSessionReconnect(1);
      });

      client.on('WebSocketConnected', () => {
        this.logger.log('ARI WebSocket connected');
      });

      this.channelStateManager.setClient(client);
      this.playbackService.setClient(client);

      this.logger.log('ARI connected');
    } catch (error) {
      this.logger.error('Error connecting to ARI', error);
      throw error;
    }
  }

  private async midSessionReconnect(attempt: number) {
    if (this.isShuttingDown) return;
    if (attempt > MAX_RECONNECT_ATTEMPTS) {
      this.logger.error(
        `ARI mid-session reconnect failed after ${MAX_RECONNECT_ATTEMPTS} attempts`,
      );
      return;
    }

    await new Promise((r) => setTimeout(r, RECONNECT_DELAY_MS));

    this.logger.log(`ARI mid-session reconnect attempt ${attempt}`);
    try {
      if (this.client) {
        (this.client as unknown as EventEmitter).removeAllListeners();
        try { this.client.stop(); } catch (_) { /* ignore */ }
      }
      await this.connect();
      this.setupEventHandlers();
      this.logger.log(`ARI mid-session reconnect succeeded on attempt ${attempt}`);
    } catch (error) {
      this.logger.error(`ARI mid-session reconnect attempt ${attempt} failed:`, error);
      this.midSessionReconnect(attempt + 1);
    }
  }

  private setupEventHandlers() {
    if (!this.client) return;
    const client = this.client;

    client.on('StasisStart', async (event, incomingChannel) => {
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
          await this.playbackService.playPrompt(
            channelId,
            mainPrompt,
            incomingChannel,
          );
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

    client.on('ChannelDtmfReceived', async (event, channel) => {
      try {
        const channelState = this.channelStateManager.getState(channel.id);
        if (!channelState?.ivrDialPlan) {
          return;
        }
        this.channelStateManager.recordDtmf(channel.id, event.digit);
        await this.handleDTMF(channel, event.digit);
      } catch (error) {
        this.logger.error('Error in ChannelDtmfReceived handler:', error);
      }
    });

    client.on('StasisEnd', async (event) => {
      try {
        const channelId = event.channel.id;
        this.logger.log(`StasisEnd received for channel: ${channelId}`);
        await this.channelStateManager.cleanupChannel(channelId);
      } catch (error) {
        this.logger.error('Error in StasisEnd handler:', error);
      }
    });

    client.on('ChannelStateChange', async (event) => {
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
    this.isShuttingDown = true;
    this.disconnectForSession();
  }

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

      if (digit === '0') {
        const mainPrompt = channelState.ivrDialPlan.main?.prompt;
        if (mainPrompt) {
          await this.playbackService.playPrompt(
            channelId,
            mainPrompt.replace('.wav', ''),
            channel,
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
          channel,
          option.hangup === true,
        );
      } else {
        await this.playbackService.playPrompt(
          channelId,
          'sound:option-is-invalid',
          channel,
        );
      }
    } catch (err) {
      this.logger.error(
        `Error handling DTMF on channel ${channelId}: ${(err as Error).message}`,
      );
    }
  }
}
