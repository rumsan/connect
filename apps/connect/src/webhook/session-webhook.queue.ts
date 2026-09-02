export const SESSION_WEBHOOK_QUEUE = 'rsconnect.session.webhook';
export const SESSION_WEBHOOK_JOB = 'session.completed';

export type SessionWebhookJobData = {
  sessionCuid: string;
};
