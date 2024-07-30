import { Inject, Injectable } from '@nestjs/common';

import { TransportApiConfig } from '@rsconnect/sdk/types';
import { ApiTransport } from './api.transport';

@Injectable()
export class ApiService extends ApiTransport {
  constructor(
    @Inject('API_CONFIG') private readonly options: TransportApiConfig
  ) {
    super();
    this.init(this.options);
  }
}
