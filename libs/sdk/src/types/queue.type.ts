import { QUEUES } from '../constants';
import { BroadcastStatus } from './broadcast.type';
import { CallDetails } from './voice.type';

export interface QueueBroadcastLog {
  queue: QUEUES;
  broadcastLogId: string;
  broadcastId: string;
  sessionId: string;
  attempt: number;
  status: BroadcastStatus;
  details?: Record<string, any>;
  notes?: string;
}

export interface QueueBroadcastLogVoice extends QueueBroadcastLog {
  queue: QUEUES.TRANSPORT_VOICE;
  details?: CallDetails;
}

export interface QueueBroadcastLogDetails {
  broadcastLogId: string;
  status?: BroadcastStatus;
  details: Record<string, any>;
  notes?: string;
}

export interface QueueBroadcastLogVoiceDetails
  extends QueueBroadcastLogDetails {
  details: CallDetails;
}

export type QueueJobData<T> = {
  action: string;
  data: T;
};

// export type QueueBroadcastJobData = {
//   address: string;
//   broadcastLogId: string;
//   broadcastId: string;
//   sessionId: string;
//   transportId: string;
//   attempt: number;
// };

export type BroadcastJobData = {
  address: string;
  broadcastLogId: string;
  broadcastId: string;
  attempt: number;
};

export type QueueBroadcastJobData = {
  sessionId: string;
  transportId: string;
  broadcasts: BroadcastJobData[];
};
