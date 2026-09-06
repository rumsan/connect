'use client';

import { AlertCircle, Check, Copy, Inbox, Loader2 } from 'lucide-react';
import * as React from 'react';
import { errorMessage } from '../../lib/api';
import { cn } from '../../lib/utils';
import { Badge } from './badge';
import { Button } from './button';
import { Card, CardContent } from './card';

export function PageHead({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent>
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="tabular mt-1 text-2xl font-semibold tracking-tight">{value}</div>
        {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

const STATUS_VARIANT: Record<
  string,
  'default' | 'secondary' | 'success' | 'destructive' | 'warning'
> = {
  SUCCESS: 'success',
  COMPLETED: 'success',
  APPROVED: 'success',
  PRODUCTION: 'success',
  FAIL: 'destructive',
  FAILED: 'destructive',
  REJECTED: 'destructive',
  PENDING: 'warning',
  SCHEDULED: 'warning',
  STAGING: 'warning',
  NEW: 'default',
  DEVELOPMENT: 'default',
  DRAFT: 'secondary',
};

/** Status is always spelled out — colour reinforces it, never carries it alone. */
export function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return <Badge variant={STATUS_VARIANT[status] ?? 'secondary'}>{status}</Badge>;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground"
      role="status"
    >
      <Loader2 className="size-4 animate-spin" /> {label}
    </div>
  );
}

/** role="alert" so screen readers announce failures without stealing focus. */
export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span>{errorMessage(error)}</span>
    </div>
  );
}

export function SuccessNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-success/10 px-3 py-2.5 text-sm text-success">
      <Check className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function Empty({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 p-10 text-center">
      <Inbox className="size-6 text-muted-foreground" />
      <div className="font-medium">{title}</div>
      {hint ? <p className="max-w-md text-sm text-muted-foreground">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Copies short identifiers (cuids) without leaving the table. */
export function CopyId({ value }: { value?: string | null }) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!value) return <span className="text-muted-foreground">—</span>;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 font-mono text-xs"
      aria-label={`Copy id ${value}`}
      title={value}
      onClick={async () => {
        await navigator.clipboard?.writeText(value);
        setCopied(true);
      }}
    >
      {value.slice(0, 10)}…
      {copied ? <Check className="text-success" /> : <Copy />}
    </Button>
  );
}

export type PageMeta = {
  total?: number;
  page?: number;
  perPage?: number;
  lastPage?: number;
};

export function Pagination({
  page,
  onPage,
  meta,
  count,
}: {
  page: number;
  onPage: (page: number) => void;
  meta?: PageMeta;
  /** Rows on the current page, used when the API returns no meta. */
  count: number;
}) {
  const lastPage = meta?.lastPage;
  const total = meta?.total;
  const isLast = lastPage ? page >= lastPage : count === 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
      <span className="text-sm text-muted-foreground">
        {total !== undefined
          ? `${total.toLocaleString()} total`
          : `${count} on this page`}
        {lastPage ? ` · page ${page} of ${lastPage}` : ` · page ${page}`}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={isLast}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export function Json({ value, className }: { value: unknown; className?: string }) {
  return (
    <pre
      className={cn(
        'overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-mono text-xs',
        className,
      )}
    >
      {JSON.stringify(value ?? null, null, 2)}
    </pre>
  );
}

export function formatDate(value?: string | Date | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatNumber(value?: number | null) {
  if (value === undefined || value === null) return '0';
  return value.toLocaleString();
}
