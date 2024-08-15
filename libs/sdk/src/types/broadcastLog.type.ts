import { BroadcastStatus } from './broadcast.type';
import { CallDetails } from './voice.type';

export interface BroadcastLog {
  cuid: string;
  app?: string;
  session: string;
  broadcast: string;
  status: BroadcastStatus;
  attempt: number;
  details?: Record<string, any>;
  notes?: string | null;
  createdAt: Date;
}

export interface BroadcastLogVoice extends BroadcastLog {
  details?: CallDetails;
}
