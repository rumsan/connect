import { Injectable, Logger } from '@nestjs/common';
import { TemplateStatus, TemplateType } from '@prisma/client';
import { PrismaService } from '@rumsan/prisma';
import { BaseTemplateProvider } from '../base/base-template.provider';
import { ProviderTemplate } from '../interfaces/template-provider.interface';

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

@Injectable()
export class TemplateSyncService {
  private readonly logger = new Logger(TemplateSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sync templates from provider to database
   * Maps provider templates to database templates based on externalId
   */
  async syncTemplates(
    transportId: string,
    provider: BaseTemplateProvider,
  ): Promise<SyncResult> {
    const result: SyncResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    try {
      // Get transport to find app
      const transport = await this.prisma.transport.findUnique({
        where: { cuid: transportId },
      });

      if (!transport) {
        throw new Error(`Transport ${transportId} not found`);
      }

      // Fetch all templates from provider
      this.logger.log(
        `Fetching templates from provider: ${provider.getProviderName()}`,
      );
      const providerTemplates = await provider.fetchAllTemplates();

      this.logger.log(
        `Found ${providerTemplates.length} templates from provider`,
      );

      // Get existing templates for this transport
      const existingTemplates = await this.prisma.template.findMany({
        where: { transportId },
      });

      const existingMap = new Map(
        existingTemplates.map((t) => [t.externalId, t]),
      );

      // Process each provider template
      for (const providerTemplate of providerTemplates) {
        try {
          const existing = existingMap.get(providerTemplate.externalId);

          if (existing) {
            // Update existing template
            await this.updateTemplate(existing.cuid, providerTemplate);
            result.updated++;
            this.logger.debug(
              `Updated template: ${existing.name} (${existing.cuid})`,
            );
          } else {
            // Create new template
            await this.createTemplate(
              transport.app,
              transportId,
              providerTemplate,
            );
            result.created++;
            this.logger.debug(
              `Created template: ${providerTemplate.name} (${providerTemplate.externalId})`,
            );
          }
        } catch (error: any) {
          const errorMsg = `Failed to sync template ${providerTemplate.externalId}: ${error.message}`;
          this.logger.error(errorMsg, error);
          result.errors.push(errorMsg);
          result.skipped++;
        }
      }

      this.logger.log(
        `Sync completed: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`,
      );

      return result;
    } catch (error: any) {
      const errorMsg = `Sync failed: ${error.message}`;
      this.logger.error(errorMsg, error);
      result.errors.push(errorMsg);
      throw error;
    }
  }

  /**
   * Sync a single template by externalId
   */
  async syncSingleTemplate(
    transportId: string,
    externalId: string,
    provider: BaseTemplateProvider,
  ): Promise<void> {
    try {
      // Get template from provider (would need a getById method)
      // For now, fetch all and find the one we need
      const providerTemplates = await provider.fetchAllTemplates();
      const providerTemplate = providerTemplates.find(
        (t) => t.externalId === externalId,
      );

      if (!providerTemplate) {
        throw new Error(`Template ${externalId} not found in provider`);
      }

      // Find existing template
      const existing = await this.prisma.template.findFirst({
        where: {
          transportId,
          externalId,
        },
      });

      if (existing) {
        await this.updateTemplate(existing.cuid, providerTemplate);
      } else {
        const transport = await this.prisma.transport.findUnique({
          where: { cuid: transportId },
        });

        if (!transport) {
          throw new Error(`Transport ${transportId} not found`);
        }

        await this.createTemplate(
          transport.app,
          transportId,
          providerTemplate,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to sync single template ${externalId}: ${error.message}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Create a new template in database from provider template
   */
  private async createTemplate(
    app: string,
    transportId: string,
    providerTemplate: ProviderTemplate,
  ): Promise<void> {
    await this.prisma.template.create({
      data: {
        app,
        transportId,
        name: providerTemplate.name,
        externalId: providerTemplate.externalId,
        status: this.mapProviderStatus(providerTemplate.status),
        type: providerTemplate.type === 'MEDIA' ? TemplateType.MEDIA : TemplateType.TEXT,
        language: providerTemplate.language || 'en',
        body: providerTemplate.body,
        isActive: true,
      },
    });
  }

  /**
   * Update existing template from provider template
   */
  private async updateTemplate(
    cuid: string,
    providerTemplate: ProviderTemplate,
  ): Promise<void> {
    await this.prisma.template.update({
      where: { cuid },
      data: {
        name: providerTemplate.name,
        status: this.mapProviderStatus(providerTemplate.status),
        type: providerTemplate.type === 'MEDIA' ? TemplateType.MEDIA : TemplateType.TEXT,
        language: providerTemplate.language || 'en',
        body: providerTemplate.body,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Map provider status to database status
   */
  private mapProviderStatus(
    providerStatus: 'PENDING' | 'APPROVED' | 'REJECTED',
  ): TemplateStatus {
    const statusMap: Record<
      'PENDING' | 'APPROVED' | 'REJECTED',
      TemplateStatus
    > = {
      PENDING: TemplateStatus.PENDING,
      APPROVED: TemplateStatus.APPROVED,
      REJECTED: TemplateStatus.REJECTED,
    };

    return statusMap[providerStatus] || TemplateStatus.PENDING;
  }
}
