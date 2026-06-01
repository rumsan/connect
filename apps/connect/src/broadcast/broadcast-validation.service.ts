import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Template, TemplateStatus, Transport } from '@prisma/client';
import {
  TemplateProviderFactory,
  TemplateVerificationService,
} from '@rsconnect/templates';
import { PrismaService } from '@rumsan/prisma';
import {
  ContentMessageDto,
  TemplateMessageDto,
} from './dto/broadcast.dto';
import { getAddressValidator, getContentValidator } from './validators';

@Injectable()
export class BroadcastValidationService {
  private readonly logger = new Logger(BroadcastValidationService.name);

  constructor(
    private prisma: PrismaService,
    private templateVerificationService: TemplateVerificationService,
    private templateProviderFactory: TemplateProviderFactory,
  ) {}

  /**
   * Type guard to check if message is ContentMessageDto
   */
  private isContentMessage(
    message: ContentMessageDto | TemplateMessageDto,
  ): message is ContentMessageDto {
    return 'content' in message && message.content !== undefined;
  }

  /**
   * Main validation method that routes to appropriate validators.
   * Returns a resolved ContentMessageDto ready for session storage.
   */
  async validateBroadcastData(
    transportId: string,
    message: ContentMessageDto | TemplateMessageDto,
    addresses: string[],
  ): Promise<ContentMessageDto> {
    const t = await this.prisma.transport.findUnique({
      where: {
        cuid: transportId,
      },
    });
    if (!t) throw new Error('Transport not found.');

    // Validate addresses (common for both types)
    await this.validateAddresses(addresses, t);

    // Route to appropriate validator based on message type
    if (this.isContentMessage(message)) {
      return this.validateContentMessage(transportId, message, t);
    } else {
      return this.resolveTemplateMessage(transportId, message, t);
    }
  }

  /**
   * Validate content-based messages
   */
  private async validateContentMessage(
    transportId: string,
    message: ContentMessageDto,
    transport: Transport,
  ): Promise<ContentMessageDto> {
    const contentValidator = getContentValidator(transport.validationContent);

    if (!contentValidator(message.content)) {
      throw new Error(`Content: ${message.content} validation failed.`);
    }

    // WhatsApp template validation for content messages
    this.validateWhatsAppTemplate(transport, message);

    return message;
  }

  /**
   * Resolve template-based messages into ContentMessageDto.
   * Checks provider approval status and resolves to content.
   */
  private async resolveTemplateMessage(
    transportId: string,
    message: TemplateMessageDto,
    transport: Transport,
  ): Promise<ContentMessageDto> {
    if (!message.templateId) {
      throw new BadRequestException('templateId is required in message');
    }

    const template = await this.prisma.template.findUnique({
      where: { cuid: message.templateId },
      include: { Transport: true },
    });

    if (!template) {
      throw new BadRequestException(
        `Template with ID '${message.templateId}' not found`,
      );
    }

    if (!template.isActive) {
      throw new BadRequestException(
        `Template '${message.templateId}' is not active`,
      );
    }

    const requiresVerification =
      this.templateVerificationService.requiresTemplateVerification(
        transport,
      );

    if (requiresVerification) {
      return this.resolveVerifiedTemplate(template, message, transport);
    } else {
      return this.resolveUnverifiedTemplate(template, message);
    }
  }

  /**
   * Resolve template for transports that require TEMPLATE_VERIFICATION.
   * Uses externalId as content. Checks provider approval if not yet approved in DB.
   */
  private async resolveVerifiedTemplate(
    template: Template,
    message: TemplateMessageDto,
    transport: Transport,
  ): Promise<ContentMessageDto> {
    if (!template.externalId) {
      throw new BadRequestException(
        `Template '${message.templateId}' has no externalId. ` +
        `Transports with TEMPLATE_VERIFICATION require an externalId.`,
      );
    }

    if (template.status !== TemplateStatus.APPROVED) {
      // Check with the actual provider
      const provider = this.templateProviderFactory.create(transport);
      const approvalStatus = await provider.getApprovalStatus(
        template.externalId,
      );

      if (approvalStatus.status === 'APPROVED') {
        // Provider has approved — update our DB
        await this.prisma.template.update({
          where: { cuid: template.cuid },
          data: { status: TemplateStatus.APPROVED },
        });
        this.logger.log(
          `Template '${template.cuid}' approved by provider, updated DB status`,
        );
      } else {
        // Not approved yet — trigger approval request and return error
        try {
          await provider.requestApproval(template.externalId, template.name);
        } catch (e) {
          this.logger.warn(
            `Failed to request approval for template '${template.cuid}': ${e.message}`,
          );
        }
        throw new BadRequestException(
          `Template '${message.templateId}' is being verified (status: ${approvalStatus.status}). ` +
          `Please try again once it is approved.`,
        );
      }
    }

    return {
      content: template.externalId,
      meta: {
        ...message.meta,
        templateId: message.templateId,
        resolvedFrom: 'externalId',
      },
    };
  }

  /**
   * Resolve template for transports that do NOT require TEMPLATE_VERIFICATION.
   * Uses template body as content.
   */
  private async resolveUnverifiedTemplate(
    template: Template,
    message: TemplateMessageDto,
  ): Promise<ContentMessageDto> {
    if (!template.body) {
      throw new BadRequestException(
        `Template '${message.templateId}' has no body content`,
      );
    }

    return {
      content: template.body,
      meta: {
        ...message.meta,
        templateId: message.templateId,
        resolvedFrom: 'body',
      },
    };
  }

  /**
   * Validate addresses for the transport
   */
  private async validateAddresses(
    addresses: string[],
    transport: Transport,
  ) {
    const addressValidator = getAddressValidator(transport.validationAddress);

    for (const address of addresses) {
      if (!addressValidator(address)) {
        throw new Error(`Address: ${address} validation failed.`);
      }
    }
  }

  /**
   * Validate WhatsApp-specific template requirements
   */
  private validateWhatsAppTemplate(
    transport: Transport,
    message: ContentMessageDto,
  ): void {
    const meta = (transport.config as any)?.meta;
    const hasTemplateCapability = meta?.capabilities?.includes(
      'TEMPLATE_VERIFICATION',
    );

    if (hasTemplateCapability && meta?.provider === 'twilio') {
      if (!message.content) {
        throw new BadRequestException(
          'Template ID (ContentSid) is required in message.content for Twilio WhatsApp. ' +
            'Please provide a valid template external ID from your Twilio Content API.',
        );
      }

      // Check if meta contains components for parameterized templates
      if (message.meta?.components && !Array.isArray(message.meta.components)) {
        throw new BadRequestException(
          'message.meta.components must be an array for parameterized WhatsApp templates',
        );
      }
    }
  }
}
