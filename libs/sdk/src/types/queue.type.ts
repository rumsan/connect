import { QUEUES } from '../constants';
import { BroadcastStatus } from './broadcast.type';
import { CallDetails } from './voice.type';

export interface QueueBroadcastLog {
  cuid?: string;
  queue: QUEUES;
  broadcast: string;
  status: BroadcastStatus;
  attempt: number;
  details?: Record<string, any>;
  notes?: string;
}

export interface QueueBroadcastVoiceLog extends QueueBroadcastLog {
  queue: QUEUES.TRANSPORT_VOICE;
  details?: CallDetails;
}

// export type QueueBroadcastJob = {
//   name: string;
//   data: QueueBroadcastJobData;
// };

export type QueueJobData<T> = {
  action: string;
  data: T;
};

export type QueueBroadcastJobData = {
  transportId: string;
  broadcastId: string;
  broadcastLogId?: string;
  sessionId: string;
  address: string;
  attempt: number;
};
