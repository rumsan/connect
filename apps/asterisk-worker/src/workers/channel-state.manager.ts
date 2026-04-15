import { Injectable, Logger } from '@nestjs/common';
import { Client } from 'ari-client';
import { ChannelState, IVRDialPlan } from './types/ivr.types';

@Injectable()
export class ChannelStateManager {
  private readonly logger = new Logger(ChannelStateManager.name);
  private client: Client;
  private channelStates = new Map<string, ChannelState>();

  setClient(client: Client) {
    this.client = client;
  }

  registerChannel(params: {
    channelId: string;
    ivrDialPlan: IVRDialPlan | null;
    sessionId: string;
    broadcastLogId: string;
    address: string;
  }): ChannelState {
    const channelState: ChannelState = {
      channelId: params.channelId,
      ivrDialPlan: params.ivrDialPlan,
      sessionId: params.sessionId,
      broadcastLogId: params.broadcastLogId,
      address: params.address,
      activePlayback: null,
      activePlaybackId: null,
      hangupTimer: null,
      isActive: true,
    };

    this.channelStates.set(params.channelId, channelState);
    this.logger.log(
      `Channel registered: ${params.channelId}, Address: ${params.address}`,
    );
    return channelState;
  }

  getState(channelId: string): ChannelState | undefined {
    return this.channelStates.get(channelId);
  }

  hasChannel(channelId: string): boolean {
    return this.channelStates.has(channelId);
  }

  removeChannel(channelId: string) {
    this.channelStates.delete(channelId);
  }

  async stopActivePlayback(channelId: string) {
    const channelState = this.channelStates.get(channelId);
    if (!channelState?.activePlayback) {
      return;
    }

    const oldPlaybackId = channelState.activePlaybackId;
    channelState.activePlaybackId = null;

    try {
      await channelState.activePlayback.stop();
      this.logger.log(
        `Stopped active playback ${oldPlaybackId} on channel: ${channelId}`,
      );
    } catch (err) {
      // Playback may already be finished or channel gone — not an error
      this.logger.debug(
        `Could not stop playback ${oldPlaybackId} on channel ${channelId}: ${(err as Error).message}`,
      );
    } finally {
      channelState.activePlayback = null;
    }
  }

  scheduleHangup(channelId: string, delay: number) {
    const channelState = this.channelStates.get(channelId);
    if (!channelState?.isActive) {
      return;
    }

    this.cancelScheduledHangup(channelId);

    const timer = setTimeout(async () => {
      const currentState = this.channelStates.get(channelId);
      if (!currentState?.isActive) {
        return;
      }

      try {
        this.logger.log(`Scheduled hangup firing for channel: ${channelId}`);
        await this.client.channels.hangup({ channelId });
        this.logger.log(`Channel ${channelId} successfully hung up.`);
      } catch (err) {
        this.logger.debug(
          `Hangup failed for channel ${channelId} (likely already gone): ${(err as Error).message}`,
        );
      }
      // Cleanup will be triggered by StasisEnd event
    }, delay);

    channelState.hangupTimer = timer;
    this.logger.log(
      `Scheduled hangup for channel ${channelId} in ${delay / 1000}s`,
    );
  }

  cancelScheduledHangup(channelId: string) {
    const channelState = this.channelStates.get(channelId);
    if (!channelState?.hangupTimer) {
      return;
    }

    clearTimeout(channelState.hangupTimer);
    channelState.hangupTimer = null;
    this.logger.log(`Cancelled scheduled hangup for channel: ${channelId}`);
  }

  async cleanupChannel(channelId: string) {
    const channelState = this.channelStates.get(channelId);
    if (!channelState) {
      return; // Already cleaned up — idempotent guard
    }

    // Mark inactive first to prevent new operations
    channelState.isActive = false;

    // Remove from map immediately to prevent re-entrant cleanup
    this.channelStates.delete(channelId);

    await this.stopActivePlayback(channelId);

    // stopActivePlayback won't find it in the map anymore since we already deleted,
    // so stop it directly from the state we captured
    if (channelState.activePlayback) {
      try {
        channelState.activePlaybackId = null;
        await channelState.activePlayback.stop();
      } catch {
        // already gone
      }
      channelState.activePlayback = null;
    }

    if (channelState.hangupTimer) {
      clearTimeout(channelState.hangupTimer);
      channelState.hangupTimer = null;
    }

    this.logger.log(`Cleaned up resources for channel: ${channelId}`);
  }
}
