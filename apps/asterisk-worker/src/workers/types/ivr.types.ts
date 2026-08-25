import { Playback } from 'ari-client';

export interface IVRMenuOption {
  /** Dialplans in the wild use both `1` and `"1"` — always compare via Number(). */
  digit: number | string;
  prompt?: string;
  hangup?: boolean;
  action?: string;
  destination?: string;
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
  createdAt: number;
  lastActivityAt: number;
}

export interface PlaybackStatus {
  playbackStarted: boolean;
  playbackFailed: boolean;
  playbackError?: string;
}
