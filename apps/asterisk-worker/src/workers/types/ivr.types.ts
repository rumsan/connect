import { Playback } from 'ari-client';

export interface IVRMenuOption {
  digit: number;
  prompt?: string;
  hangup?: boolean;
  action?: string;
  destination?: string;
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
}
