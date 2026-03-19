import { Injectable } from '@nestjs/common';
import { TemplateType } from '@prisma/client';
import { BaseTemplateProvider } from '../base/base-template.provider';
import { TemplateProviderApiException } from '../exceptions/template-provider.exceptions';
import {
  CreateTemplateDto,
  ProviderTemplate,
  TemplateApprovalStatus,
  TemplateCreateResponse,
  TemplateProviderConfig,
} from '../interfaces/template-provider.interface';
import { TemplateHttpClientService } from '../utils/http-client.service';
import { ProviderConfigUtil } from '../utils/provider-config.util';

@Injectable()
export class TwilioWhatsAppTemplateProvider extends BaseTemplateProvider {
  private readonly baseUrl = 'https://content.twilio.com/v1';
  private readonly httpClient: any;
  private readonly supportedMediaExtensions = [
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.mp4',
    '.3gp',
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
  ];

  constructor(
    config: TemplateProviderConfig,
    private readonly httpClientService: TemplateHttpClientService,
  ) {
    super(config);
    ProviderConfigUtil.validateTwilioConfig(config);
    const credentials = ProviderConfigUtil.getTwilioCredentials(config);

    this.httpClient = this.httpClientService.createClient({
      baseURL: this.baseUrl,
      timeout: 30000,
      auth: credentials,
    });
  }

  async create(dto: CreateTemplateDto): Promise<TemplateCreateResponse> {
    try {
      let templateType: Record<string, any> = {
        'twilio/text': { body: dto.body },
      };

      if (dto.type === TemplateType.MEDIA) {
        if (!dto.media || dto.media.length === 0) {
          throw new Error('Media templates require media URLs');
        }

        this.validateMediaUrlsForApproval(dto.media);

        templateType = {
          'twilio/media': {
            body: dto.body,
            media: [...dto.media],
          },
        };
      }

      // Ensure variables have sample values for WhatsApp approval.
      // If body has placeholders ({{1}}, {{2}}) but no variables provided,
      // auto-generate sample values so approval doesn't fail.
      const variables =
        dto.variables && Object.keys(dto.variables).length > 0
          ? dto.variables
          : this.extractDefaultVariables(dto.body);

      const payload: Record<string, any> = {
        friendly_name: dto.name,
        language: dto.language ?? 'en',
        types: templateType,
      };

      if (Object.keys(variables).length > 0) {
        payload['variables'] = variables;
      }

      this.logger.log(`Creating Twilio template: ${dto.name}`);
      const response = await this.httpClientService.post(
        this.httpClient,
        '/Content',
        payload,
      );

      this.logger.log(`Template created successfully: ${response.sid}`);

      return {
        externalId: response.sid,
        providerResponse: response,
      };
    } catch (error: any) {
      const providerError = this.extractProviderErrorMessage(error);
      this.logger.error(`Failed to create template: ${providerError}`, error);
      throw new TemplateProviderApiException(
        'twilio',
        `Failed to create template: ${providerError}`,
        error.response?.status,
        error,
      );
    }
  }

  private validateMediaUrlsForApproval(mediaUrls: string[]): void {
    const invalidUrls: string[] = [];

    for (const mediaUrl of mediaUrls) {
      let pathname = '';
      try {
        const parsed = new URL(mediaUrl);
        pathname = parsed.pathname.toLowerCase();
      } catch {
        invalidUrls.push(mediaUrl);
        continue;
      }

      const hasSupportedExtension = this.supportedMediaExtensions.some((ext) =>
        pathname.endsWith(ext),
      );

      if (!hasSupportedExtension) {
        invalidUrls.push(mediaUrl);
      }
    }

    if (invalidUrls.length > 0) {
      throw new Error(
        `Media URL sample must be a public URL with a valid file extension for WhatsApp approval. Invalid URLs: ${invalidUrls.join(', ')}`,
      );
    }
  }

  private extractProviderErrorMessage(error: any): string {
    const data = error?.response?.data;

    if (!data) {
      return error?.message ?? 'Unknown provider error';
    }

    if (typeof data === 'string') {
      return `${error?.message ?? 'Provider error'} | ${data}`;
    }

    if (typeof data === 'object') {
      const details = data.message ?? data.detail ?? JSON.stringify(data);
      return `${error?.message ?? 'Provider error'} | ${details}`;
    }

    return error?.message ?? 'Unknown provider error';
  }

  /**
   * Extract variable placeholders from body and generate default sample values.
   * e.g. "Hello {{1}}, your code is {{2}}" → { "1": "sample_1", "2": "sample_2" }
   */
  private extractDefaultVariables(body: string): Record<string, string> {
    const variables: Record<string, string> = {};
    const regex = /\{\{(\d+)\}\}/g;
    let match;
    while ((match = regex.exec(body)) !== null) {
      variables[match[1]] = `sample_${match[1]}`;
    }
    return variables;
  }

