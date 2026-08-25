export enum QUEUES {
  TRANSPORT_ECHO = 'rsconnect.transport.echo',
  TRANSPORT_SMTP = 'rsconnect.transport.smtp',
  TRANSPORT_VOICE = 'rsconnect.transport.voice',
  TRANSPORT_API = 'rsconnect.transport.api',
  TO_CONNECT = 'rsconnect.to.connect',
  SCHEDULED = 'rsconnect.scheduled',
}

export enum QUEUE_ACTIONS {
  BROADCAST = 'broadcast',
  READINESS_CHECK = 'readiness_check',
  READINESS_CONFIRM = 'readiness_confirm',
  BROADCAST_LOG_CREATE = 'broadcast_log_create',
  BROADCAST_LOG_UPDATE = 'broadcast_log_update',
  BROADCAST_LOG_DETAILS = 'broadcast_log_details',
  DELAY = 'delay',
  SESSION_COMPLETE = 'session_complete',
  WORKER_HEARTBEAT = 'worker_heartbeat',
  SESSION_START = 'session_start',
  SESSION_END = 'session_end',
}

export const ACTION_LABEL = 'action'; // 'action' is the key in the message content in BullMQ this would be "name"

/**
 * Topic exchange used to address a message to one specific worker instance
 * (`<transport>.worker.<workerId>`) or to every worker of a transport
 * (`<transport>.control`). Transports with a single worker keep publishing
 * straight to their QUEUES.TRANSPORT_* queue and never touch this.
 */
export enum EXCHANGES {
  TRANSPORT = 'rsconnect.transport',
}

/** Short transport name used in routing keys and per-worker queue names. */
export enum TRANSPORT_SLUG {
  ECHO = 'echo',
  SMTP = 'smtp',
  VOICE = 'voice',
  API = 'api',
}

export const controlRoutingKey = (transport: TRANSPORT_SLUG | string) =>
  `${transport}.control`;

export const workerRoutingKey = (
  transport: TRANSPORT_SLUG | string,
  workerId: string,
) => `${transport}.worker.${workerId}`;

export const workerQueueName = (
  transport: TRANSPORT_SLUG | string,
  workerId: string,
) => `rsconnect.transport.${transport}.${workerId}`;
