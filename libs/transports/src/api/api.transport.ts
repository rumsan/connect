import { Injectable } from '@nestjs/common';

import { Logger } from '@nestjs/common';
import {
  BroadcastStatus,
  mapTwilioMessageStatusToBroadcastStatus,
  Message,
  normalizeTwilioMessageStatus,
  TransportApiConfig,
} from '@rumsan/connect/types';
import axios, { AxiosInstance } from 'axios';
import {
  extractBulkDataTemplate,
  replaceBulkData,
  replacePlaceholders,
} from '../utils';

type ApiSendOutcome = {
  status: BroadcastStatus;
  details: Record<string, any>;
};

@Injectable()
export class ApiTransport {
  private readonly logger = new Logger(ApiTransport.name);

  private createClient(config: TransportApiConfig): AxiosInstance {
    return axios.create({
      method: config.method || 'POST',
      timeout: config.timeout || 10000,
    });
  }

  private formatAddress(config: TransportApiConfig, address: string): string {
    let formatted = config?.meta?.stripNonNumeric
      ? address.replace(/\D/g, '')
      : address.replace(/\s+/g, '');
    if (config?.meta?.addressPrefix) {
      formatted = `${config.meta.addressPrefix}${formatted}`;
    }
    return formatted;
  }

  async send(config: TransportApiConfig, address: string, message: Message) {
    address = this.formatAddress(config, address);
    this.logger.debug(
      `Sending message to ${address}: ${JSON.stringify(message)}`,
    );
    let requestData = {
      url: config.url,
      data: config.body,
      headers: config.headers,
    };

    requestData = replacePlaceholders(requestData, { address, message });
    this.logger.debug(
      `Request data after placeholder replacement: ${JSON.stringify(
        requestData,
      )}`,
    );
    this.logger.debug(
      `Making API request to ${requestData.url} with data: ${JSON.stringify(
        requestData.data,
      )}`,
    );
    const res = await this.createClient(config).request(requestData);
    this.logger.debug(
      `Message sent to ${address}: ${JSON.stringify(res.data)}`,
    );
    return res.data;
  }

  async sendBulk(
    config: TransportApiConfig,
    addresses: string[],
    message: Message,
  ) {
    this.logger.debug(
      `Sending bulk message to ${addresses.length} addresses: ${JSON.stringify(
        message,
      )}`,
    );
    const requestData = {
      url: config.url,
      data: config.body,
      headers: config.headers,
    };
    this.logger.debug(
      `Bulk request data before placeholder replacement: ${JSON.stringify(
        requestData,
      )}`,
    );
    const bulkDataTpl = extractBulkDataTemplate(config);

    const msgContent = addresses.map((rawAddress) => {
      const address = this.formatAddress(config, rawAddress);
      message = replacePlaceholders(message, { address });
      return replacePlaceholders(bulkDataTpl, {
        message: message,
        address: address,
      });
    });
    requestData.data = replaceBulkData(requestData.data, msgContent);

    const res = await this.createClient(config).request(requestData);
    this.logger.debug(
      `Bulk message sent to ${addresses.length} addresses: ${JSON.stringify(
        res.data,
      )}`,
    );
    return res.data;
  }

  normalizeSendOutcome(
    config: TransportApiConfig,
    details: Record<string, any>,
  ): ApiSendOutcome {
    if (this.isPlasgateProvider(config)) {
      return this.normalizePlasgateOutcome(details);
    }

    if (this.isAdnSmsProvider(config)) {
      return this.normalizeAdnSmsOutcome(details);
    }

    if (!this.isTwilioProvider(config)) {
      return {
        status: BroadcastStatus.SUCCESS,
        details,
      };
    }

    const providerStatus = normalizeTwilioMessageStatus(details?.['status']);

    return {
      status: providerStatus
        ? mapTwilioMessageStatusToBroadcastStatus(providerStatus)
        : BroadcastStatus.PENDING,
      details: {
        ...details,
        provider: 'twilio',
        providerStatus:
          providerStatus ?? details?.['providerStatus'] ?? details?.['status'],
        providerMessageSid:
          details?.['sid'] ??
          details?.['messageSid'] ??
          details?.['MessageSid'] ??
          details?.['SmsSid'],
      },
    };
  }

  private isTwilioProvider(config: TransportApiConfig): boolean {
    return config?.['meta']?.provider === 'twilio';
  }

  private isPlasgateProvider(config: TransportApiConfig): boolean {
    return config?.['meta']?.provider === 'plasgate';
  }

  private isAdnSmsProvider(config: TransportApiConfig): boolean {
    return config?.['meta']?.provider === 'adnsms';
  }

  private normalizeAdnSmsOutcome(details: Record<string, any>): ApiSendOutcome {
    const code = Number(details?.['api_response_code']);
    const invalidNumbers = Array.isArray(details?.['invalid_numbers'])
      ? details['invalid_numbers']
      : [];

    if (code !== 200 || invalidNumbers.length > 0) {
      return {
        status: BroadcastStatus.FAIL,
        details: {
          ...details,
          provider: 'adnsms',
          error:
            details?.['error']?.['error_message'] ??
            (invalidNumbers.length > 0 ? 'INVALID_NUMBER' : undefined) ??
            details?.['api_response_message'],
        },
      };
    }

    return {
      status: BroadcastStatus.PENDING,
      details: {
        ...details,
        provider: 'adnsms',
        providerMessageSid: details?.['sms_uid'] ?? null,
        campaignUid: details?.['campaign_uid'] ?? null,
      },
    };
  }

  private normalizePlasgateOutcome(
    details: Record<string, any>,
  ): ApiSendOutcome {
    const queueId =
      details?.['queue_id'] ?? details?.['queueId'] ?? details?.['id'] ?? null;

    return {
      status: BroadcastStatus.PENDING,
      details: {
        ...details,
        provider: 'plasgate',
        providerMessageSid: queueId,
      },
    };
  }
}
