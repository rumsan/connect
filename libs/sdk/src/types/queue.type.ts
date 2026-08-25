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

/**
 * READINESS_CONFIRM payload. `workerId` tells connect which worker asked for
 * work so the batch can be addressed back to it. Absent for single-worker
 * transports, which keep the shared-queue behaviour.
 */
export type QueueReadinessConfirm = {
  sessionCuid: string;
  maxBatchSize: number;
  workerId?: string;
};

export type QueueSessionComplete = {
  sessionCuid: string;
  workerId?: string;
};

/**
 * Periodic liveness/capacity announcement from a transport worker. Connect's
 * WorkerRegistry builds its roster from these — there is no separate
 * registration step.
 */
export type QueueWorkerHeartbeat = {
  workerId: string;
  transport: string;
  /** 1 = primary. Lower wins when connect picks which worker to use first. */
  priority: number;
  /** Max concurrent broadcasts this worker accepts (its BATCH_SIZE). */
  capacity: number;
  /** Session currently held by the worker's SessionGate, if any. */
  activeSessionCuid: string | null;
  /** Broadcasts currently in flight on this worker. */
  inFlight: number;
};
export interface QueueSessionTiming {
  sessionCuid: string;
  at: string; // ISO timestamp, stamped by the worker
  workerId?: string;
}
