import { Transport } from '@prisma/client';
import { TemplateProviderConfig } from '../interfaces/template-provider.interface';
import { TemplateProviderConfigException } from '../exceptions/template-provider.exceptions';

/**
 * Extract and validate provider configuration from transport
 */
export class ProviderConfigUtil {
  /**
   * Extract provider configuration from transport config
   */
  static extractConfig(transport: Transport): TemplateProviderConfig {
    if (!transport.config) {
      throw new TemplateProviderConfigException(
        transport.type,
        'config',
      );
    }

    const config = transport.config as any;

    if (!config.provider) {
      throw new TemplateProviderConfigException(
        transport.type,
        'provider',
      );
    }

    return {
      provider: config.provider,
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
      accountSid: config.accountSid,
      baseUrl: config.baseUrl,
      ...config,
    };
  }

  /**
   * Validate required fields for Twilio provider
   */
  static validateTwilioConfig(config: TemplateProviderConfig): void {
    if (!config.accountSid && !config.apiKey) {
      throw new TemplateProviderConfigException(
        'twilio',
        'accountSid or apiKey',
      );
    }

    if (!config.apiSecret) {
      throw new TemplateProviderConfigException('twilio', 'apiSecret');
    }
  }

  /**
   * Get credentials for Twilio authentication
   * Checks config first, falls back to environment variables
   */
  static getTwilioCredentials(config: TemplateProviderConfig): {
    username: string;
    password: string;
  } {
    const accountSid =
      config.accountSid || process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_SID;
    const apiSecret = config.apiSecret || process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_SECRET;

    if (!accountSid || !apiSecret) {
      throw new TemplateProviderConfigException(
        'twilio',
        'accountSid and apiSecret (not found in config or env)',
      );
    }

    return {
      username: accountSid,
      password: apiSecret,
    };
  }
}
