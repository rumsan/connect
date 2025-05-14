import { formatResponse } from '@rumsan/sdk/utils';
import { AxiosInstance, AxiosRequestConfig } from 'axios';
import { Broadcast, BroadcastCount, BroadcastLog, Session } from '../types';
import { ApiClient } from './api.client';


export class SessionClient {
  private _client: AxiosInstance;
  private _prefix = 'sessions';
  constructor(private apiClient: ApiClient) {
    this._client = apiClient.client;
  }
  async get(cuid: string, config?: AxiosRequestConfig) {
    const response = await this._client.get(`${this._prefix}/${cuid}`, config);
    return formatResponse<Session>(response);
  }

  async list(config?: AxiosRequestConfig) {
    const response = await this._client.get(`${this._prefix}`, config);
    return formatResponse<Session[]>(response);
  }

  async listBroadcasts(cuid: string, config?: AxiosRequestConfig) {
    const response = await this._client.get(
      `${this._prefix}/${cuid}/broadcasts`,
      config
    );
    return formatResponse<Broadcast[]>(response);
  }

  async listLogs(cuid: string, config?: AxiosRequestConfig) {
    const response = await this._client.get(
      `${this._prefix}/${cuid}/logs`,
      config
    );
    return formatResponse<BroadcastLog[]>(response);
  }

  async broadcastCount(
    data: { sessions: string[] },
    config?: AxiosRequestConfig
  ) {
    const response = await this._client.post(
      `${this._prefix}/broadcast-counts`,
      data,
      config
    );
    return formatResponse<BroadcastCount>(response);
  }
}
