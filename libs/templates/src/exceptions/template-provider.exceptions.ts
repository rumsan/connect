import { HttpException, HttpStatus } from '@nestjs/common';

function normalizeHttpStatus(statusCode?: number): number {
  if (
    typeof statusCode === 'number' &&
    Number.isInteger(statusCode) &&
    statusCode >= 100 &&
    statusCode <= 599
  ) {
    return statusCode;
  }

  return HttpStatus.BAD_GATEWAY;
}

/**
 * Base exception for template provider errors
 */
export class TemplateProviderException extends HttpException {
  public readonly statusCode: number;

  constructor(
    message: string,
    public readonly provider: string,
    statusCode: number = HttpStatus.BAD_GATEWAY,
    cause?: any,
  ) {
    const safeStatusCode = normalizeHttpStatus(statusCode);
    super(
      {
        message,
        provider,
        statusCode: safeStatusCode,
        error: 'Template Provider Error',
      },
      safeStatusCode,
    );
    this.statusCode = safeStatusCode;

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
      HttpStatus.BAD_REQUEST,
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
    statusCode?: number,
    cause?: any,
  ) {
    const safeStatusCode = normalizeHttpStatus(statusCode);
    super(
      `API error for provider ${provider}: ${message}`,
      provider,
      safeStatusCode,
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
