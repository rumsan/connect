'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { apiDownload, apiGet, apiList, apiSend } from './api';
import { useApp } from './app-context';
import {
  Application,
  Broadcast,
  BroadcastLog,
  BroadcastStatusCount,
  CreateApplication,
  CreateApplicationResult,
  CreateTemplate,
  CreateTransport,
  CreditsEntry,
  SendBroadcast,
  Session,
  SetTransportPricing,
  Template,
  Transport,
  TransportPricing,
  UsageResponse,
} from './types';

export type ListParams = Record<string, unknown>;

/** Every app-scoped key starts with the appId so switching apps refetches cleanly. */
const scoped = (appId: string | null, ...rest: unknown[]): QueryKey => [
  'app',
  appId ?? 'none',
  ...rest,
];

const LIST_DEFAULTS = { page: 1, sort: 'createdAt', order: 'desc' };

/* -------------------------------------------------------------------------- */
/* Applications — GET/POST /apps, not app-scoped                              */
/* -------------------------------------------------------------------------- */

export function useApplications() {
  return useQuery({
    queryKey: ['apps'],
    queryFn: () => apiList<Application>('apps'),
  });
}

export function useCreateApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateApplication) =>
      apiSend<CreateApplicationResult>('POST', 'apps', { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apps'] }),
  });
}

/* -------------------------------------------------------------------------- */
/* Transports                                                                 */
/* -------------------------------------------------------------------------- */

export function useTransports(params: ListParams = {}) {
  const { appId } = useApp();
  return useQuery({
    queryKey: scoped(appId, 'transports', params),
    queryFn: () =>
      apiList<Transport>('transports', {
        appId,
        query: { ...LIST_DEFAULTS, perPage: 100, ...params },
      }),
    enabled: Boolean(appId),
  });
}

export type TransportWithApp = Transport & { appName: string; appCuid: string };

/**
 * Every transport across every application, so one already configured in app A
 * can be reused as the starting point in app B. Connect has no cross-app
 * transport endpoint, so this fans out one `GET /transports` per app.
 */
export function useAllTransports() {
  const { data: appsData } = useApplications();
  const apps = appsData?.data ?? [];

  return useQuery({
    queryKey: ['all-transports', apps.map((a) => a.cuid)],
    queryFn: async () => {
      const results = await Promise.all(
        apps.map(async (app) => {
          try {
            const res = await apiList<Transport>('transports', {
              appId: app.cuid,
              query: { page: 1, perPage: 100, sort: 'createdAt', order: 'desc' },
            });
            return res.data.map<TransportWithApp>((transport) => ({
              ...transport,
              appName: app.name,
              appCuid: app.cuid,
            }));
          } catch {
            // One unreachable app must not blank out the whole picker.
            return [];
          }
        }),
      );
      return results.flat();
    },
    enabled: apps.length > 0,
  });
}

export function useCreateTransport() {
  const { appId } = useApp();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTransport) =>
      apiSend<Transport>('POST', 'transports', { appId, body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: scoped(appId, 'transports') }),
  });
}

export function useUpdateTransport() {
  const { appId } = useApp();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      cuid,
      ...body
    }: {
      cuid: string;
      name?: string;
      config?: Record<string, unknown>;
    }) => apiSend<Transport>('PATCH', `transports/${cuid}`, { appId, body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: scoped(appId, 'transports') }),
  });
}

export function useDeleteTransport() {
  const { appId } = useApp();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cuid: string) =>
      apiSend<Transport>('DELETE', `transports/${cuid}`, { appId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: scoped(appId, 'transports') }),
  });
}

export function useSetTransportPricing() {
  const { appId } = useApp();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cuid, ...body }: SetTransportPricing & { cuid: string }) =>
      apiSend<TransportPricing>('POST', `transports/${cuid}/pricing`, { appId, body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: scoped(appId, 'transports') }),
  });
}

export function useRemoveTransportPricing() {
  const { appId } = useApp();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cuid: string) =>
      apiSend<TransportPricing>('DELETE', `transports/${cuid}/pricing`, { appId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: scoped(appId, 'transports') }),
  });
}

/* -------------------------------------------------------------------------- */
/* Broadcasts & sessions                                                      */
/* -------------------------------------------------------------------------- */

