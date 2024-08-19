export enum QUEUES {
  TRANSPORT_ECHO = 'rsconnect.transport.echo',
  TRANSPORT_SMTP = 'rsconnect.transport.smtp',
  TRANSPORT_VOICE = 'rsconnect.transport.voice',
  TRANSPORT_API = 'rsconnect.transport.api',
  TO_CONNECT = 'rsconnect.to.connect',
}

export enum QUEUE_ACTIONS {
  BROADCAST = 'broadcast',
  READINESS_CHECK = 'readiness_check',
  READINESS_CONFIRM = 'readiness_confirm',
  BROADCAST_LOG_CREATE = 'broadcast_log_create',
  BROADCAST_LOG_UPDATE = 'broadcast_log_update',
  BROADCAST_LOG_DETAILS = 'broadcast_log_details',
}

export const ACTION_LABEL = 'action'; // 'action' is the key in the message content in BullMQ this would be "name"
