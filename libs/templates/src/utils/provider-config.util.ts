import { Transport } from '@prisma/client';
import { TemplateProviderConfigException } from '../exceptions/template-provider.exceptions';
import { TemplateProviderConfig } from '../interfaces/template-provider.interface';

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

    const config = transport.config as Record<string, any>;
    const meta = (config['meta'] || {}) as Record<string, any>;

    const provider = meta['provider'] ?? config['provider'];
    if (!provider) {
      throw new TemplateProviderConfigException(
        transport.type,
        'provider',
      );
    }

    return {
      provider,
      apiKey: meta['apiKey'] ?? config['apiKey'],
      apiSecret: meta['apiSecret'] ?? config['apiSecret'],
      accountSid: meta['accountSid'] ?? config['accountSid'],
      baseUrl: meta['baseUrl'] ?? config['baseUrl'],
      capabilities: meta['capabilities'] ?? config['capabilities'],
      ...config,
      ...meta,
    } as TemplateProviderConfig;
  }

  /**
   * Validate required fields for Twilio provider
   */
  static validateTwilioConfig(config: TemplateProviderConfig): void {
    const accountSid =
      config.accountSid ||
      process.env['TWILIO_ACCOUNT_SID'] ||
      process.env['TWILIO_SID'];
    const apiSecret =
      config.apiSecret ||
      process.env['TWILIO_AUTH_TOKEN'] ||
      process.env['TWILIO_SECRET'];

    if (!accountSid) {
      throw new TemplateProviderConfigException(
        'twilio',
        'accountSid (or TWILIO_ACCOUNT_SID / TWILIO_SID)',
      );
    }

    if (!apiSecret) {
      throw new TemplateProviderConfigException(
        'twilio',
        'apiSecret (or TWILIO_AUTH_TOKEN / TWILIO_SECRET)',
      );
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
      config.accountSid ||
      process.env['TWILIO_ACCOUNT_SID'] ||
      process.env['TWILIO_SID'];
    const apiSecret =
      config.apiSecret ||
      process.env['TWILIO_AUTH_TOKEN'] ||
      process.env['TWILIO_SECRET'];

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