export function useSendBroadcast() {
  const { appId } = useApp();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SendBroadcast) =>
      apiSend<Session>('POST', 'broadcasts', { appId, body }),
    // A send touches sessions, broadcasts and the status rollup at once.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app', appId ?? 'none'] }),
  });
}

export function useSessions(params: ListParams = {}) {
  const { appId } = useApp();
  return useQuery({
    queryKey: scoped(appId, 'sessions', params),
    queryFn: () =>
      apiList<Session>('sessions', {
        appId,
        query: { ...LIST_DEFAULTS, perPage: 25, ...params },
      }),
    enabled: Boolean(appId),
  });
}

export function useSession(cuid: string) {
  const { appId } = useApp();
  return useQuery({
    queryKey: scoped(appId, 'session', cuid),
    queryFn: () => apiGet<Session>(`sessions/${cuid}`, { appId }),
    enabled: Boolean(appId && cuid),
  });
}

export function useSessionBroadcasts(cuid: string, params: ListParams = {}) {
  const { appId } = useApp();
  return useQuery({
    queryKey: scoped(appId, 'session-broadcasts', cuid, params),
    queryFn: () =>
      apiList<Broadcast>(`sessions/${cuid}/broadcasts`, {
        appId,
        query: { ...LIST_DEFAULTS, perPage: 50, ...params },
      }),
    enabled: Boolean(appId && cuid),
  });
}

export function useSessionLogs(cuid: string, params: ListParams = {}) {
  const { appId } = useApp();
  return useQuery({
    queryKey: scoped(appId, 'session-logs', cuid, params),
    queryFn: () =>
      apiList<BroadcastLog>(`sessions/${cuid}/logs`, {
        appId,
        query: { ...LIST_DEFAULTS, perPage: 50, ...params },
      }),
    enabled: Boolean(appId && cuid),
  });
}

/** Re-runs a session's incomplete broadcasts, optionally including failures. */
export function useTriggerSession() {
  const { appId } = useApp();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cuid, includeFailed }: { cuid: string; includeFailed: boolean }) =>
      apiGet<{ isComplete: boolean; count: number }>(`sessions/${cuid}/trigger`, {
        appId,
        query: { include_failed: includeFailed },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app', appId ?? 'none'] }),
  });
}

export function useBroadcasts(params: ListParams = {}) {
  const { appId } = useApp();
  return useQuery({
    queryKey: scoped(appId, 'broadcasts', params),
    queryFn: () =>
      apiList<Broadcast>('broadcasts', {
        appId,
        query: { ...LIST_DEFAULTS, perPage: 25, ...params },
      }),
    enabled: Boolean(appId),
  });
}

export function useBroadcastStatusCount() {
  const { appId } = useApp();
  return useQuery({
    queryKey: scoped(appId, 'status-count'),
    queryFn: () => apiGet<BroadcastStatusCount>('broadcasts/status-count', { appId }),
    enabled: Boolean(appId),
  });
}

export function useDownloadBroadcastsCsv() {
  const { appId } = useApp();
  return useMutation({
    mutationFn: (sessionId?: string) =>
      apiDownload(
        'broadcasts/download',
        sessionId ? `broadcasts-${sessionId}.csv` : 'broadcasts.csv',
        { appId, query: sessionId ? { sessionId } : undefined },
      ),
  });
}

/* -------------------------------------------------------------------------- */
/* Delivery logs                                                              */
/* -------------------------------------------------------------------------- */

export function useLogs(params: ListParams = {}) {
  const { appId } = useApp();
  return useQuery({
    queryKey: scoped(appId, 'logs', params),
    queryFn: () =>
      apiList<BroadcastLog>('logs', {
        appId,
        query: { ...LIST_DEFAULTS, perPage: 50, ...params },
      }),
    enabled: Boolean(appId),
  });
}

/* -------------------------------------------------------------------------- */
/* Templates                                                                  */
/* -------------------------------------------------------------------------- */

export function useTemplates(params: ListParams = {}) {
  const { appId } = useApp();
  return useQuery({
    queryKey: scoped(appId, 'templates', params),
    queryFn: () =>
      apiList<Template>('template', {
        appId,
        query: { ...LIST_DEFAULTS, perPage: 100, ...params },
      }),
    enabled: Boolean(appId),
  });
}

