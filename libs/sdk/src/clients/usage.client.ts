import { formatResponse } from '@rumsan/sdk/utils';
import { AxiosInstance, AxiosRequestConfig } from 'axios';
import { CreditsEntry, UsageResponse } from '../types';
import { ApiClient } from './api.client';

export class UsageClient {
  private _client: AxiosInstance;
  private _prefix = 'usage';
  constructor(private apiClient: ApiClient) {
    this._client = apiClient.client;
  }

  async getUsage(
    appId: string,
    params?: { from?: string; to?: string },
    config?: AxiosRequestConfig,
  ) {
    const response = await this._client.get(`${this._prefix}/${appId}`, {
      params,
      ...config,
    });
    return formatResponse<UsageResponse>(response);
  }

  async getUsageByXref(
    appId: string,
    xref: string,
    params?: { from?: string; to?: string },
    config?: AxiosRequestConfig,
  ) {
    const response = await this._client.get(
      `${this._prefix}/${appId}/xref/${xref}`,
      { params, ...config },
    );
    return formatResponse<UsageResponse>(response);
  }

  async getCredits(
    appId: string,
    params?: { from?: string; to?: string },
    config?: AxiosRequestConfig,
  ) {
    const response = await this._client.get(
      `${this._prefix}/${appId}/credits`,
      { params, ...config },
    );
    return formatResponse<CreditsEntry[]>(response);
  }

  async getCreditsByXref(
    appId: string,
    xref: string,
    params?: { from?: string; to?: string },
    config?: AxiosRequestConfig,
  ) {
    const response = await this._client.get(
      `${this._prefix}/${appId}/xref/${xref}/credits`,
      { params, ...config },
    );
    return formatResponse<CreditsEntry[]>(response);
  }
}
