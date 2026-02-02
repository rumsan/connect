import { Injectable, NotFoundException } from '@nestjs/common';
import { Template, TemplateStatus, Transport } from '@prisma/client';
import { PrismaService } from '@rumsan/prisma';
import { TemplateCapability } from '../enums/template-capability.enum';
import { ConfigMeta } from '../interfaces/template-provider.interface';

export interface TemplateVerificationResult {
  isValid: boolean;
  errors: string[];
  template?: Template;
  requiresVerification: boolean;
}

export interface TemplateParameter {
  type: string;
  text?: string;
  [key: string]: any;
}

@Injectable()
export class TemplateVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get capabilities from transport config.meta
   */
  getCapabilities(transport: Transport): TemplateCapability[] {
    const meta = (transport.config as any)?.meta as ConfigMeta | undefined;
    const caps = meta?.capabilities ?? [];
    return Array.isArray(caps) ? caps as TemplateCapability[] : [];
  }

  /**
   * Check if transport requires template verification
   */
  requiresTemplateVerification(transport: Transport): boolean {
    const capabilities = this.getCapabilities(transport);
    return capabilities.includes(TemplateCapability.TEMPLATE_VERIFICATION);
  }

  /**
   * Verify template before processing broadcast
   * This is called when sending messages to validate template exists and is approved
   */
  async verifyTemplate(
    transportId: string,
    templateExternalId: string,
    parameters?: TemplateParameter[],
  ): Promise<TemplateVerificationResult> {
    const errors: string[] = [];

    // 1. Look up the transport
    const transport = await this.prisma.transport.findUnique({
      where: { cuid: transportId },
    });

    if (!transport) {
      throw new NotFoundException(`Transport with ID ${transportId} not found`);
    }

    // 2. Check if validation needed
    const requiresVerification = this.requiresTemplateVerification(transport);

    if (!requiresVerification) {
      // Transport doesn't require template verification
      return {
        isValid: true,
        errors: [],
        requiresVerification: false,
      };
    }

    // 3. Look up the template
    const template = await this.prisma.template.findFirst({
      where: {
        transportId: transport.cuid,
        externalId: templateExternalId,
      },
    });

    if (!template) {
      errors.push(
        `Template '${templateExternalId}' not found for transport ${transportId}`,
      );
      return {
        isValid: false,
        errors,
        requiresVerification: true,
      };
    }

    // 4. Check template status
    if (template.status !== TemplateStatus.APPROVED) {
      errors.push(
        `Template '${templateExternalId}' is not approved. Current status: ${template.status}`,
      );
    }

    if (!template.isActive) {
      errors.push(`Template '${templateExternalId}' is not active`);
    }

    // 5. Validate parameters if provided
    if (parameters !== undefined && template) {
      const paramValidation = this.validateParameters(template, parameters);
      if (!paramValidation.isValid) {
        errors.push(...paramValidation.errors);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      template: template || undefined,
      requiresVerification: true,
    };
  }

  /**
   * Validate template parameters
   */
  private validateParameters(
    template: Template,
    providedParameters: TemplateParameter[],
  ): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Note: Parameter structure would need to be stored in template
    // For now, this is a basic validation - you may need to extend the Template model
    // to store expected parameter definitions (count, types, etc.)

    // Basic validation: check if template expects parameters but none provided
    // This would need to be extended based on your parameter storage structure

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if transport supports a specific capability
   */
  hasCapability(transport: Transport, capability: TemplateCapability): boolean {
    const capabilities = this.getCapabilities(transport);
    return capabilities.includes(capability);
  }
}
