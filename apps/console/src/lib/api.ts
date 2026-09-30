import { ApiEnvelope, PaginationMeta } from './types';

/**
 * Calls go to this app's own proxy route (`src/app/api/connect/[...path]`),
 * which forwards to CONNECT_API_URL. That keeps the upstream host server-side
 * and takes CORS out of the picture.
 */
const BASE = '/api/connect';

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

export type RequestOptions = {
  method?: string;
  query?: Record<string, unknown>;
  body?: unknown;
  /**
   * App to scope the request to, sent as `app-id`. Passed per call rather than
   * held on a shared client: this console is a super-admin view and reads
   * across apps, so no request may inherit another's scope.
   */
  appId?: string | null;
};

function buildUrl(path: string, query?: Record<string, unknown>) {
  const url = `${BASE}/${path.replace(/^\/+/, '')}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/** Nest's exception filter and success interceptor differ in shape; handle both. */
export function errorMessage(payload: unknown, fallback = 'Something went wrong') {
  if (payload instanceof Error) return payload.message;
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const message = record.message ?? record.error;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }
  return fallback;
}

async function request<T>(path: string, options: RequestOptions = {}) {
  const { method = 'GET', query, body, appId } = options;

  const headers: Record<string, string> = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (appId) headers['app-id'] = appId;

  const res = await fetch(buildUrl(path, query), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    throw new ApiError(
      res.status,
      errorMessage(payload, `Request failed with status ${res.status}`),
      payload,
    );
  }

  return (payload ?? { success: true, data: null }) as ApiEnvelope<T>;
}

/** Unwraps the `{ success, data }` envelope for single-value endpoints. */
export async function apiGet<T>(path: string, options: RequestOptions = {}) {
  const res = await request<T>(path, { ...options, method: 'GET' });
  return res.data;
}

export async function apiSend<T>(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  options: RequestOptions = {},
) {
  const res = await request<T>(path, { ...options, method });
  return res.data;
}

/** Keeps `meta` alongside `data` for the paginated list endpoints. */
export async function apiList<T>(path: string, options: RequestOptions = {}) {
  const res = await request<T[]>(path, { ...options, method: 'GET' });
  return {
    data: Array.isArray(res.data) ? res.data : [],
    meta: res.meta as PaginationMeta | undefined,
  };
}

/** Pulls a file response (CSV export) down as a browser download. */
export async function apiDownload(
  path: string,
  filename: string,
  options: RequestOptions = {},
) {
  const headers: Record<string, string> = {};
  if (options.appId) headers['app-id'] = options.appId;

  const res = await fetch(buildUrl(path, options.query), { headers });
  if (!res.ok) {
    throw new ApiError(res.status, `Export failed with status ${res.status}`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
