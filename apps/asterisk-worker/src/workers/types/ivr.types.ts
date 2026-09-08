import { VoiceResponse } from '@rumsan/connect/types';
import { Playback } from 'ari-client';

/**
 * Marks an option as a record node: after its `prompt` finishes, the caller's
 * voice is recorded instead of the input timeout being armed.
 *
 * Field names mirror ARI's `POST /channels/{id}/record` params so there is no
 * translation layer. Every field is optional — the env defaults fill the gaps.
 */
export interface IVRRecordSpec {
  /** Defaults to true when the `record` object is present at all. */
  enabled?: boolean;
  maxDurationSeconds?: number;
  maxSilenceSeconds?: number;
  beep?: boolean;
  /** Single DTMF character that ends the recording, or 'none' / 'any'. */
  terminateOn?: string;
  /**
   * Played AFTER the recording finishes.
   *
   * The key MUST be named `prompt`: `AudioService.replacePromptsIfMatch` only
   * rewrites keys literally named `prompt` to the prepared `sound:` path, so
   * under any other name the raw https URL survives into the dialplan and ARI
   * is handed `sound:https://…` — a silent playback failure.
   */
  prompt?: string;
}

export interface IVRMenuOption {
  /** Dialplans in the wild use both `1` and `"1"` — always compare via Number(). */
  digit: number | string;
  prompt?: string;
  hangup?: boolean;
  /** `'record'` is a shorthand for `record: { enabled: true }`. */
  action?: string;
  destination?: string;
  /** Present and enabled means selecting this option records the caller's voice. */
  record?: IVRRecordSpec;
  /** Sub-menu. Present and non-empty means selecting this option descends. */
  options?: IVRMenuOption[];
}

export interface IVRMenu {
  prompt: string;
  options: IVRMenuOption[];
}

export interface IVRDialPlan {
  main: IVRMenu;
  [key: string]: IVRMenu;
}

export interface ChannelState {
  channelId: string;
  ivrDialPlan: IVRDialPlan | null;
  sessionId: string;
  broadcastLogId: string;
  address: string;
  activePlayback: Playback | null;
  activePlaybackId: string | null;
  hangupTimer: NodeJS.Timeout | null;
  isActive: boolean;
  playbackStarted: boolean;
  playbackFailed: boolean;
  playbackError?: string;
  dtmfSequence: string[];
  /** Digits from the root to the menu the caller is currently on; [] = main. */
  menuPath: number[];
  /** Dotted labels of the nodes the caller selected, e.g. ['1', '1.2']. */
  ivrSelections: string[];
  /** Voice messages recorded on this call, in order. */
  voiceResponses: VoiceResponse[];
  /** Name of the recording currently in flight; null when not recording. */
  activeRecordingName: string | null;
  createdAt: number;
  lastActivityAt: number;
}

export interface PlaybackStatus {
  playbackStarted: boolean;
  playbackFailed: boolean;
  playbackError?: string;
}

/** A record spec with every field resolved — what `RecordingService` acts on. */
export interface ResolvedRecordSpec {
  maxDurationSeconds: number;
  maxSilenceSeconds: number;
  beep: boolean;
  terminateOn: string;
  /** Prepared media for the post-record prompt, already `toMedia()`'d. */
  thanksMedia?: string;
}

/** Env-derived fallbacks for the fields a dialplan leaves out. */
export interface RecordDefaults {
  maxDurationSeconds: number;
  maxSilenceSeconds: number;
  beep: boolean;
  terminateOn: string;
  /** Hard ceiling on maxDurationSeconds, to stay clear of the channel reaper. */
  maxDurationCeilingSeconds: number;
}
