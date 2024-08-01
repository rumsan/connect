import { formatResponse } from '@rumsan/sdk/utils';
import { AxiosInstance, AxiosRequestConfig } from 'axios';
import { Broadcast } from '../types';
import { ApiClient } from './api.client';

export class BroadcastClient {
  private _client: AxiosInstance;
  private _prefix = 'broadcasts';
  constructor(private apiClient: ApiClient) {
    this._client = apiClient.client;
  }
  async get(cuid: string, config?: AxiosRequestConfig) {
    const response = await this._client.get(`${this._prefix}/${cuid}`, config);
    return formatResponse<Broadcast>(response);
  }

  async list(config?: AxiosRequestConfig) {
    const response = await this._client.get(`${this._prefix}`, config);
    return formatResponse<Broadcast[]>(response);
  }
}