  async requestApproval(externalId: string, name: string): Promise<void> {
    try {
      const url = `/Content/${externalId}/ApprovalRequests/whatsapp`;
      const payload = {
        name: name.toLowerCase().replace(/\s+/g, '_'),
        category: 'UTILITY',
      };

      this.logger.log(`Requesting approval for template: ${externalId}`);
      await this.httpClientService.post(this.httpClient, url, payload);
      this.logger.log(`Approval requested successfully for: ${externalId}`);
    } catch (error: any) {
      const providerError = this.extractProviderErrorMessage(error);
      this.logger.error(`Failed to request approval: ${providerError}`, error);
      throw new TemplateProviderApiException(
        'twilio',
        `Failed to request approval: ${providerError}`,
        error.response?.status,
        error,
      );
    }
  }

  async getApprovalStatus(externalId: string): Promise<TemplateApprovalStatus> {
    try {
      const url = `/Content/${externalId}/ApprovalRequests`;
      const response = await this.httpClientService.get(this.httpClient, url);
      console.log('Approval status response:', response);
      // Parse Twilio approval status
      const latestRequest = response?.whatsapp;

      if (!latestRequest) {
        return {
          status: 'PENDING',
          providerData: response,
        };
      }

      const status = this.mapTwilioStatus(latestRequest.status);

      return {
        status,
        rejectionReason: latestRequest.rejection_reason,
        lastUpdated: latestRequest.date_updated
          ? new Date(latestRequest.date_updated)
          : undefined,
        providerData: response,
      };
    } catch (error: any) {
      const providerError = this.extractProviderErrorMessage(error);
      this.logger.error(
        `Failed to get approval status: ${providerError}`,
        error,
      );
      throw new TemplateProviderApiException(
        'twilio',
        `Failed to get approval status: ${providerError}`,
        error.response?.status,
        error,
      );
    }
  }

  /**
   * Delete a template from Twilio Content API
   * DELETE https://content.twilio.com/v1/Content/{ContentSid}
   */
  override async deleteTemplate(externalId: string): Promise<void> {
    try {
      const url = `/Content/${externalId}`;
      this.logger.log(`Deleting Twilio template: ${externalId}`);
      await this.httpClientService.delete(this.httpClient, url);
      this.logger.log(`Template deleted successfully: ${externalId}`);
    } catch (error: any) {
      const providerError = this.extractProviderErrorMessage(error);
      this.logger.error(
        `Failed to delete template ${externalId}: ${providerError}`,
        error,
      );
      throw new TemplateProviderApiException(
        'twilio',
        `Failed to delete template: ${providerError}`,
        error.response?.status,
        error,
      );
    }
  }

  /**
   * Fetch all templates from Twilio Content API
   */
  override async fetchAllTemplates(): Promise<ProviderTemplate[]> {
    try {
      this.logger.log('Fetching all templates from Twilio');
      const response = await this.httpClientService.get(
        this.httpClient,
        '/Content',
      );

      const contents = response.contents || [];
      const templates: ProviderTemplate[] = [];

      // Fetch approval status for each template
      for (const content of contents) {
        try {
          const template = this.mapProviderTemplate(content);

          // Fetch approval status
          try {
            const approvalStatus = await this.getApprovalStatus(
              template.externalId,
            );
            template.status = approvalStatus.status;
            template.lastUpdated = approvalStatus.lastUpdated;
          } catch (error: any) {
            // If approval status fetch fails, keep default status
            this.logger.warn(
              `Failed to fetch approval status for ${template.externalId}: ${error.message}`,
            );
          }

          templates.push(template);
        } catch (error: any) {
          this.logger.warn(
            `Failed to map template ${content.sid}: ${error.message}`,
          );
        }
      }

      return templates;
    } catch (error: any) {
      const providerError = this.extractProviderErrorMessage(error);
      this.logger.error(`Failed to fetch templates: ${providerError}`, error);
      throw new TemplateProviderApiException(
        'twilio',
        `Failed to fetch templates: ${providerError}`,
        error.response?.status,
        error,
      );
    }
  }

  /**
   * Map Twilio template data to our standard format
   */
  override mapProviderTemplate(providerData: any): ProviderTemplate {
    // Get approval status from the latest approval request
    const approvalRequests = providerData.links?.approval_requests || [];
    let status: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING';

    // Try to get status from types (if available)
    const types = providerData.types || {};
    const textType = types['twilio/text'];
    const mediaType = types['twilio/media'];

    // Extract body and media
    const body = textType?.body || mediaType?.body || '';
    const media = mediaType?.media || [];

    // Determine template type
    const type = media.length > 0 ? 'MEDIA' : 'TEXT';

    return {
      externalId: providerData.sid,
      name: providerData.friendly_name || providerData.sid,
      status,
      type,
      language: providerData.language || 'en',
      body,
      media,
      variables: providerData.variables || {},
      providerData,
      lastUpdated: providerData.date_updated
        ? new Date(providerData.date_updated)
        : undefined,
    };
  }

  /**
   * Map Twilio approval status to our standard status
   */
  private mapTwilioStatus(
    twilioStatus: string,
  ): 'PENDING' | 'APPROVED' | 'REJECTED' {
    const statusMap: Record<string, 'PENDING' | 'APPROVED' | 'REJECTED'> = {
      pending: 'PENDING',
      approved: 'APPROVED',
      rejected: 'REJECTED',
    };

    return statusMap[twilioStatus?.toLowerCase()] || 'PENDING';
  }
}
