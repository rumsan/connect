import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { BroadcastLogQueue } from '@rsconnect/queue';
import { workerLabel } from '@rsconnect/queue';
import {
  TERMINAL_VOICE_RESPONSE_STATUSES,
  VoiceResponse,
} from '@rumsan/connect/types';
import axios from 'axios';
import { Channel, Client } from 'ari-client';
import { ChannelStateManager } from './channel-state.manager';
import { StorageService } from './storage.service';
import { RecordDefaults, ResolvedRecordSpec } from './types/ivr.types';

const recordConfig = {
  format: process.env.IVR_RECORD_FORMAT || 'wav',
  maxDurationSeconds:
    +(process.env.IVR_RECORD_MAX_DURATION_SECONDS as string) || 60,
  maxSilenceSeconds:
    +(process.env.IVR_RECORD_MAX_SILENCE_SECONDS as string) || 4,
  terminateOn: process.env.IVR_RECORD_TERMINATE_ON || '#',
  beep: process.env.IVR_RECORD_BEEP !== 'false',
  // Applies only after a confirmed PutObject. A failed upload always retains.
  deleteAfterUpload: process.env.IVR_RECORD_DELETE_AFTER_UPLOAD !== 'false',
  uploadTtlMs: +(process.env.IVR_RECORD_UPLOAD_TTL_MS as string) || 120_000,
  maxConcurrentUploads:
    +(process.env.IVR_RECORD_MAX_CONCURRENT_UPLOADS as string) || 4,
  // Only used to render the operator-facing `asteriskFile` path.
  recordingPath:
    process.env.ASTERISK_RECORDING_PATH || '/var/spool/asterisk/recording',
  // Kept below CHANNEL_TTL_MS so the reaper can't cut a message short.
  maxDurationCeilingSeconds:
    +(process.env.IVR_RECORD_MAX_DURATION_CEILING_SECONDS as string) || 120,
};

const CONTENT_TYPES: Record<string, string> = {
  wav: 'audio/wav',
  gsm: 'audio/gsm',
  ulaw: 'audio/basic',
  alaw: 'audio/x-alaw-basic',
  ogg: 'audio/ogg',
};

/** Bounded backoff while waiting for Asterisk to store a recording (~12s). */
const ORPHAN_POLL_DELAYS_MS = [300, 600, 1200, 2400, 4000, 4000];
const UPLOAD_RETRY_DELAYS_MS = [1_000, 4_000, 10_000];
const ERROR_MAX_LENGTH = 200;

interface PendingCall {
  broadcastLogId: string;
  entries: VoiceResponse[];
  attachedAt: number;
  emitted: boolean;
}

/**
 * Records caller voice responses via ARI, publishes them to object storage and
 * emits the follow-up report once every recording on a call has settled.
 *
 * The one invariant: **nothing here may delay or suppress a disposition
 * report**. Every public method swallows its own failures, the Asterisk-side
 * location of a recording is populated before any I/O is attempted, and the
 * follow-up is emitted on failure just as it is on success.
 */
