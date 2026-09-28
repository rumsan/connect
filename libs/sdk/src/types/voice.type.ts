export type CallDetails = {
  trunk: string;
  disposition: CallDisposition;
  answerTime?: string;
  endTime?: string;
  duration?: number;
  hangupDetails?: Record<string, string>;
  cdr?: Record<string, string>;
  ivrSequence?: string[];
  /** Dotted paths of the IVR nodes selected, e.g. ['1', '1.2'] — disambiguates ivrSequence in a nested dialplan. */
  ivrPath?: string[];
  /** Voice messages the caller left, in the order recorded. */
  voiceResponses?: VoiceResponse[];
  playbackOk?: boolean;
  playbackStarted?: boolean;
  playbackFailed?: boolean;
  playbackError?: string;
  errorTag?: string;
  ageMs?: number;
};

/**
 * Lifecycle of one voice response. `uploaded` and `failed` are terminal; the
 * others are in-flight states that can appear in the first report and are
 * replaced by the follow-up once the upload settles.
 */
export type VoiceResponseStatus =
  | 'recording'
  | 'finalizing'
  | 'recorded'
  | 'uploading'
  | 'uploaded'
  | 'failed';

export const TERMINAL_VOICE_RESPONSE_STATUSES: VoiceResponseStatus[] = [
  'uploaded',
  'failed',
];

/**
 * A voice message the caller left at a record node of the IVR.
 *
 * The Asterisk-side location (`workerId`, `ariRecordingUrl`, `asteriskFile`) is
 * populated the moment recording starts and is never contingent on the upload,
 * so a report is always able to say where the audio is even when S3 is down.
 */
export type VoiceResponse = {
  /** Dotted IVR path of the record node — same convention as `ivrPath`, e.g. '1.3'. */
  path: string;
  /** Digit that selected the record node. */
  digit: string;
  /** DTMF pressed up to the moment recording started — the sequence this response answers. */
  dtmfBefore: string[];
  /** Asterisk recording name; identifies the file on the box. */
  recordingName: string;
  status: VoiceResponseStatus;
  /** ISO timestamp of when recording started. */
  startedAt: string;

  /** Worker owning the Asterisk box that holds the file (WORKER_ID, else hostname). */
  workerId: string;
  /** ARI stored-recording endpoint. Needs ARI basic auth. */
  ariRecordingUrl: string;
  /** On-box file path, for an operator with shell access. */
  asteriskFile: string;
  /** True while the file is still on the box — upload failed, or deletion disabled. */
  retainedOnBox: boolean;

  durationSeconds?: number;
  sizeBytes?: number;
  /** Permanent public object URL. Present only when status is 'uploaded'. */
  url?: string;
  /** Bucket key, so a consumer can re-fetch the object without parsing the URL. */
  objectKey?: string;
  format?: string;
  error?: string;
};

export enum CallDisposition {
  ANSWERED = 'ANSWERED', //cause 16, channel 6, cdr=y
  NO_ANSWER = 'NO ANSWER', //cause 19, channel 5
  REJECTED = 'REJECTED', //cause 21, channel 5
  NOT_FOUND = 'NOT FOUND', //cause 16, channel 0
  BUSY = 'BUSY', //cause 17, channel 0
  CONGESION = 'CONGESION', //cause 34, channel 0
  FAILED = 'FAILED',
}
