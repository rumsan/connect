import { PaginationTypes } from './pagination.type';
import { Transport } from './transport.type';

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

export type CreateTemplate = {
  name: string;
  body: string;
  type: TemplateType;
  transport: string;
  language?: string;
  variables?: Record<string, any>;
  media?: string[];
};

export type UpdateTemplate = Partial<Omit<CreateTemplate, 'transport'>>;

export interface ListTemplate extends PaginationTypes {
  transportId?: string;
  status?: TemplateStatus;
  type?: TemplateType;
  name?: string;
  language?: string;
  isActive?: boolean;
  sort?: 'createdAt' | 'name' | 'status';
  order?: 'asc' | 'desc';
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
  createdAt?: Date;
  updatedAt?: Date | null;
  Transport?: Partial<Transport> | null;
};

export type TemplateApprovalStatus = {
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
  lastUpdated?: Date;
  providerData?: any;
};
