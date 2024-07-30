import { Injectable } from '@nestjs/common';

import { IService, Message, TransportApiConfig } from '@rsconnect/sdk/types';
import axios, { AxiosInstance } from 'axios';
import { url } from 'inspector';

export function replacePlaceholders(templateJson: any, data: any): any {
  // Helper function to recursively replace placeholders
  function recursiveReplace(obj: any, data: any): any {
    if (typeof obj === 'string') {
      return obj.replace(/{%(.*?)%}/g, (_, key) => {
        const keys = key.split('.');
        let value = data;
        keys.forEach((k: any) => {
          value = value ? value[k] : '';
        });
        return value || '';
      });
    } else if (Array.isArray(obj)) {
      return obj.map((item) => recursiveReplace(item, data));
    } else if (typeof obj === 'object') {
      const newObj: { [key: string]: any } = {};
      for (const key in obj) {
        newObj[key] = recursiveReplace(obj[key], data);
      }
      return newObj;
    }
    return obj;
  }

  return recursiveReplace(templateJson, data);
}

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
}