@Injectable()
export class RecordingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecordingService.name);
  private client: Client | null = null;
  private readonly ariHttpBase: string;
  private readonly ariAuth: { username: string; password: string };
  /** Entry objects by recording name — shared by reference with ChannelState. */
  private entries = new Map<string, VoiceResponse>();
  private channelOfRecording = new Map<string, string>();
  /** Guards against a late RecordingFinished and the orphan poller colliding. */
  private inFlight = new Set<string>();
  private pendingCalls = new Map<string, PendingCall>();
  private activeUploads = 0;
  private uploadQueue: (() => void)[] = [];
  private sweepTimer: NodeJS.Timeout | null = null;
  private sequence = 0;

  constructor(
    private readonly channelStateManager: ChannelStateManager,
    private readonly storageService: StorageService,
    private readonly broadcastLogQueue: BroadcastLogQueue,
  ) {
    // ASTERISK_ARI is a bare host ("http://10.0.0.11:8088") — ari-client keeps
    // only protocol + host and appends /ari itself, so we must do the same.
    const url = new URL(process.env.ASTERISK_ARI || 'http://localhost:8088');
    this.ariHttpBase = `${url.protocol}//${url.host}/ari`;
    this.ariAuth = {
      username: process.env.ASTERISK_ARI_USER,
      password: process.env.ASTERISK_ARI_PASS,
    };
  }

  get defaults(): RecordDefaults {
    return {
      maxDurationSeconds: recordConfig.maxDurationSeconds,
      maxSilenceSeconds: recordConfig.maxSilenceSeconds,
      beep: recordConfig.beep,
      terminateOn: recordConfig.terminateOn,
      maxDurationCeilingSeconds: recordConfig.maxDurationCeilingSeconds,
    };
  }

  onModuleInit() {
    this.channelStateManager.onRecordingCleanup((channelId, responses) =>
      this.onChannelCleanup(channelId, responses),
    );
    // Backstop: force-fail and emit for any call whose uploads never settle.
    this.sweepTimer = setInterval(() => this.sweep(), 15_000);
    this.sweepTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  setClient(client: Client) {
    this.client = client;
  }

  clearClient() {
    this.client = null;
  }

  /**
   * Starts recording the caller. Returns once Asterisk has begun; completion is
   * driven by the ARI events or, if those never arrive, by channel cleanup.
   *
   * Never throws — a failure here must not break DTMF handling.
   */
  async start(
    channel: Channel,
    channelId: string,
    spec: ResolvedRecordSpec,
    path: string,
    digit: string,
    afterRecording: (outcome: 'finished' | 'failed') => Promise<void>,
  ): Promise<VoiceResponse> {
    const format = recordConfig.format;
    const name = this.buildRecordingName(channelId, path);

    // Populated before any I/O, so the report can always locate the audio.
    const entry: VoiceResponse = {
      path,
      digit,
      dtmfBefore: this.channelStateManager.getDtmfSequence(channelId),
      recordingName: name,
      status: 'recording',
      startedAt: new Date().toISOString(),
      workerId: workerLabel(),
      ariRecordingUrl: `${this.ariHttpBase}/recordings/stored/${encodeURIComponent(name)}/file`,
      asteriskFile: `${recordConfig.recordingPath}/${name}.${format}`,
      retainedOnBox: true,
      format,
    };

    this.entries.set(name, entry);
    this.channelOfRecording.set(name, channelId);
    this.channelStateManager.startRecording(channelId, entry);

    if (!this.client) {
      return this.markFailed(entry, 'ARI client not available');
    }

    try {
      const live = this.client.LiveRecording(null, { name });

      live.once('RecordingStarted', () => {
        this.logger.log(`RecordingStarted: ${name} on channel ${channelId}`);
      });

      live.once('RecordingFinished', (_event, recording) => {
        this.logger.log(
          `RecordingFinished: ${name} (${recording?.duration ?? '?'}s)`,
        );
        live.removeAllListeners('RecordingFailed');
        entry.durationSeconds = recording?.duration;
        this.channelStateManager.endRecording(channelId, name);
        void this.settle(entry, 'recorded');
        void this.runAfterRecording(afterRecording, 'finished', name);
      });

      live.once('RecordingFailed', (_event, recording) => {
        const cause = (recording as { cause?: string })?.cause ?? 'unknown';
        this.logger.error(`RecordingFailed: ${name} — ${cause}`);
        live.removeAllListeners('RecordingFinished');
        this.channelStateManager.endRecording(channelId, name);
        this.markFailed(entry, `RECORDING_FAILED: ${cause}`);
        this.maybeEmitReport(channelId);
        void this.runAfterRecording(afterRecording, 'failed', name);
      });

      // The channel id is injected by ari-client from the instance.
      await channel.record(
        {
          name,
          format,
          maxDurationSeconds: spec.maxDurationSeconds,
          maxSilenceSeconds: spec.maxSilenceSeconds,
          beep: spec.beep,
          ifExists: 'overwrite',
          terminateOn: spec.terminateOn,
        },
        live,
      );

      this.logger.log(
        `Recording '${name}' on channel ${channelId}: max=${spec.maxDurationSeconds}s, ` +
          `silence=${spec.maxSilenceSeconds}s, terminateOn='${spec.terminateOn}'`,
      );
      return entry;
    } catch (err) {
      this.channelStateManager.endRecording(channelId, name);
      this.logger.error(
        `Failed to start recording '${name}' on channel ${channelId}: ${(err as Error).message}`,
      );
      return this.markFailed(entry, (err as Error).message);
    }
  }

  /**
   * Channel teardown. Any recording still marked in-flight is finalized by
   * polling Asterisk, because a hangup mid-message often produces no usable
   * RecordingFinished event on our socket.
   */
  onChannelCleanup(channelId: string, voiceResponses: VoiceResponse[]) {
    for (const entry of voiceResponses) {
      if (entry.status !== 'recording') continue;
      entry.status = 'finalizing';
      this.logger.log(
        `Channel ${channelId} torn down while recording '${entry.recordingName}' — finalizing from the box`,
      );
      void this.settle(entry, 'finalizing');
    }
  }

  /**
   * Called by the AMI Hangup handler AFTER the disposition report is published.
   * Arms the follow-up that carries the final URLs.
   */
  attachReport(
    channelId: string,
    params: { broadcastLogId: string; voiceResponses: VoiceResponse[] },
  ) {
    try {
      const entries = params.voiceResponses
        .map((v) => this.entries.get(v.recordingName))
        .filter((v): v is VoiceResponse => !!v);

      if (!entries.length) return;

      this.pendingCalls.set(channelId, {
        broadcastLogId: params.broadcastLogId,
        entries,
        attachedAt: Date.now(),
        emitted: false,
      });
      // The uploads may already have finished while the report was in flight.
      this.maybeEmitReport(channelId);
    } catch (err) {
      this.logger.error(
        `attachReport failed for channel ${channelId}: ${(err as Error).message}`,
      );
    }
  }

  /** `<channelId>-<path with dots flattened>-<n>` — flat and URL-safe. */
  private buildRecordingName(channelId: string, path: string): string {
    const suffix = (path || 'main').replace(/[^a-zA-Z0-9]/g, '_');
    this.sequence += 1;
    return `vr-${channelId}-${suffix}-${this.sequence}`;
  }

  private async runAfterRecording(
    afterRecording: (outcome: 'finished' | 'failed') => Promise<void>,
    outcome: 'finished' | 'failed',
    name: string,
  ) {
    try {
      await afterRecording(outcome);
    } catch (err) {
      this.logger.error(
        `Post-recording handling failed for '${name}': ${(err as Error).message}`,
      );
    }
  }

  /**
   * Fetch the file off Asterisk and publish it. Idempotent per recording name,
   * so a late RecordingFinished and the orphan poller can both call it.
   */
  private async settle(entry: VoiceResponse, from: 'recorded' | 'finalizing') {
    const name = entry.recordingName;
    if (this.inFlight.has(name)) return;
    if (TERMINAL_VOICE_RESPONSE_STATUSES.includes(entry.status)) return;
    this.inFlight.add(name);

    const channelId = this.channelOfRecording.get(name);

    try {
      if (from === 'finalizing') {
        const stored = await this.waitForStoredRecording(name);
        if (!stored) {
          this.markFailed(entry, 'RECORDING_NOT_STORED');
          return;
        }
      }
      entry.status = 'recorded';

      if (!this.storageService.configured) {
        this.markFailed(entry, 'STORAGE_NOT_CONFIGURED');
        return;
      }

      await this.withUploadSlot(() => this.fetchAndUpload(entry));
    } catch (err) {
      this.markFailed(entry, (err as Error).message);
    } finally {
      this.inFlight.delete(name);
      if (channelId) this.maybeEmitReport(channelId);
    }
  }

  private async fetchAndUpload(entry: VoiceResponse) {
    const name = entry.recordingName;
    const channelId = this.channelOfRecording.get(name);
    const state = channelId
      ? this.channelStateManager.getState(channelId)
      : undefined;
    const pending = channelId ? this.pendingCalls.get(channelId) : undefined;
    const sessionId = state?.sessionId ?? 'unknown-session';
    const broadcastLogId =
      pending?.broadcastLogId ?? state?.broadcastLogId ?? 'unknown-log';

    entry.status = 'uploading';

    const key = this.storageService.buildKey({
      workerId: entry.workerId,
      sessionId,
      broadcastLogId,
      recordingName: name,
      format: entry.format ?? recordConfig.format,
    });
    const contentType =
      CONTENT_TYPES[entry.format ?? recordConfig.format] ??
      'application/octet-stream';

    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= UPLOAD_RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) {
        await this.wait(UPLOAD_RETRY_DELAYS_MS[attempt - 1]);
        this.logger.warn(
          `Retrying upload of '${name}' (attempt ${attempt + 1}): ${lastError?.message}`,
        );
      }
      try {
        const audio = await this.downloadFromAsterisk(name);
        const result = await this.storageService.putPublicObject(
          key,
          audio,
          contentType,
        );

        entry.status = 'uploaded';
        entry.url = result.url;
        entry.objectKey = result.key;
        entry.sizeBytes = result.sizeBytes;
        entry.error = undefined;
        this.logger.log(
          `Voice response '${name}' uploaded (${result.sizeBytes} bytes) -> ${result.url}`,
        );

        if (recordConfig.deleteAfterUpload) {
          await this.deleteFromAsterisk(name, entry);
        }
        return;
      } catch (err) {
        lastError = err as Error;
      }
    }

    // Every attempt failed. The file stays on the box; ariRecordingUrl and
    // asteriskFile on the entry are how an operator recovers it.
    this.markFailed(entry, `UPLOAD_FAILED: ${lastError?.message ?? 'unknown'}`);
  }

  private async downloadFromAsterisk(name: string): Promise<Buffer> {
    const response = await axios.get(
      `${this.ariHttpBase}/recordings/stored/${encodeURIComponent(name)}/file`,
      { auth: this.ariAuth, responseType: 'arraybuffer', timeout: 30_000 },
    );
    return Buffer.from(response.data);
  }

  private async deleteFromAsterisk(name: string, entry: VoiceResponse) {
    try {
      await axios.delete(
        `${this.ariHttpBase}/recordings/stored/${encodeURIComponent(name)}`,
        { auth: this.ariAuth, timeout: 15_000 },
      );
      entry.retainedOnBox = false;
    } catch (err) {
      // Not a failure of the response itself — the audio is safely in storage.
      this.logger.warn(
        `Could not delete recording '${name}' from Asterisk: ${(err as Error).message}`,
      );
    }
  }

  /** Polls until Asterisk has moved the recording into stored recordings. */
  private async waitForStoredRecording(name: string): Promise<boolean> {
    for (const delay of ORPHAN_POLL_DELAYS_MS) {
      await this.wait(delay);
      try {
        await axios.get(
          `${this.ariHttpBase}/recordings/stored/${encodeURIComponent(name)}`,
          { auth: this.ariAuth, timeout: 10_000 },
        );
        return true;
      } catch {
        // Not stored yet (or never will be) — keep polling until we run out.
      }
    }
    this.logger.warn(
      `Recording '${name}' never appeared in stored recordings after hangup`,
    );
    return false;
  }

  private markFailed(entry: VoiceResponse, error: string): VoiceResponse {
    entry.status = 'failed';
    entry.retainedOnBox = true;
    entry.error = error.slice(0, ERROR_MAX_LENGTH);
    this.logger.error(
      `Voice response '${entry.recordingName}' failed: ${entry.error}`,
    );
    return entry;
  }

  /**
   * Emits the follow-up once every recording on the call is terminal. Sends the
   * COMPLETE array — connect's merge is shallow, so a delta would drop entries
   * — and omits `status` so the hangup-computed one survives.
   */
  private maybeEmitReport(channelId: string) {
    const pending = this.pendingCalls.get(channelId);
    if (!pending || pending.emitted) return;
    const settled = pending.entries.every((e) =>
      TERMINAL_VOICE_RESPONSE_STATUSES.includes(e.status),
    );
    if (!settled) return;

    pending.emitted = true;
    void this.emitReport(channelId, pending);
  }

  private async emitReport(channelId: string, pending: PendingCall) {
    const voiceResponses = pending.entries.map((e) => ({ ...e }));
    try {
      await this.broadcastLogQueue.updateDetailsVoice({
        broadcastLogId: pending.broadcastLogId,
        details: { voiceResponses } as never,
      });
      this.logger.log(
        `Voice response report sent for ${pending.broadcastLogId}: ` +
          voiceResponses.map((v) => `${v.recordingName}=${v.status}`).join(', '),
      );
    } catch (err) {
      this.logger.error(
        `Failed to send voice response report for ${pending.broadcastLogId}: ${(err as Error).message}`,
      );
    } finally {
      this.forget(channelId, pending);
    }
  }

  private forget(channelId: string, pending: PendingCall) {
    this.pendingCalls.delete(channelId);
    for (const entry of pending.entries) {
      this.entries.delete(entry.recordingName);
      this.channelOfRecording.delete(entry.recordingName);
    }
  }

  /** Force-fails and emits for any call whose uploads have stalled past the TTL. */
  private sweep() {
    const now = Date.now();
    for (const [channelId, pending] of this.pendingCalls.entries()) {
      if (pending.emitted) continue;
      if (now - pending.attachedAt <= recordConfig.uploadTtlMs) continue;

      for (const entry of pending.entries) {
        if (TERMINAL_VOICE_RESPONSE_STATUSES.includes(entry.status)) continue;
        this.markFailed(entry, `UPLOAD_TIMEOUT after ${recordConfig.uploadTtlMs}ms`);
      }
      pending.emitted = true;
      void this.emitReport(channelId, pending);
    }
  }

  /** Caps concurrent ARI downloads so one batch can't overwhelm a box. */
  private async withUploadSlot<T>(fn: () => Promise<T>): Promise<T> {
    if (this.activeUploads >= recordConfig.maxConcurrentUploads) {
      await new Promise<void>((resolve) => this.uploadQueue.push(resolve));
    }
    this.activeUploads += 1;
    try {
      return await fn();
    } finally {
      this.activeUploads -= 1;
      this.uploadQueue.shift()?.();
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
