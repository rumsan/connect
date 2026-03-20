import { BroadcastStatus } from './broadcast.type';

export enum TwilioMessageStatus {
  QUEUED = 'queued',
  SENDING = 'sending',
  SENT = 'sent',
  FAILED = 'failed',
  DELIVERED = 'delivered',
  UNDELIVERED = 'undelivered',
  RECEIVING = 'receiving',
  RECEIVED = 'received',
  ACCEPTED = 'accepted',
  SCHEDULED = 'scheduled',
  READ = 'read',
  PARTIALLY_DELIVERED = 'partially_delivered',
  CANCELED = 'canceled',
}

const TWILIO_PENDING_STATUSES: readonly TwilioMessageStatus[] = [
  TwilioMessageStatus.ACCEPTED,
  TwilioMessageStatus.SCHEDULED,
  TwilioMessageStatus.QUEUED,
  TwilioMessageStatus.SENDING,
  TwilioMessageStatus.RECEIVING,
  TwilioMessageStatus.RECEIVED,
];

const TWILIO_SUCCESS_STATUSES: readonly TwilioMessageStatus[] = [
  TwilioMessageStatus.SENT,
  TwilioMessageStatus.DELIVERED,
  TwilioMessageStatus.READ,
  TwilioMessageStatus.PARTIALLY_DELIVERED,
];

const TWILIO_FAIL_STATUSES: readonly TwilioMessageStatus[] = [
  TwilioMessageStatus.FAILED,
  TwilioMessageStatus.UNDELIVERED,
  TwilioMessageStatus.CANCELED,
];

export function normalizeTwilioMessageStatus(
  value?: string | null,
): TwilioMessageStatus | undefined {
  if (!value) {
    return undefined;
  }

  const normalizedValue = value.toLowerCase().trim();
  return Object.values(TwilioMessageStatus).find(
    (status) => status === normalizedValue,
  );
}

export function mapTwilioMessageStatusToBroadcastStatus(
  value?: string | null,
): BroadcastStatus {
  const normalizedValue = normalizeTwilioMessageStatus(value);

  if (!normalizedValue) {
    return BroadcastStatus.PENDING;
  }

  if (TWILIO_SUCCESS_STATUSES.includes(normalizedValue)) {
    return BroadcastStatus.SUCCESS;
  }

  if (TWILIO_FAIL_STATUSES.includes(normalizedValue)) {
    return BroadcastStatus.FAIL;
  }

  if (TWILIO_PENDING_STATUSES.includes(normalizedValue)) {
    return BroadcastStatus.PENDING;
  }

  return BroadcastStatus.PENDING;
}

export function isTerminalBroadcastStatus(status: BroadcastStatus): boolean {
  return [BroadcastStatus.SUCCESS, BroadcastStatus.FAIL].includes(status);
}
