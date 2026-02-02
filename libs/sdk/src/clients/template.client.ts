import { formatResponse } from '@rumsan/sdk/utils';
import { AxiosInstance, AxiosRequestConfig } from 'axios';
import {
  CreateTemplate,
  ListTemplate,
  Template,
  TemplateApprovalStatus,
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
  async list(
    appId: string,
    payload?: ListTemplate,
    config?: AxiosRequestConfig,
  ) {
    const response = await this._client.get(`${this._prefix}`, {
      params: {
        appId,
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

  /**
   * Get template approval status from provider
   * Note: This might need to be implemented in the backend API
   */
  async getApprovalStatus(
    cuid: string,
    config?: AxiosRequestConfig,
  ) {
    const response = await this._client.get<TemplateApprovalStatus>(
      `${this._prefix}/${cuid}/approval-status`,
      config,
    );
    return formatResponse<TemplateApprovalStatus>(response);
  }

  /**
   * Verify template for broadcast
   * Note: This might need to be implemented in the backend API
   */
  async verifyForBroadcast(
    transportId: string,
    templateName: string,
    parameters?: any[],
    config?: AxiosRequestConfig,
  ) {
    const response = await this._client.post(
      `${this._prefix}/verify`,
      {
        transportId,
        templateName,
        parameters,
      },
      config,
    );
    return formatResponse<{ isValid: boolean; errors: string[] }>(response);
  }
}
