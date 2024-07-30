import { QUEUES } from '../constants';
import { BroadcastStatus } from './broadcast.type';

export type QueueBroadcastLog = {
  queue: QUEUES;
  broadcast: string;
  status: BroadcastStatus;
  attempt: number;
  details?: Record<string, any>;
};

export type QueueBroadcastJob = {
  name: string;
  data: QueueBroadcastJobData;
};

export type QueueBroadcastJobData = {
  transportId: string;
  broadcastId: string;
  sessionId: string;
  address: string;
  attempt: number;
};
