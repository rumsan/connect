import { formatResponse } from '@rumsan/sdk/utils';
import { AxiosInstance, AxiosRequestConfig } from 'axios';
import {
  CreateTemplate,
  ListTemplate,
  Template,
  UpdateTemplate,
} from '../types';
import { ApiClient } from './api.client';

export class TemplateClient {
  private _client: AxiosInstance;
  private _prefix = 'template';
  constructor(private apiClient: ApiClient) {
    this._client = apiClient.client;
  }

  /**
   * Get a template by CUID
   */
  async get(cuid: string, config?: AxiosRequestConfig) {
    const response = await this._client.get(`${this._prefix}/${cuid}`, config);
    return formatResponse<Template>(response);
  }

  /**
   * List templates with optional filters
   */
  async list(payload?: ListTemplate, config?: AxiosRequestConfig) {
    const response = await this._client.get(`${this._prefix}`, {
      params: {
        ...payload,
      },
      ...config,
    });
    return formatResponse<Template[]>(response);
  }

  /**
   * Create a new template
   */
  async create(data: CreateTemplate, config?: AxiosRequestConfig) {
    const response = await this._client.post(`${this._prefix}`, data, config);
    return formatResponse<Template>(response);
  }
  /**
   * Sync template
   */
  async sync(transportId: string, config?: AxiosRequestConfig) {
    const response = await this._client.post(
      `${this._prefix}/${transportId}/sync`,
      null,
      config,
    );
    return formatResponse(response);
  }

  /**
   * Update a template
   */
  async update(
    cuid: string,
    data: UpdateTemplate,
    config?: AxiosRequestConfig,
  ) {
    const response = await this._client.patch(
      `${this._prefix}/${cuid}`,
      data,
      config,
    );
    return formatResponse<Template>(response);
  }

  /**
   * Soft delete a template (deactivate)
   */
  async remove(cuid: string, config?: AxiosRequestConfig) {
    const response = await this._client.delete(
      `${this._prefix}/${cuid}`,
      config,
    );
    return formatResponse<Template>(response);
  }

  /**
   * Hard delete a template (remove from DB and provider)
   */
  async delete(cuid: string, config?: AxiosRequestConfig) {
    const response = await this._client.delete(
      `${this._prefix}/${cuid}/force`,
      config,
    );
    return formatResponse<Template>(response);
  }
}
