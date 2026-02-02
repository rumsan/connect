import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';

/**
 * HTTP client abstraction for template providers
 * Allows for easier testing and configuration management
 */
@Injectable()
export class TemplateHttpClientService {
  private readonly logger = new Logger(TemplateHttpClientService.name);

  /**
   * Create an axios instance with configuration
   */
  createClient(config?: {
    baseURL?: string;
    timeout?: number;
    headers?: Record<string, string>;
    auth?: {
      username: string;
      password: string;
    };
  }): AxiosInstance {
    const client = axios.create({
      baseURL: config?.baseURL,
      timeout: config?.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        ...config?.headers,
      },
      auth: config?.auth,
    });

    // Add request interceptor for logging
    client.interceptors.request.use(
      (config) => {
        this.logger.debug(`Making ${config.method?.toUpperCase()} request to ${config.url}`);
        return config;
      },
      (error) => {
        this.logger.error('Request error', error);
        return Promise.reject(error);
      },
    );

    // Add response interceptor for error handling
    client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        this.logger.error(
          `API Error: ${error.response?.status} ${error.response?.statusText}`,
          error.response?.data,
        );
        return Promise.reject(error);
      },
    );

    return client;
  }

  /**
   * Execute a GET request
   */
  async get<T = any>(
    client: AxiosInstance,
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await client.get<T>(url, config);
    return response.data;
  }

  /**
   * Execute a POST request
   */
  async post<T = any>(
    client: AxiosInstance,
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await client.post<T>(url, data, config);
    return response.data;
  }

  /**
   * Execute a PUT request
   */
  async put<T = any>(
    client: AxiosInstance,
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await client.put<T>(url, data, config);
    return response.data;
  }

  /**
   * Execute a DELETE request
   */
  async delete<T = any>(
    client: AxiosInstance,
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await client.delete<T>(url, config);
    return response.data;
  }
}
