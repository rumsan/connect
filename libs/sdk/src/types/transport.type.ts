export enum TransportType {
  SMTP = 'SMTP',
  VOICE = 'VOICE',
  API = 'API',
  SES = 'SES',
  ECHO = 'ECHO',
}

export type Transport = {
  app?: string;
  name: string;
  type: TransportType;
  config: Record<string, any>;
  id?: number;
  cuid?: string;
  stats?: Record<string, any> | null;
  validationContent?: string;
  validationAddress?: string;
  Pricing?: TransportPricing | null;
  createdAt?: Date;
  updatedAt?: Date | null;
  deletedAt?: Date | null;
};

export type TransportPricing = {
  id: number;
  cuid: string;
  transportCuid: string;
  creditPerUnit: number;
  unitType: CreditUnitType;
  currency: string;
  notes?: string | null;
  createdAt?: Date;
  updatedAt?: Date | null;
};

export enum CreditUnitType {
  MESSAGE = 'MESSAGE',
  SEGMENT = 'SEGMENT',
  API_CALL = 'API_CALL',
  SECOND = 'SECOND',
  MINUTE = 'MINUTE',
}

export type TransportConfig<T> = {
  app?: string;
  name: string;
  type: TransportType;
  config: T;
  id?: number;
  cuid?: string;
  stats?: Record<string, any> | null;
  createdAt?: Date;
  updatedAt?: Date | null;
  deletedAt?: Date | null;
};

export type TransportSmtpConfig = {
  host: string;
  port?: number;
  secure?: boolean;
  username: string;
  password: string;
  defaultFrom?: string;
  defaultSubject?: string;
};

export type TransportApiConfig = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: Record<string, any>;
  timeout?: number;
  meta?: ConfigMeta;
};

export type ConfigMeta = {
  provider?: string;
  apiSecret?: string;
  accountSid?: string;
  capabilities?: string[];
  addressPrefix?: string;
  stripNonNumeric?: boolean;
};

export type TransportEchoConfig = {
  slack_url?: string;
  slack_email?: string;
};
