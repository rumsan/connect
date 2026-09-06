import { QUEUES, TRANSPORT_SLUG } from '@rumsan/connect';

const SLUG_BY_QUEUE: Record<string, TRANSPORT_SLUG> = {
  [QUEUES.TRANSPORT_ECHO]: TRANSPORT_SLUG.ECHO,
  [QUEUES.TRANSPORT_SMTP]: TRANSPORT_SLUG.SMTP,
  [QUEUES.TRANSPORT_VOICE]: TRANSPORT_SLUG.VOICE,
  [QUEUES.TRANSPORT_API]: TRANSPORT_SLUG.API,
};

/**
 * Short transport name used in routing keys and per-worker queue names, derived
 * from the shared queue name so callers can keep passing QUEUES values around.
 */
export const transportSlugFromQueue = (queue: QUEUES): TRANSPORT_SLUG => {
  const slug = SLUG_BY_QUEUE[queue];
  if (!slug) {
    throw new Error(`No transport slug for queue "${queue}"`);
  }
  return slug;
};
