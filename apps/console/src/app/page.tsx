'use client';

import { ArrowRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  OutcomeChart,
  RankedBarChart,
  TrendChart,
} from '../components/charts/charts';
import { CreateAppDialog } from '../components/create-app-dialog';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import {
  Empty,
  ErrorNotice,
  PageHead,
  Stat,
  StatusBadge,
  SuccessNotice,
  formatNumber,
} from '../components/ui/feedback';
import { Input } from '../components/ui/input';
import { Field } from '../components/ui/label';
import { TableSkeleton } from '../components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { appHref } from '../lib/app-context';
import {
  useApplications,
  useDailyForApps,
  useUsageForApps,
  type UsageRange,
} from '../lib/hooks';
import type { CreateApplicationResult, UsageByTransport } from '../lib/types';

function share(part: number, whole: number) {
  if (!whole) return '—';
  return `${Math.round((part / whole) * 100)}%`;
}

/** Charts read better with short dates than full ISO timestamps. */
function shortDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function DashboardPage() {
  const { data, isLoading, error } = useApplications();
  const [created, setCreated] = useState<CreateApplicationResult | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [range, setRange] = useState<UsageRange>({});

  const apps = useMemo(() => data?.data ?? [], [data]);
  const appIds = useMemo(() => apps.map((a) => a.cuid), [apps]);
  const usage = useUsageForApps(appIds, range);
  const daily = useDailyForApps(appIds, range);

  const totalsFor = (cuid: string) =>
    usage.data?.find((entry) => entry.appId === cuid)?.usage?.totals;

  const fleet = usage.data?.reduce(
    (acc, entry) => {
      const t = entry.usage?.totals;
      acc.sessions += t?.sessions ?? 0;
      acc.broadcasts += t?.broadcasts ?? 0;
      acc.success += t?.success ?? 0;
      acc.fail += t?.fail ?? 0;
      acc.credits += t?.credits ?? 0;
      return acc;
    },
    { sessions: 0, broadcasts: 0, success: 0, fail: 0, credits: 0 },
  );

  const trend = useMemo(
    () => (daily.data ?? []).map((p) => ({ ...p, date: shortDate(p.date) })),
    [daily.data],
  );

  /** Every app's per-transport usage rolled up by channel type. */
  const byChannel = useMemo(() => {
    const merged = new Map<string, UsageByTransport & { apps: number }>();
    for (const entry of usage.data ?? []) {
      for (const row of entry.usage?.byTransport ?? []) {
        const key = row.transportType;
        const current = merged.get(key);
        if (!current) {
          merged.set(key, { ...row, transportName: key, apps: 1 });
          continue;
        }
        current.broadcasts += row.broadcasts;
        current.success += row.success;
        current.fail += row.fail;
        current.credits += row.credits;
        current.apps += 1;
      }
    }
    return [...merged.values()].sort((a, b) => b.broadcasts - a.broadcasts);
  }, [usage.data]);

  const ranked = useMemo(
    () =>
      [...apps]
        .map((app) => ({ app, totals: totalsFor(app.cuid) }))
        .sort((a, b) => (b.totals?.broadcasts ?? 0) - (a.totals?.broadcasts ?? 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apps, usage.data],
  );

  // Past 8 categorical slots a 9th hue is indistinguishable under CVD, and the
  // same logic applies to bar rows: keep the chart readable, fold the tail.
  const TOP = 8;
  const topApps = ranked.slice(0, TOP).filter((r) => (r.totals?.broadcasts ?? 0) > 0);
  const tail = ranked.slice(TOP);
  const tailTotals = tail.reduce(
    (acc, r) => {
      acc.broadcasts += r.totals?.broadcasts ?? 0;
      acc.success += r.totals?.success ?? 0;
      acc.fail += r.totals?.fail ?? 0;
      return acc;
    },
    { broadcasts: 0, success: 0, fail: 0 },
  );

  const appVolume = [
    ...topApps.map((r) => ({ name: r.app.name, value: r.totals?.broadcasts ?? 0 })),
    ...(tailTotals.broadcasts > 0
      ? [{ name: `Other (${tail.length})`, value: tailTotals.broadcasts }]
      : []),
  ];

  const appOutcome = [
    ...topApps.map((r) => ({
      name: r.app.name,
      delivered: r.totals?.success ?? 0,
      failed: r.totals?.fail ?? 0,
    })),
    ...(tailTotals.broadcasts > 0
      ? [
          {
            name: `Other (${tail.length})`,
            delivered: tailTotals.success,
            failed: tailTotals.fail,
          },
        ]
      : []),
  ];

  const channelVolume = byChannel.map((c) => ({
    name: c.transportType,
    value: c.broadcasts,
  }));

  const loading = usage.isLoading;

  return (
    <>
      <PageHead
        title="Dashboard"
        subtitle="Delivery and credit reporting across every application."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/apps">
                Applications <ArrowRight />
              </Link>
            </Button>
            <CreateAppDialog onCreated={setCreated}>
              <Button>
                <Plus /> New application
              </Button>
            </CreateAppDialog>
          </>
        }
      />

      <div className="flex flex-col gap-4">
        {created ? (
          <SuccessNotice>
            <strong>{created.app.name}</strong> created.
            {created.privateKey ? (
              <>
                <div>{created.message}</div>
                <code className="mt-1 block break-all font-mono text-xs">
                  {created.privateKey}
                </code>
              </>
            ) : null}
          </SuccessNotice>
        ) : null}

        <ErrorNotice error={error} />

        {/* One filter row above everything it scopes — never per-chart. */}
        <Card>
          <CardContent>
            <form
              className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4"
              onSubmit={(e) => {
                e.preventDefault();
                setRange({ from: from || undefined, to: to || undefined });
              }}
            >
              <Field label="From" htmlFor="d-from">
                <Input
                  id="d-from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </Field>
              <Field label="To" htmlFor="d-to">
                <Input
                  id="d-to"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </Field>
              <div className="flex gap-2">
                <Button type="submit">Apply</Button>
                {range.from || range.to ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setFrom('');
                      setTo('');
                      setRange({});
                    }}
                  >
                    Reset
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Stat label="Applications" value={formatNumber(apps.length)} />
          <Stat label="Sessions" value={loading ? '—' : formatNumber(fleet?.sessions)} />
          <Stat
            label="Broadcasts"
            value={loading ? '—' : formatNumber(fleet?.broadcasts)}
          />
          <Stat
            label="Delivered"
            value={loading ? '—' : formatNumber(fleet?.success)}
            hint={loading || !fleet ? undefined : `${share(fleet.success, fleet.broadcasts)} of sent`}
          />
          <Stat
            label="Failed"
            value={loading ? '—' : formatNumber(fleet?.fail)}
            hint={loading || !fleet ? undefined : `${share(fleet.fail, fleet.broadcasts)} of sent`}
          />
          <Stat label="Credits used" value={loading ? '—' : formatNumber(fleet?.credits)} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <TrendChart
            title="Broadcasts per day"
            description="Messages attempted across all applications."
            data={trend}
            dataKey="broadcasts"
            label="Broadcasts"
            isLoading={daily.isFetching}
          />
          <TrendChart
            title="Credits per day"
            description="Consumption recorded as sessions complete."
            data={trend}
            dataKey="credits"
            label="Credits"
            isLoading={daily.isFetching}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <RankedBarChart
            title="Busiest applications"
            description="By broadcasts sent."
            data={appVolume}
            categoryLabel="Application"
            valueLabel="Broadcasts"
            isLoading={loading}
          />
          <RankedBarChart
            title="Volume by channel"
            description="Every application's transports, rolled up by type."
            data={channelVolume}
            categoryLabel="Channel"
            valueLabel="Broadcasts"
            isLoading={loading}
          />
        </div>

        <OutcomeChart
          title="Delivery outcome by application"
          description="Delivered against failed, per application."
          data={appOutcome}
          categoryLabel="Application"
          isLoading={loading}
        />

        <Card>
          <CardHeader>
            <CardTitle>All applications</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link href="/apps">Manage</Link>
            </Button>
          </CardHeader>

          {isLoading || loading ? (
            <TableSkeleton columns={8} />
          ) : apps.length === 0 ? (
            <Empty
              title="No applications registered"
              hint="Create an application to start sending."
              action={
                <CreateAppDialog onCreated={setCreated}>
                  <Button>
                    <Plus /> New application
                  </Button>
                </CreateAppDialog>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Application</TableHead>
                  <TableHead>Environment</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                  <TableHead className="text-right">Broadcasts</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Success rate</TableHead>
                  <TableHead className="text-right">Credits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranked.map(({ app, totals }) => (
                  <TableRow key={app.cuid}>
                    <TableCell>
                      <Link
                        href={appHref(app.cuid)}
                        className="font-medium text-primary hover:underline"
                      >
                        {app.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={app.environment} />
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {formatNumber(totals?.sessions)}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {formatNumber(totals?.broadcasts)}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {formatNumber(totals?.success)}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {formatNumber(totals?.fail)}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {share(totals?.success ?? 0, totals?.broadcasts ?? 0)}
                    </TableCell>
                    <TableCell className="tabular text-right font-medium">
                      {formatNumber(totals?.credits)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
