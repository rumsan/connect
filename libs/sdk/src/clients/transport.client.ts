import { formatResponse } from '@rumsan/sdk/utils';
import { AxiosInstance, AxiosRequestConfig } from 'axios';
import {
  Optional,
  Transport,
  TransportApiConfig,
  TransportConfig,
  TransportEchoConfig,
  TransportType,
} from '../types';
import { ApiClient } from './api.client';

export class TransportClient {
  private _client: AxiosInstance;
  private _prefix = 'transports';
  constructor(private apiClient: ApiClient) {
    this._client = apiClient.client;
  }
  async get(cuid: string, config?: AxiosRequestConfig) {
    const response = await this._client.get(`${this._prefix}/${cuid}`, config);
    return formatResponse<Transport>(response);
  }

  async list(config?: AxiosRequestConfig) {
    const response = await this._client.get(`${this._prefix}`, config);
    return formatResponse<Transport[]>(response);
  }

  async update(
    cuid: string,
    data: { name: string; config: Record<string, any> },
    config?: AxiosRequestConfig
  ) {
    const response = await this._client.patch(
      `${this._prefix}/${cuid}`,
      data,
      config
    );
    return formatResponse<Transport>(response);
  }

  async delete(cuid: string, config?: AxiosRequestConfig) {
    const response = await this._client.delete(
      `${this._prefix}/${cuid}`,
      config
    );
    return formatResponse<Transport>(response);
  }

  async create(data: Transport, config?: AxiosRequestConfig) {
    const response = await this._client.post(`${this._prefix}`, data, config);
    return formatResponse<Transport>(response);
  }

  async createApi(
    data: Omit<TransportConfig<TransportApiConfig>, 'type'>,
    config?: AxiosRequestConfig
  ) {
    const payload: Transport = { ...data, type: TransportType.API };
    return this.create(payload, config);
  }

  async createEcho(
    data: Omit<TransportConfig<TransportEchoConfig>, 'type'>,
    config?: AxiosRequestConfig
  ) {
    const payload: Transport = { ...data, type: TransportType.ECHO };
    return this.create(payload, config);
  }

  async createSMTP(
    data: Omit<TransportConfig<TransportEchoConfig>, 'type'>,
    config?: AxiosRequestConfig
  ) {
    const payload: Transport = { ...data, type: TransportType.SMTP };
    return this.create(payload, config);
  }
}
