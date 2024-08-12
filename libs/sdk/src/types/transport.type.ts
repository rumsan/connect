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
  createdAt?: Date;
  updatedAt?: Date | null;
  deletedAt?: Date | null;
};

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
};

export type TransportEchoConfig = {
  slack_url?: string;
  slack_email?: string;
};
