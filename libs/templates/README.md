# Templates Library

A reusable library for managing message templates across different providers (Twilio, Meta, Viber, etc.).

## Structure

```
libs/templates/src/
├── base/                    # Base classes and abstractions
│   └── base-template.provider.ts
├── twilio/                  # Twilio WhatsApp provider
│   ├── twilio-template.provider.ts
│   └── twilio.module.ts
├── factory/                 # Provider factory
│   └── template-provider.factory.ts
├── interfaces/              # TypeScript interfaces
│   └── template-provider.interface.ts
├── exceptions/              # Custom exceptions
│   └── template-provider.exceptions.ts
├── utils/                   # Utility functions and services
│   ├── http-client.service.ts
│   └── provider-config.util.ts
├── verification/            # Template verification service
│   └── template-verification.service.ts
└── enums/                   # Enumerations
    └── template-capability.enum.ts
```

## Usage

### In Your Application Module

```typescript
import { Module } from '@nestjs/common';
import {
  TemplateProviderFactory,
  TemplateVerificationService,
  TemplateHttpClientService,
} from '@rsconnect/templates';

@Module({
  providers: [
    TemplateProviderFactory,
    TemplateVerificationService,
    TemplateHttpClientService,
  ],
})
export class YourModule {}
```

### Creating a Template

```typescript
import { TemplateProviderFactory } from '@rsconnect/templates';

// Get transport from database
const transport = await prisma.transport.findUnique({ where: { cuid: transportId } });

// Create provider instance
const provider = templateProviderFactory.create(transport);

// Create template
const result = await provider.create({
  name: 'welcome_message',
  body: 'Hello {{1}}, welcome!',
  app: 'app-id',
  type: 'TEXT',
  transport: transportId,
  language: 'en',
  variables: { name: 'John' },
});
```

### Verifying Templates

```typescript
import { TemplateVerificationService } from '@rsconnect/templates';

const result = await templateVerificationService.verifyTemplate(
  transportId,
  templateName,
  parameters
);

if (!result.isValid) {
  throw new Error(result.errors.join(', '));
}
```

## Adding New Providers

To add a new provider (e.g., Meta, Viber):

### 1. Create Provider Class

Create a new directory under `src/` (e.g., `src/meta/`):

```typescript
// src/meta/meta-template.provider.ts
import { Injectable } from '@nestjs/common';
import { BaseTemplateProvider } from '../base/base-template.provider';
import {
  CreateTemplateDto,
  TemplateApprovalStatus,
  TemplateCreateResponse,
  TemplateProviderConfig,
} from '../interfaces/template-provider.interface';
import { TemplateHttpClientService } from '../utils/http-client.service';

@Injectable()
export class MetaWhatsAppTemplateProvider extends BaseTemplateProvider {
  private readonly httpClient: any;

  constructor(
    config: TemplateProviderConfig,
    private readonly httpClientService: TemplateHttpClientService,
  ) {
    super(config);
    // Initialize HTTP client with Meta API credentials
    this.httpClient = this.httpClientService.createClient({
      baseURL: 'https://graph.facebook.com/v18.0',
      timeout: 30000,
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
      },
    });
  }

  async create(dto: CreateTemplateDto): Promise<TemplateCreateResponse> {
    // Implement Meta-specific template creation logic
    const response = await this.httpClientService.post(
      this.httpClient,
      `/me/message_templates`,
      {
        name: dto.name,
        language: dto.language || 'en',
        category: 'UTILITY',
        components: [
          {
            type: 'BODY',
            text: dto.body,
          },
        ],
      }
    );

    return {
      externalId: response.id,
      providerResponse: response,
    };
  }

  async requestApproval(externalId: string, name: string): Promise<void> {
    // Meta templates are auto-approved or require manual approval in Meta Business Manager
    // Implement if needed
  }

  async getApprovalStatus(externalId: string): Promise<TemplateApprovalStatus> {
    // Fetch approval status from Meta API
    const response = await this.httpClientService.get(
      this.httpClient,
      `/me/message_templates/${externalId}`
    );

    return {
      status: response.status === 'APPROVED' ? 'APPROVED' : 'PENDING',
      providerData: response,
    };
  }

  async delete(externalId: string): Promise<void> {
    await this.httpClientService.delete(
      this.httpClient,
      `/me/message_templates/${externalId}`
    );
  }
}
```

### 2. Create Provider Module

```typescript
// src/meta/meta.module.ts
import { Module } from '@nestjs/common';
import { MetaWhatsAppTemplateProvider } from './meta-template.provider';
import { TemplateHttpClientService } from '../utils/http-client.service';

@Module({
  providers: [MetaWhatsAppTemplateProvider, TemplateHttpClientService],
  exports: [MetaWhatsAppTemplateProvider],
})
export class MetaTemplateModule {}
```

### 3. Register in Factory

Update `src/factory/template-provider.factory.ts`:

```typescript
import { MetaWhatsAppTemplateProvider } from '../meta/meta-template.provider';

// In the create method:
switch (config.provider.toLowerCase()) {
  case 'twilio':
    return new TwilioWhatsAppTemplateProvider(config, this.httpClientService);
  
  case 'meta':
    return new MetaWhatsAppTemplateProvider(config, this.httpClientService);
  
  default:
    throw new UnsupportedProviderException(config.provider, transport.type);
}

// Update static methods:
static isProviderSupported(provider: string): boolean {
  const supportedProviders = ['twilio', 'meta'];
  return supportedProviders.includes(provider.toLowerCase());
}

static getSupportedProviders(): string[] {
  return ['twilio', 'meta'];
}
```

### 4. Export from Library

Update `src/index.ts`:

```typescript
export * from './meta/meta-template.provider';
export * from './meta/meta.module';
```

### 5. Configure Transport

When creating a transport, configure it with the provider:

```json
{
  "type": "API",
  "config": {
    "provider": "meta",
    "accessToken": "your-access-token",
    "capabilities": ["TEMPLATE_VERIFICATION", "MEDIA_SUPPORT"]
  }
}
```

## Template Capabilities

Providers can support different capabilities:

- `TEMPLATE_VERIFICATION`: Requires template approval before use
- `MEDIA_SUPPORT`: Supports media templates
- `MULTI_LANGUAGE`: Supports multiple languages
- `PARAMETER_VALIDATION`: Validates template parameters

Configure capabilities in the transport config:

```json
{
  "capabilities": ["TEMPLATE_VERIFICATION", "MEDIA_SUPPORT"]
}
```

## Building

```bash
nx build templates
```

## Testing

```bash
nx test templates
```
