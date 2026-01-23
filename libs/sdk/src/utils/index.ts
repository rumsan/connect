import { AxiosResponse } from 'axios';

export function getEnvValue<T>(key: string, defaultValue?: T): T {
  // Ensure the key exists in process.env or use default value if provided.
  if (!process.env[key] && !defaultValue) {
    throw new Error(`Environment variable ${key} is missing`);
  }
  return process.env[key] as T;
}

/**
 * Format axios response to extract data
 * Handles both direct data responses and nested data structures
 */
export function formatResponse<T>(response: AxiosResponse<T>): T {
  // If response.data exists and has a data property, return that
  // Otherwise return response.data directly
  if (response.data && typeof response.data === 'object' && 'data' in response.data) {
    return (response.data as any).data;
  }
  return response.data;
}
