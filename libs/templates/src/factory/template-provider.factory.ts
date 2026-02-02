import { Injectable, Logger } from '@nestjs/common';
import { Transport } from '@prisma/client';
import { BaseTemplateProvider } from '../base/base-template.provider';
import { TwilioWhatsAppTemplateProvider } from '../twilio/twilio-template.provider';
import { ProviderConfigUtil } from '../utils/provider-config.util';
import { UnsupportedProviderException } from '../exceptions/template-provider.exceptions';
import { TemplateHttpClientService } from '../utils/http-client.service';
import { TemplateProviderConfig } from '../interfaces/template-provider.interface';

/**
 * Factory for creating template provider instances
 * Supports dependency injection for better testability
 */
@Injectable()
export class TemplateProviderFactory {
  private readonly logger = new Logger(TemplateProviderFactory.name);

  constructor(
    private readonly httpClientService: TemplateHttpClientService,
  ) {}

  /**
   * Create a template provider instance based on transport configuration
   */
  create(transport: Transport): BaseTemplateProvider {
    if (transport.type !== 'API') {
      throw new UnsupportedProviderException('', transport.type);
    }

    const config = ProviderConfigUtil.extractConfig(transport);

    this.logger.log(
      `Creating template provider: ${config.provider} for transport: ${transport.cuid}`,
    );

    switch (config.provider.toLowerCase()) {
      case 'twilio':
        return new TwilioWhatsAppTemplateProvider(
          config,
          this.httpClientService,
        );

      default:
        throw new UnsupportedProviderException(
          config.provider,
          transport.type,
        );
    }
  }

  /**
   * Check if a provider is supported
   */
  static isProviderSupported(provider: string): boolean {
    const supportedProviders = ['twilio'];
    return supportedProviders.includes(provider.toLowerCase());
  }

  /**
   * Get list of supported providers
   */
  static getSupportedProviders(): string[] {
    return ['twilio'];
  }
}