export function useCreateTemplate() {
  const { appId } = useApp();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTemplate) =>
      apiSend<Template>('POST', 'template', { appId, body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: scoped(appId, 'templates') }),
  });
}

export function useDeleteTemplate() {
  const { appId } = useApp();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cuid: string) =>
      apiSend<Template>('DELETE', `template/${cuid}`, { appId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: scoped(appId, 'templates') }),
  });
}

/** Pulls the provider's template catalogue (e.g. Twilio/WhatsApp) into Connect. */
export function useSyncTemplates() {
  const { appId } = useApp();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (transportId: string) =>
      apiSend<unknown>('POST', `template/${transportId}/sync`, { appId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: scoped(appId, 'templates') }),
  });
}

/* -------------------------------------------------------------------------- */
/* Usage — the app is addressed in the path, not the `app-id` header           */
/* -------------------------------------------------------------------------- */

export type UsageRange = { from?: string; to?: string; xref?: string };

function usagePath(appId: string, xref: string | undefined, suffix = '') {
  const base = xref ? `usage/${appId}/xref/${encodeURIComponent(xref)}` : `usage/${appId}`;
  return suffix ? `${base}/${suffix}` : base;
}

export function useUsage({ from, to, xref }: UsageRange = {}) {
  const { appId } = useApp();
  return useQuery({
    queryKey: scoped(appId, 'usage', from, to, xref),
    queryFn: () =>
      apiGet<UsageResponse>(usagePath(appId as string, xref), { query: { from, to } }),
    enabled: Boolean(appId),
  });
}

export function useCredits({ from, to, xref }: UsageRange = {}) {
  const { appId } = useApp();
  return useQuery({
    queryKey: scoped(appId, 'credits', from, to, xref),
    queryFn: () =>
      apiList<CreditsEntry>(usagePath(appId as string, xref, 'credits'), {
        query: { from, to },
      }),
    enabled: Boolean(appId),
  });
}

export type DailyPoint = {
  date: string;
  broadcasts: number;
  sessions: number;
  credits: number;
};

/**
 * Cross-app daily series, merged by date. The credits endpoint is the only
 * time-bucketed data Connect exposes, so it is what every trend chart reads.
 */
export function useDailyForApps(appIds: string[], range: UsageRange = {}) {
  return useQuery({
    queryKey: ['daily-all', appIds, range.from, range.to],
    queryFn: async () => {
      const perApp = await Promise.all(
        appIds.map(async (id) => {
          try {
            return await apiList<CreditsEntry>(usagePath(id, undefined, 'credits'), {
              query: { from: range.from, to: range.to },
            });
          } catch {
            return { data: [] as CreditsEntry[], meta: undefined };
          }
        }),
      );

      const byDate = new Map<string, DailyPoint>();
      for (const result of perApp) {
        for (const row of result.data) {
          // Snapshots are per transport per day; collapse to one point per day.
          const date = String(row.date).slice(0, 10);
          const point = byDate.get(date) ?? {
            date,
            broadcasts: 0,
            sessions: 0,
            credits: 0,
          };
          point.broadcasts += row.broadcasts ?? 0;
          point.sessions += row.sessions ?? 0;
          point.credits += Number(row.credits ?? 0);
          byDate.set(date, point);
        }
      }

      return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    },
    enabled: appIds.length > 0,
  });
}

/** Same daily series for a single application. */
export function useDaily(range: UsageRange = {}) {
  const { appId } = useApp();
  return useDailyForApps(appId ? [appId] : [], range);
}

/** Cross-app usage roll-up for the super-admin dashboard. */
export function useUsageForApps(appIds: string[], range: UsageRange = {}) {
  return useQuery({
    queryKey: ['usage-all', appIds, range.from, range.to],
    queryFn: () =>
      Promise.all(
        appIds.map(async (id) => {
          try {
            const usage = await apiGet<UsageResponse>(usagePath(id, undefined), {
              query: { from: range.from, to: range.to },
            });
            return { appId: id, usage, error: null as string | null };
          } catch {
            // One unreachable app must not blank out the whole dashboard.
            return { appId: id, usage: null, error: 'unavailable' };
          }
        }),
      ),
    enabled: appIds.length > 0,
  });
}
