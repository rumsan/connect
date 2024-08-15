import { BroadcastLog } from './broadcastLog.type';
import { Session, TriggerType } from './session.type';
import { Transport } from './transport.type';

export enum BroadcastStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAIL = 'FAIL',
}

export type Message = {
  content: string;
  meta?: Record<string, any>;
};

export type MessageBroadcast = {
  transport: string;
  message: Message;
  addresses: string[]; //address - email, phone number, whatsapp number
  maxAttempts: number; //default: 1
  trigger: TriggerType;
  webhook?: string;
  options: {
    scheduledTimestamp?: Date;
    attemptIntervalMinutes?: string; //default: 60 or 15,60,120,240
  };
};

export interface EmailMessage extends Message {
  meta: {
    subject: string;
    cc?: string[];
    bcc?: string[];
    from?: string;
  };
}

export type Broadcast = {
  id: number;
  cuid: string;
  app?: string;
  session: string;
  transport: string;
  address: string;
  status: BroadcastStatus;
  maxAttempts: number;
  attempts?: number;
  lastAttempt?: Date | null;
  isComplete: boolean;
  queuedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date | null;
  Transport?: Partial<Transport> | null;
  Session?: Partial<Session> | null;
  Logs?: BroadcastLog[];
};
