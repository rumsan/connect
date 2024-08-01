import { formatResponse } from '@rumsan/sdk/utils';
import { AxiosInstance, AxiosRequestConfig } from 'axios';
import { Session } from '../types';
import { ApiClient } from './api.client';

export class BroadcastLogClient {
  private _client: AxiosInstance;
  private _prefix = 'logs';
  constructor(private apiClient: ApiClient) {
    this._client = apiClient.client;
  }
  async list(config?: AxiosRequestConfig) {
    const response = await this._client.get(`${this._prefix}`, config);
    return formatResponse<Session>(response);
  }
}
