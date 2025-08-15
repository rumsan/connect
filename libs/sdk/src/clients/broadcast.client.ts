import { formatResponse } from '@rumsan/sdk/utils';
import { AxiosInstance, AxiosRequestConfig } from 'axios';
import {
  Broadcast,
  BroadcastCountsResponse,
  BrodcastReportFilter,
  ListBroadcast,
  MessageBroadcast,
} from '../types';
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

  async list(payload?: ListBroadcast, config?: AxiosRequestConfig) {
    const response = await this._client.get(`${this._prefix}`, {
      params: payload,
      ...config,
    });
    return formatResponse<Broadcast[]>(response);
  }

  async listSelected(broadcastIds: string[], config?: AxiosRequestConfig) {
    const response = await this._client.post(
      `${this._prefix}/list-selected`,
      broadcastIds,
      config,
    );
    return formatResponse<Broadcast[]>(response);
  }

  async create(data: MessageBroadcast, config?: AxiosRequestConfig) {
    const response = await this._client.post(`${this._prefix}`, data, config);
    return formatResponse<Broadcast>(response);
  }

  async getStatusCount(config?: AxiosRequestConfig) {
    const response = await this._client.get(
      `${this._prefix}/status-count`,
      config,
    );
    return formatResponse<BroadcastCountsResponse>(response);
  }

  async getReport(
    data: BrodcastReportFilter,
    config?: AxiosRequestConfig,
  ) {
    let response;
    if (data.xref) {
      response = await this._client.get(
        `${this._prefix}/${data.xref}/reports`,
        config,
      );
    }
    else {
      response = await this._client.get(`${this._prefix}/reports`, config);
    }

    return formatResponse<BroadcastCountsResponse>(response);
  }
}
