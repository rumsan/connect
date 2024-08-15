import { Transport } from './transport.type';

export enum TriggerType {
  IMMEDIATE = 'IMMEDIATE',
  SCHEDULED = 'SCHEDULED',
  MANUAL = 'MANUAL',
}

export enum SessionStatus {
  NEW = 'NEW',
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export type Session = {
  id: number;
  cuid: string;
  app?: string;
  transport: string;
  message: Record<string, any>;
  addresses: Record<string, any>;
  maxAttempts: number;
  triggerType: TriggerType;
  webhook: string | null;
  options?: Record<string, any> | null;
  status: SessionStatus;
  totalAddresses: number;
  stats?: Record<string, any> | null;
  createdAt?: Date;
  updatedAt?: Date | null;
  deletedAt?: Date | null;
  Transport?: Transport | null;
};
