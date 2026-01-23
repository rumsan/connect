/**
 * Standardized response from template creation
 */
export interface TemplateCreateResponse {
  externalId: string;
  providerResponse?: any;
}

/**
 * Template approval status response
 */
export interface TemplateApprovalStatus {
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
  lastUpdated?: Date;
  providerData?: any;
}

/**
 * Provider configuration extracted from transport
 */
export interface TemplateProviderConfig {
  provider: string;
  apiKey?: string;
  apiSecret?: string;
  accountSid?: string;
  baseUrl?: string;
  [key: string]: any;
}

/**
 * DTO for creating templates
 */
export interface CreateTemplateDto {
  name: string;
  body: string;
  app: string;
  type: 'TEXT' | 'MEDIA';
  transport: string;
  language?: string;
  variables?: Record<string, any>;
  media?: string[];
}

/**
 * Template data from provider
 */
export interface ProviderTemplate {
  externalId: string;
  name: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  type?: 'TEXT' | 'MEDIA';
  language?: string;
  body?: string;
  media?: string[];
  variables?: Record<string, any>;
  providerData?: any;
  lastUpdated?: Date;
}

/**
 * Base interface for template providers
 */
export interface ITemplateProvider {
  /**
   * Create a template in the provider system
   */
  create(dto: CreateTemplateDto): Promise<TemplateCreateResponse>;

  /**
   * Request approval for a template
   */
  requestApproval(externalId: string, name: string): Promise<void>;

  /**
   * Get approval status for a template
   */
  getApprovalStatus(externalId: string): Promise<TemplateApprovalStatus>;

  /**
   * Fetch all templates from provider
   * This method should be implemented by each provider to fetch their templates
   */
  fetchAllTemplates(): Promise<ProviderTemplate[]>;

  /**
   * Map provider-specific template data to our standard format
   */
  mapProviderTemplate(providerData: any): ProviderTemplate;
}
