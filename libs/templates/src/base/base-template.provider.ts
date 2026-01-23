import { Logger } from '@nestjs/common';
import {
    CreateTemplateDto,
    ITemplateProvider,
    TemplateApprovalStatus,
    TemplateCreateResponse,
    TemplateProviderConfig,
} from '../interfaces/template-provider.interface';

/**
 * Abstract base class for template providers
 * Provides common functionality and enforces interface contract
 */
export abstract class BaseTemplateProvider implements ITemplateProvider {
  protected readonly logger: Logger;
  protected readonly config: TemplateProviderConfig;

  constructor(config: TemplateProviderConfig) {
    this.config = config;
    this.logger = new Logger(this.constructor.name);
  }

  /**
   * Create a template in the provider system
   */
  abstract create(dto: CreateTemplateDto): Promise<TemplateCreateResponse>;

  /**
   * Request approval for a template
   */
  abstract requestApproval(
    externalId: string,
    name: string,
  ): Promise<void>;

  /**
   * Get approval status for a template
   */
  abstract getApprovalStatus(
    externalId: string,
  ): Promise<TemplateApprovalStatus>;

  /**
   * Fetch all templates from provider
   * Default implementation throws error - override in provider implementations
   */
  async fetchAllTemplates(): Promise<import('../interfaces/template-provider.interface').ProviderTemplate[]> {
    throw new Error(
      `fetchAllTemplates not implemented for provider: ${this.config.provider}`,
    );
  }

  /**
   * Map provider-specific template data to our standard format
   * Default implementation throws error - override in provider implementations
   */
  mapProviderTemplate(providerData: any): import('../interfaces/template-provider.interface').ProviderTemplate {
    throw new Error(
      `mapProviderTemplate not implemented for provider: ${this.config.provider}`,
    );
  }

  /**
   * Get provider name
   */
  getProviderName(): string {
    return this.config.provider;
  }
}
