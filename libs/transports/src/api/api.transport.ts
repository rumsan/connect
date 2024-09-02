import { Injectable } from '@nestjs/common';

import { IService, Message, TransportApiConfig } from '@rumsan/connect/types';
import axios, { AxiosInstance } from 'axios';
import {
  extractBulkDataTemplate,
  replaceBulkData,
  replacePlaceholders,
} from '../utils';

@Injectable()
export class ApiTransport implements IService {
  private transport: AxiosInstance;
  private config: TransportApiConfig;

  init(config: TransportApiConfig): void {
    this.config = config;
    this.transport = axios.create({
      method: config.method || 'POST',
      timeout: config.timeout || 10000,
    });
  }

  async send(address: string, message: Message) {
    let requestData = {
      url: this.config.url,
      data: this.config.body,
      headers: this.config.headers,
    };

    requestData = replacePlaceholders(requestData, { address, message });
    const res = await this.transport.request(requestData);
    return res.data;
  }

  async sendBulk(addresses: string[], message: Message) {
    const requestData = {
      url: this.config.url,
      data: this.config.body,
      headers: this.config.headers,
    };

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
    return res.data;
  }
}
