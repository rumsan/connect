import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { VoiceResponse } from '@rumsan/connect/types';
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
    PlaybackStatus & {
      dtmfSequence: string[];
      ivrSelections: string[];
      voiceResponses: VoiceResponse[];
      isIvr: boolean;
      snapshotAt: number;
    }
  >();
  private readonly snapshotRetentionMs = 60_000;
  // Serializes DTMF handling per channel. Two keypresses arriving back to back
  // would otherwise both read the same menuPath and descend from it twice.
  private dtmfChains = new Map<string, Promise<void>>();
  private drainCallback: (() => void) | null = null;
  // Registered by RecordingService so a channel teardown can finalize any
  // recording still in flight. A callback rather than an injection, to keep
  // this service free of a dependency on the thing that depends on it.
  private recordingCleanupCallback:
    | ((channelId: string, voiceResponses: VoiceResponse[]) => void)
    | null = null;
  private reaperTimer: NodeJS.Timeout | null = null;
  private readonly channelTtlMs =
    +(process.env['CHANNEL_TTL_MS'] as string) || 180_000;
  private readonly reaperIntervalMs =
    +(process.env['REAPER_INTERVAL_MS'] as string) || 60_000;

  setClient(client: Client) {
    this.client = client;
  }

  clearClient() {
    this.client = null;
  }

  get activeChannelCount(): number {
    return this.channelStates.size;
  }

  onAllChannelsDrained(callback: () => void) {
    this.drainCallback = callback;
  }

  clearDrainCallback() {
    this.drainCallback = null;
  }

  onRecordingCleanup(
    callback: (channelId: string, voiceResponses: VoiceResponse[]) => void,
  ) {
    this.recordingCleanupCallback = callback;
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
      menuPath: [],
      ivrSelections: [],
      voiceResponses: [],
      activeRecordingName: null,
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

  /** Menu the caller is currently on. `[]` = main. */
  getMenuPath(channelId: string): number[] {
    const s = this.channelStates.get(channelId);
    return s ? [...s.menuPath] : [];
  }

  setMenuPath(channelId: string, path: number[]) {
    const s = this.channelStates.get(channelId);
    if (!s) return;
    s.menuPath = [...path];
    s.lastActivityAt = Date.now();
  }

  /** Records the dotted label of a node the caller selected, e.g. '1.2'. */
  recordSelection(channelId: string, label: string) {
    const s = this.channelStates.get(channelId);
    if (!s) return;
    s.ivrSelections.push(label);
    s.lastActivityAt = Date.now();
  }

  getIvrSelections(channelId: string): string[] {
    const s = this.channelStates.get(channelId);
    if (s) return [...s.ivrSelections];
    const snap = this.playbackSnapshots.get(channelId);
    if (snap) return [...snap.ivrSelections];
    return [];
  }

  /**
   * Registers a recording that has just started. Bumps `lastActivityAt` so the
   * reaper doesn't expire a channel whose caller is silently mid-message.
   */
  startRecording(channelId: string, entry: VoiceResponse) {
    const s = this.channelStates.get(channelId);
    // The entry is stored by reference and RecordingService keeps the same
    // object, so later status/url patches are visible here without a setter.
    if (!s) {
      this.logger.warn(
        `startRecording: channel ${channelId} not found, recording ${entry.recordingName} untracked`,
      );
      return;
    }
    s.voiceResponses.push(entry);
    s.activeRecordingName = entry.recordingName;
    s.lastActivityAt = Date.now();
    this.logger.log(
      `Recording '${entry.recordingName}' started on channel ${channelId} (IVR path ${entry.path || 'main'})`,
    );
  }

  /** Clears the in-flight marker, so DTMF is treated as navigation again. */
  endRecording(channelId: string, recordingName?: string) {
    const s = this.channelStates.get(channelId);
    if (!s) return;
    if (recordingName && s.activeRecordingName !== recordingName) return;
    s.activeRecordingName = null;
    s.lastActivityAt = Date.now();
  }

  isRecording(channelId: string): boolean {
    return !!this.channelStates.get(channelId)?.activeRecordingName;
  }

  getVoiceResponses(channelId: string): VoiceResponse[] {
    const s = this.channelStates.get(channelId);
    if (s) return s.voiceResponses.map((v) => ({ ...v }));
    const snap = this.playbackSnapshots.get(channelId);
    if (snap) return snap.voiceResponses.map((v) => ({ ...v }));
    return [];
  }

  /**
   * Runs `fn` after any DTMF handling already in flight for this channel, so
   * navigation state is read and written in keypress order.
   */
  enqueueDtmf(channelId: string, fn: () => Promise<void>): Promise<void> {
    const previous = this.dtmfChains.get(channelId) ?? Promise.resolve();
    const next = previous.then(fn).catch((err) => {
      this.logger.error(
        `DTMF handling failed for channel ${channelId}: ${(err as Error).message}`,
      );
    });
    this.dtmfChains.set(channelId, next);
    return next;
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

    // The input timeout is measured in seconds and a message can run for a
    // minute. Arming it mid-recording would cut the caller off.
    if (channelState.activeRecordingName) {
      this.logger.debug(
        `Not scheduling hangup for channel ${channelId} — recording '${channelState.activeRecordingName}' in progress`,
      );
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
    // The snapshot holds the live entry objects (not copies) so a recording
    // that finishes uploading after cleanup still patches something the AMI
    // Hangup handler can read.
    this.playbackSnapshots.set(channelId, {
      playbackStarted: channelState.playbackStarted,
      playbackFailed: channelState.playbackFailed,
      playbackError: channelState.playbackError,
      dtmfSequence: [...channelState.dtmfSequence],
      ivrSelections: [...channelState.ivrSelections],
      voiceResponses: channelState.voiceResponses,
      isIvr: !!channelState.ivrDialPlan,
      snapshotAt: Date.now(),
    });

    this.dtmfChains.delete(channelId);

    // Hand any still-running recording to RecordingService before the state
    // goes away. A hangup mid-message is the common path, and the ARI
    // RecordingFinished event for it may never reach us.
    if (channelState.voiceResponses.length && this.recordingCleanupCallback) {
      try {
        this.recordingCleanupCallback(channelId, channelState.voiceResponses);
      } catch (err) {
        this.logger.error(
          `Recording cleanup callback failed for channel ${channelId}: ${(err as Error).message}`,
        );
      }
    }
    channelState.activeRecordingName = null;

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

    if (this.channelStates.size === 0 && this.drainCallback) {
      const cb = this.drainCallback;
      this.drainCallback = null;
      cb();
    }
  }
}
