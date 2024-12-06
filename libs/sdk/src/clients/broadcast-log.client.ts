import { formatResponse } from '@rumsan/sdk/utils';
import { AxiosInstance, AxiosRequestConfig } from 'axios';
import { BroadcastLog } from '../types';
import { PaginationTypes } from '../types/pagination.type';
import { ApiClient } from './api.client';

export class BroadcastLogClient {
  private _client: AxiosInstance;
  private _prefix = 'logs';
  constructor(private apiClient: ApiClient) {
    this._client = apiClient.client;
  }
  async list(payload?: PaginationTypes, config?: AxiosRequestConfig) {
    const response = await this._client.get(`${this._prefix}`, {
      params: payload,
      ...config,
    });
    return formatResponse<BroadcastLog[]>(response);
  }
}
