import { Inject, Injectable } from '@nestjs/common';

import { Message, TransportApiConfig } from '@rumsan/connect/types';
import { ApiTransport } from './api.transport';

@Injectable()
export class ApiService extends ApiTransport {
  constructor(
    @Inject('API_CONFIG') private readonly options: TransportApiConfig,
  ) {
    super();
  }

  sendMessage(address: string, message: Message) {
    return this.send(this.options, address, message);
  }

  sendBulkMessage(addresses: string[], message: Message) {
    return this.sendBulk(this.options, addresses, message);
  }

  normalizeOutcome(details: Record<string, any>) {
    return this.normalizeSendOutcome(this.options, details);
  }
}
