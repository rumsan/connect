/**
 * Console-local mirrors of the Connect API contracts.
 *
 * Deliberately not imported from `@rumsan/connect` — that SDK is app-id scoped
 * and this console is a super-admin surface spanning every app. Keeping the
 * shapes here means the console can be built against the existing API without
 * changing anything in Connect.
 */

export type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  meta?: PaginationMeta;
  code?: string;
};

export type PaginationMeta = {
  total?: number;
  page?: number;
  perPage?: number;
  lastPage?: number;
  currentPage?: number;
};

export enum ApplicationEnvironment {
  DEVELOPMENT = 'DEVELOPMENT',
  STAGING = 'STAGING',
  PRODUCTION = 'PRODUCTION',
}

export type Application = {
  cuid: string;
  name: string;
  publicKey: string;
  description: string | null;
  environment: ApplicationEnvironment;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
};

export type CreateApplication = {
  name: string;
  description?: string;
  environment: ApplicationEnvironment;
  /** Omit to have Connect generate a keypair and return the private key once. */
  publicKey?: string;
};

export type CreateApplicationResult = {
  app: Application;
  privateKey: string | null;
  message: string;
};

export enum TransportType {
  SMTP = 'SMTP',
  VOICE = 'VOICE',
  API = 'API',
  SES = 'SES',
  ECHO = 'ECHO',
}

export enum CreditUnitType {
  MESSAGE = 'MESSAGE',
  SEGMENT = 'SEGMENT',
  API_CALL = 'API_CALL',
  SECOND = 'SECOND',
  MINUTE = 'MINUTE',
}

export enum ValidationContent {
  URL = 'URL',
  TEXT = 'TEXT',
}

export enum ValidationAddress {
  ANY = 'ANY',
  EMAIL = 'EMAIL',
  PHONE = 'PHONE',
}

export type TransportPricing = {
  id: number;
  cuid: string;
  transportCuid: string;
  creditPerUnit: number;
  unitType: CreditUnitType;
  currency: string;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string | null;
};

export type SetTransportPricing = {
  creditPerUnit: number;
  unitType: CreditUnitType;
  currency?: string;
  notes?: string;
};

export type Transport = {
  id?: number;
  cuid: string;
  app?: string;
  name: string;
  type: TransportType;
  config: Record<string, unknown>;
  stats?: Record<string, unknown> | null;
  validationContent?: ValidationContent;
  validationAddress?: ValidationAddress;
  Pricing?: TransportPricing | null;
  createdAt?: string;
  updatedAt?: string | null;
  deletedAt?: string | null;
};

export type CreateTransport = {
  name: string;
  type: TransportType;
  config: Record<string, unknown>;
  validationContent?: ValidationContent;
  validationAddress?: ValidationAddress;
  /** Accepted on create; the saved record comes back as `Pricing`. */
  pricing?: SetTransportPricing;
};

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

export enum BroadcastStatus {
  SCHEDULED = 'SCHEDULED',
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAIL = 'FAIL',
}

export type Session = {
  id?: number;
  cuid: string;
  app?: string;
  transport: string;
  message: Record<string, unknown>;
  addresses: string[];
  maxAttempts: number;
  triggerType: TriggerType;
  webhook?: string | null;
  options?: Record<string, unknown> | null;
  xref?: string;
  status: SessionStatus;
  totalAddresses: number;
  stats?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string | null;
  Transport?: Transport | null;
};

export type Broadcast = {
  id: number;
  cuid: string;
  app?: string;
  session: string;
  transport: string;
  address: string;
  status: BroadcastStatus;
  xref?: string;
  maxAttempts: number;
  attempts?: number;
  lastAttempt?: string | null;
  disposition?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string | null;
  Transport?: Partial<Transport> | null;
  Session?: Partial<Session> | null;
};

export type BroadcastLog = {
  cuid: string;
  app?: string;
  session: string;
  broadcast: string;
  status: BroadcastStatus;
  attempt: number;
  details?: Record<string, unknown>;
  notes?: string | null;
  createdAt: string;
};

/** Body for `POST /broadcasts`. `message` is either content- or template-shaped. */
export type SendBroadcast = {
  transport: string;
  message:
    | { content: string; meta?: Record<string, unknown> }
    | { templateId: string; meta?: Record<string, unknown> };
  addresses: string[];
  maxAttempts?: number;
  trigger: TriggerType;
  webhook?: string;
  options?: {
    scheduledTimestamp?: string;
    attemptIntervalMinutes?: string;
  };
  xref?: string;
};

export type BroadcastStatusCount = {
  pending?: number;
  success?: number;
  fail?: number;
  total?: number;
};

export enum TemplateStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum TemplateType {
  TEXT = 'TEXT',
  MEDIA = 'MEDIA',
}

export type Template = {
  id?: number;
  cuid: string;
  app?: string;
  transportId: string;
  name: string;
  externalId?: string | null;
  status: TemplateStatus;
  type: TemplateType;
  language: string;
  body?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string | null;
  Transport?: Partial<Transport> | null;
};

export type CreateTemplate = {
  name: string;
  body: string;
  type: TemplateType;
  transport: string;
  language?: string;
  variables?: Record<string, unknown>;
  media?: string[];
};

export type UsageTotals = {
  sessions: number;
  broadcasts: number;
  success: number;
  fail: number;
  chars: number;
  segments: number;
  duration: number;
  calls: number;
  credits: number;
};

export type UsageByTransport = {
  transportCuid: string;
  transportName: string;
  transportType: string;
  broadcasts: number;
  success: number;
  fail: number;
  chars: number;
  segments: number;
  duration: number;
  calls: number;
  credits: number;
};

export type UsageResponse = {
  totals: UsageTotals;
  byTransport: UsageByTransport[];
};

export type CreditsEntry = {
  date: string;
  transportCuid: string;
  transportName: string;
  transportType: string;
  credits: number;
  sessions: number;
  broadcasts: number;
  sessionCuids: string[];
};
