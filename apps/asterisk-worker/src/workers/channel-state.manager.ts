import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Client } from 'ari-client';
import {
  ChannelState,
  IVRDialPlan,
  PlaybackStatus,
} from './types/ivr.types';

@Injectable()
export class ChannelStateManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChannelStateManager.name);
  private client: Client;
  private channelStates = new Map<string, ChannelState>();
  // Short-lived snapshot of playback status + DTMF sequence, retained briefly
  // AFTER cleanup so the AMI Hangup handler (which fires AFTER StasisEnd) can
  // still read them.
  private playbackSnapshots = new Map<
    string,
    PlaybackStatus & { dtmfSequence: string[]; isIvr: boolean; snapshotAt: number }
  >();
  private readonly snapshotRetentionMs = 60_000;
  private reaperTimer: NodeJS.Timeout | null = null;
  private readonly channelTtlMs =
    +(process.env['CHANNEL_TTL_MS'] as string) || 180_000;
  private readonly reaperIntervalMs =
    +(process.env['REAPER_INTERVAL_MS'] as string) || 60_000;

  setClient(client: Client) {
    this.client = client;
  }

  onModuleInit() {
    this.reaperTimer = setInterval(
      () => this.reap(),
      this.reaperIntervalMs,
    );
    this.reaperTimer.unref?.();
    this.logger.log(
      `Channel reaper started (ttl=${this.channelTtlMs}ms, interval=${this.reaperIntervalMs}ms)`,
    );
  }

  onModuleDestroy() {
    if (this.reaperTimer) {
      clearInterval(this.reaperTimer);
      this.reaperTimer = null;
    }
  }

  registerChannel(params: {
    channelId: string;
    ivrDialPlan: IVRDialPlan | null;
    sessionId: string;
    broadcastLogId: string;
    address: string;
  }): ChannelState {
    const now = Date.now();
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
      playbackStarted: false,
      playbackFailed: false,
      playbackError: undefined,
      dtmfSequence: [],
      createdAt: now,
      lastActivityAt: now,
    };

    this.channelStates.set(params.channelId, channelState);
    this.logger.log(
      `Channel registered: ${params.channelId}, Address: ${params.address}`,
    );
    return channelState;
  }

  markPlaybackStarted(channelId: string) {
    const s = this.channelStates.get(channelId);
    if (!s) return;
    s.playbackStarted = true;
    s.lastActivityAt = Date.now();
  }

  markPlaybackFailed(channelId: string, error: string) {
    const s = this.channelStates.get(channelId);
    if (!s) return;
    s.playbackFailed = true;
    s.playbackError = error;
    s.lastActivityAt = Date.now();
  }

  getPlaybackStatus(channelId: string): PlaybackStatus | undefined {
    const s = this.channelStates.get(channelId);
    if (s) {
      return {
        playbackStarted: s.playbackStarted,
        playbackFailed: s.playbackFailed,
        playbackError: s.playbackError,
      };
    }
    // Channel already cleaned up (StasisEnd ran before AMI Hangup). Fall back
    // to the post-cleanup snapshot so the AMI handler can still tag the call.
    const snap = this.playbackSnapshots.get(channelId);
    if (snap) {
      return {
        playbackStarted: snap.playbackStarted,
        playbackFailed: snap.playbackFailed,
        playbackError: snap.playbackError,
      };
    }
    return undefined;
  }

  recordDtmf(channelId: string, digit: string) {
    const s = this.channelStates.get(channelId);
    if (!s) {
      this.logger.warn(
        `recordDtmf: channel ${channelId} not found, digit '${digit}' dropped`,
      );
      return;
    }
    s.dtmfSequence.push(digit);
    s.lastActivityAt = Date.now();
    this.logger.log(
      `DTMF '${digit}' recorded for channel ${channelId} (sequence: [${s.dtmfSequence.join(',')}])`,
    );
  }

  isIvrChannel(channelId: string): boolean {
    const s = this.channelStates.get(channelId);
    if (s) return !!s.ivrDialPlan;
    const snap = this.playbackSnapshots.get(channelId);
    if (snap) return snap.isIvr;
    return false;
  }

  getDtmfSequence(channelId: string): string[] {
    const s = this.channelStates.get(channelId);
    if (s) return [...s.dtmfSequence];
    const snap = this.playbackSnapshots.get(channelId);
    if (snap) return [...snap.dtmfSequence];
    return [];
  }

  consumePlaybackSnapshot(channelId: string) {
    this.playbackSnapshots.delete(channelId);
  }

  private async reap() {
    const now = Date.now();
    const expired: string[] = [];
    for (const [id, state] of this.channelStates.entries()) {
      if (now - state.lastActivityAt > this.channelTtlMs) expired.push(id);
    }
    for (const id of expired) {
      const state = this.channelStates.get(id);
      if (!state) continue;
      this.logger.warn(
        `Reaper expiring stuck channel ${id} (age=${now - state.createdAt}ms, started=${state.playbackStarted}, failed=${state.playbackFailed})`,
      );
      if (this.client) {
        try {
          await this.client.channels.hangup({ channelId: id });
        } catch (_) {
          // already gone
        }
      }
      await this.cleanupChannel(id);
    }
    // Evict old playback snapshots that were never consumed (orphan AMI never arrived)
    for (const [id, snap] of this.playbackSnapshots.entries()) {
      if (now - snap.snapshotAt > this.snapshotRetentionMs) {
        this.playbackSnapshots.delete(id);
      }
    }
  }

  getState(channelId: string): ChannelState | undefined {
    return this.channelStates.get(channelId);
  }

  hasChannel(channelId: string): boolean {
    return this.channelStates.has(channelId);
  }

  getChannelsPendingPlayback(): ChannelState[] {
    const pending: ChannelState[] = [];
    for (const state of this.channelStates.values()) {
      if (state.isActive && !state.playbackStarted && !state.playbackFailed) {
        pending.push(state);
      }
    }
    return pending;
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

    // Snapshot playback status + DTMF sequence BEFORE deletion so AMI Hangup
    // (which arrives AFTER StasisEnd) can still tag the call correctly.
    this.playbackSnapshots.set(channelId, {
      playbackStarted: channelState.playbackStarted,
      playbackFailed: channelState.playbackFailed,
      playbackError: channelState.playbackError,
      dtmfSequence: [...channelState.dtmfSequence],
      isIvr: !!channelState.ivrDialPlan,
      snapshotAt: Date.now(),
    });

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
