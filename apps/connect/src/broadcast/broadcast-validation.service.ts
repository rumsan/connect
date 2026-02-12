import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Transport } from '@prisma/client';
import { TemplateVerificationService } from '@rsconnect/templates';
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
   * Main validation method that routes to appropriate validators
   */
  async validateBroadcastData(
    transportId: string,
    message: ContentMessageDto | TemplateMessageDto,
    addresses: string[],
  ) {
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
      await this.validateContentMessage(transportId, message, t);
    } else {
      await this.validateTemplateMessage(transportId, message, t);
    }

    return true;
  }

  /**
   * Validate content-based messages
   */
  private async validateContentMessage(
    transportId: string,
    message: ContentMessageDto,
    transport: Transport,
  ) {
    const contentValidator = getContentValidator(transport.validationContent);

    if (!contentValidator(message.content)) {
      throw new Error(`Content: ${message.content} validation failed.`);
    }

    // WhatsApp template validation for content messages
    this.validateWhatsAppTemplate(transport, message);
  }

  /**
   * Validate template-based messages
   */
  private async validateTemplateMessage(
    transportId: string,
    message: TemplateMessageDto,
    transport: Transport,
  ) {
    const requiresTemplateVerification =
      this.templateVerificationService.requiresTemplateVerification(
        transport as any,
      );

    if (!requiresTemplateVerification) {
      // If template verification not required, just validate template ID exists
      if (!message.templateId) {
        throw new BadRequestException('templateId is required in message');
      }
      return;
    }

    // Template verification is required
    if (!message.templateId) {
      throw new BadRequestException(
        'templateId is required in message.templateId for this transport',
      );
    }

    const parameters = message?.meta?.components?.[0]?.parameters;
    const verification =
      await this.templateVerificationService.verifyTemplate(
        transportId,
        message.templateId,
        parameters,
      );

    if (!verification.isValid) {
      throw new BadRequestException(verification.errors.join(', '));
    }
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
