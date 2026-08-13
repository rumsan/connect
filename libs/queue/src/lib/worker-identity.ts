import { hostname } from 'os';

/**
 * Identity of the worker process this code is running in.
 *
 * Only transport workers set these; the connect app leaves WORKER_ID unset and
 * every publisher then falls back to the shared-queue behaviour, which is what
 * keeps API/SMTP/ECHO (and a pre-upgrade voice worker) working unchanged.
 */
export const WORKER_ID: string | undefined =
  process.env['WORKER_ID']?.trim() || undefined;

/** 1 = primary. Lower numbers are filled first when connect picks workers. */
export const WORKER_PRIORITY = +(process.env['WORKER_PRIORITY'] as string) || 1;

export const WORKER_HEARTBEAT_MS =
  +(process.env['WORKER_HEARTBEAT_MS'] as string) || 15_000;

/**
 * Stable label for logs and scratch paths. Falls back to the hostname so a
 * worker started without WORKER_ID is still distinguishable in logs — it just
 * won't take part in multi-worker routing.
 */
export const workerLabel = () => WORKER_ID ?? hostname();
