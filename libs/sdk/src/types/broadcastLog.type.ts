import { BroadcastStatus } from './broadcast.type';

export type BroadcastLog = {
  cuid: string;
  broadcast: string;
  status: BroadcastStatus;
  attempt: number;
  details?: Record<string, any>;
  notes?: string | null;
  createdAt: Date;
};
