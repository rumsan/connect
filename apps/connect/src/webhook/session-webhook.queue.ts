export const SESSION_WEBHOOK_QUEUE = 'rsconnect.session.webhook';
export const SESSION_WEBHOOK_JOB = 'session.completed';

/**
 * A session is worth calling out about twice.
 *
 * `executed` fires the moment the last broadcast has been handed to the
 * transport — every row is still PENDING, so the receiver learns the send
 * started but can say nothing about outcomes.
 *
 * `settled` fires once every broadcast holds a terminal status. This is the
 * only phase a receiver can act on failures from: a fallback that looks for
 * FAIL rows at `executed` time finds none, because none exist yet.
 */
export type SessionWebhookPhase = 'executed' | 'settled';

export type SessionWebhookJobData = {
  sessionCuid: string;
  phase?: SessionWebhookPhase;
};
