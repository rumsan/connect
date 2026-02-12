import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Base exception for template provider errors
 */
export class TemplateProviderException extends HttpException {
  constructor(
    message: string,
    public readonly provider: string,
    cause?: any,
  ) {
    const status = HttpStatus.BAD_GATEWAY;

    super(
      {
        statusCode: status,
        message,
        provider,
        error: 'Template Provider Error',
      },
      status,
    );

    // Set cause if provided (NestJS HttpException supports cause in newer versions)
    if (cause) {
      Object.defineProperty(this, 'cause', {
        value: cause,
        writable: false,
      });
    }
  }
}

/**
 * Thrown when provider configuration is invalid or missing
 */
export class TemplateProviderConfigException extends TemplateProviderException {
  constructor(provider: string, missingField: string) {
    super(
      `Invalid configuration for provider ${provider}: missing ${missingField}`,
      provider,
    );
  }
}

/**
 * Thrown when provider API call fails
 */
export class TemplateProviderApiException extends TemplateProviderException {
  constructor(
    provider: string,
    message: string,
    public readonly statusCode?: number,
    cause?: any,
  ) {
    super(
      `API error for provider ${provider}: ${message}`,
      provider,
      cause,
    );
  }
}

/**
 * Thrown when template is not found in provider system
 */
export class TemplateNotFoundException extends TemplateProviderException {
  constructor(provider: string, externalId: string) {
    super(
      `Template ${externalId} not found in provider ${provider}`,
      provider,
    );
  }
}

/**
 * Thrown when provider is not supported
 */
export class UnsupportedProviderException extends HttpException {
  constructor(provider: string, transportType: string) {
    super(
      {
        message: `Unsupported provider: ${provider} for transport type: ${transportType}`,
        provider,
        transportType,
        error: 'Unsupported Provider',
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
