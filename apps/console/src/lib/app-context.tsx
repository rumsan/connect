'use client';

import { useParams } from 'next/navigation';

/**
 * The active application is whatever `/apps/[cuid]/…` route you are on — the
 * URL is the single source of truth. That makes every app-scoped view
 * bookmarkable and shareable, and removes the hidden global "selected app"
 * state a switcher would need.
 */
export function useApp(): { appId: string | null } {
  const params = useParams<{ cuid?: string }>();
  const cuid = params?.cuid;
  return { appId: typeof cuid === 'string' ? cuid : null };
}

/** Builds a path inside the current application's section. */
export function appHref(appId: string, suffix = '') {
  return suffix ? `/apps/${appId}/${suffix}` : `/apps/${appId}`;
}
