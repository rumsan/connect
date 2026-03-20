import { Injectable } from '@nestjs/common';

import { Logger } from '@nestjs/common';
import {
  BroadcastStatus,
  IService,
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
export class ApiTransport implements IService {
  private readonly logger = new Logger(ApiTransport.name);
  private transport: AxiosInstance;
  private config: TransportApiConfig;

  init(config: TransportApiConfig): void {
    this.logger.debug(
      'Initializing API Transport with config: ' + JSON.stringify(config),
    );
    this.config = config;
    this.transport = axios.create({
      method: config.method || 'POST',
      timeout: config.timeout || 10000,
    });
  }

  async send(address: string, message: Message) {
    this.logger.debug(
      `Sending message to ${address}: ${JSON.stringify(message)}`,
    );
    let requestData = {
      url: this.config.url,
      data: this.config.body,
      headers: this.config.headers,
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
    const res = await this.transport.request(requestData);
    this.logger.debug(
      `Message sent to ${address}: ${JSON.stringify(res.data)}`,
    );
    return res.data;
  }

  async sendBulk(addresses: string[], message: Message) {
    this.logger.debug(
      `Sending bulk message to ${addresses.length} addresses: ${JSON.stringify(
        message,
      )}`,
    );
    const requestData = {
      url: this.config.url,
      data: this.config.body,
      headers: this.config.headers,
    };
    this.logger.debug(
      `Bulk request data before placeholder replacement: ${JSON.stringify(
        requestData,
      )}`,
    );
    const bulkDataTpl = extractBulkDataTemplate(this.config);

    const msgContent = addresses.map((address) => {
      message = replacePlaceholders(message, { address });
      return replacePlaceholders(bulkDataTpl, {
        message: message,
        address: address,
      });
    });
    requestData.data = replaceBulkData(requestData.data, msgContent);

    const res = await this.transport.request(requestData);
    this.logger.debug(
      `Bulk message sent to ${addresses.length} addresses: ${JSON.stringify(
        res.data,
      )}`,
    );
    return res.data;
  }

  normalizeSendOutcome(details: Record<string, any>): ApiSendOutcome {
    if (!this.isTwilioProvider()) {
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

  private isTwilioProvider(): boolean {
    return this.config?.['meta']?.provider === 'twilio';
  }
}
