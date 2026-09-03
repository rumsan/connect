'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { Application, UsageTotals } from '../lib/types';
import { appHref } from '../lib/app-context';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { StatusBadge, formatNumber } from './ui/feedback';

/**
 * One application as a clickable card. The whole card is the link — clicking
 * anywhere opens that app's section, so there is no separate "select" step.
 */
export function AppCard({
  app,
  totals,
  loadingTotals,
}: {
  app: Application;
  totals?: UsageTotals;
  loadingTotals?: boolean;
}) {
  const metric = (value?: number) => (loadingTotals ? '—' : formatNumber(value));

  return (
    <Card className="group relative transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring">
      <div className="flex h-32 items-center justify-center rounded-t-lg bg-muted">
        <span className="grid size-14 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
          {app.name.slice(0, 2).toUpperCase()}
        </span>
      </div>

      <div className="p-4">
        <Link
          href={appHref(app.cuid)}
          // Stretched link: the card is the hit target, but the accessible name
          // and focus ring stay on a real anchor.
          className="font-semibold text-primary after:absolute after:inset-0 hover:underline focus-visible:outline-none"
        >
          {app.name}
        </Link>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={app.environment} />
          <Badge variant="outline" className="font-mono text-[11px]">
            {app.cuid.slice(0, 12)}…
          </Badge>
        </div>

        <p className="mt-2 line-clamp-2 min-h-10 text-sm text-muted-foreground">
          {app.description || 'No description'}
        </p>

        <dl className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-center">
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Sent
            </dt>
            <dd className="tabular text-sm font-semibold">
              {metric(totals?.broadcasts)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Failed
            </dt>
            <dd className="tabular text-sm font-semibold">{metric(totals?.fail)}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Credits
            </dt>
            <dd className="tabular text-sm font-semibold">{metric(totals?.credits)}</dd>
          </div>
        </dl>

        <span className="mt-3 flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors group-hover:text-primary">
          Open application <ArrowRight className="size-3.5" />
        </span>
      </div>
    </Card>
  );
}
