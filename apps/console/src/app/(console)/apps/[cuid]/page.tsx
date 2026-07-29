'use client';

import { AlertTriangle, FileText, Radio, Send } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { OutcomeChart, TrendChart } from '../../../../components/charts/charts';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../components/ui/card';
import {
  CopyId,
  Empty,
  ErrorNotice,
  Json,
  PageHead,
  Stat,
  StatusBadge,
  formatDate,
  formatNumber,
} from '../../../../components/ui/feedback';
import { TableSkeleton } from '../../../../components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../../components/ui/table';
import { appHref, useApp } from '../../../../lib/app-context';
import {
  useApplications,
  useBroadcastStatusCount,
  useDaily,
  useLogs,
  useSessions,
  useTemplates,
  useTransports,
  useUsage,
} from '../../../../lib/hooks';
import { BroadcastStatus, TemplateStatus } from '../../../../lib/types';

function shortDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Name/value row used by the details card. */
function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="truncate">{children}</dd>
    </div>
  );
}

export default function AppOverviewPage() {
  const { appId } = useApp();
  const scoped = (suffix: string) => appHref(appId as string, suffix);

  const { data: appsData } = useApplications();
  const app = appsData?.data?.find((a) => a.cuid === appId);

  const counts = useBroadcastStatusCount();
  const usage = useUsage();
  const daily = useDaily();
  const transports = useTransports();
  const templates = useTemplates();
  const sessions = useSessions({ perPage: 6 });
  // The "what is broken right now" panel.
  const failures = useLogs({ status: BroadcastStatus.FAIL, perPage: 6 });

  const trend = useMemo(
    () => (daily.data ?? []).map((p) => ({ ...p, date: shortDate(p.date) })),
    [daily.data],
  );

  const byTransport = useMemo(() => usage.data?.byTransport ?? [], [usage.data]);
  const outcome = useMemo(
    () =>
      byTransport.map((t) => ({
        name: t.transportName,
        delivered: t.success,
        failed: t.fail,
      })),
    [byTransport],
  );

  const totals = usage.data?.totals;
  const transportRows = transports.data?.data ?? [];
  const templateRows = templates.data?.data ?? [];
  const sessionRows = sessions.data?.data ?? [];
  const failureRows = failures.data?.data ?? [];

  const approvedTemplates = templateRows.filter(
    (t) => t.status === TemplateStatus.APPROVED,
  ).length;

  const loading = counts.isLoading || usage.isLoading;

  return (
    <>
      <PageHead
        title={app?.name ?? 'Application'}
        subtitle={app?.description || 'Overview of this application’s activity.'}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={scoped('transports')}>
                <Radio /> Transports
              </Link>
            </Button>
            <Button asChild>
              <Link href={scoped('broadcasts')}>
                <Send /> Send broadcast
              </Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Stat
            label="Broadcasts"
            value={loading ? '—' : formatNumber(counts.data?.total)}
          />
          <Stat
            label="Delivered"
            value={loading ? '—' : formatNumber(counts.data?.success)}
            hint={
              counts.data?.total
                ? `${Math.round(((counts.data.success ?? 0) / counts.data.total) * 100)}% of sent`
                : undefined
            }
          />
          <Stat
            label="Pending"
            value={loading ? '—' : formatNumber(counts.data?.pending)}
          />
          <Stat label="Failed" value={loading ? '—' : formatNumber(counts.data?.fail)} />
          <Stat label="Sessions" value={loading ? '—' : formatNumber(totals?.sessions)} />
          <Stat label="Credits used" value={loading ? '—' : formatNumber(totals?.credits)} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <TrendChart
            title="Broadcasts per day"
            description="Messages attempted by this application."
            data={trend}
            dataKey="broadcasts"
            label="Broadcasts"
            isLoading={daily.isFetching}
          />
          <OutcomeChart
            title="Outcome by transport"
            description="Delivered against failed, per transport."
            data={outcome}
            categoryLabel="Transport"
            isLoading={usage.isFetching}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Application</CardTitle>
                <CardDescription>
                  Credentials and identifiers your integration needs.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Detail label="App id">
                  <CopyId value={app?.cuid} />
                </Detail>
                <Detail label="Environment">
                  <StatusBadge status={app?.environment} />
                </Detail>
                <Detail label="Created">{formatDate(app?.createdAt)}</Detail>
                <Detail label="Templates">
                  {templates.isLoading
                    ? '—'
                    : `${templateRows.length} (${approvedTemplates} approved)`}
                </Detail>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Public key
                  </dt>
                  <dd className="truncate font-mono text-xs" title={app?.publicKey}>
                    {app?.publicKey ?? '—'}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Transports</CardTitle>
                <CardDescription>
                  {transports.isLoading
                    ? 'Loading…'
                    : `${transportRows.length} configured`}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={scoped('transports')}>Manage</Link>
              </Button>
            </CardHeader>

            {transports.isLoading ? (
              <TableSkeleton rows={3} columns={3} />
            ) : transportRows.length === 0 ? (
              <Empty
                title="No transports yet"
                hint="Pick a provider template to start sending."
                action={
                  <Button asChild>
                    <Link href={scoped('transports')}>
                      <Radio /> Add transport
                    </Link>
                  </Button>
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Pricing</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transportRows.slice(0, 6).map((transport) => (
                    <TableRow key={transport.cuid}>
                      <TableCell className="font-medium">{transport.name}</TableCell>
                      <TableCell>
                        <StatusBadge status={transport.type} />
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right">
                        {transport.Pricing ? (
                          <>
                            {transport.Pricing.creditPerUnit}{' '}
                            {transport.Pricing.currency}/{transport.Pricing.unitType}
                          </>
                        ) : (
                          <span className="text-muted-foreground">Not set</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Recent sessions</CardTitle>
                <CardDescription>Newest broadcast requests.</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={scoped('sessions')}>View all</Link>
              </Button>
            </CardHeader>

            {sessions.isLoading ? (
              <TableSkeleton rows={4} columns={4} />
            ) : sessions.error ? (
              <div className="p-4">
                <ErrorNotice error={sessions.error} />
              </div>
            ) : sessionRows.length === 0 ? (
              <Empty
                title="Nothing sent yet"
                hint="Configure a transport, then send your first broadcast."
                action={
                  <Button asChild>
                    <Link href={scoped('broadcasts')}>
                      <Send /> Send broadcast
                    </Link>
                  </Button>
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Session</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Recipients</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessionRows.map((session) => (
                    <TableRow key={session.cuid}>
                      <TableCell>
                        <Link
                          href={scoped(`sessions/${session.cuid}`)}
                          className="font-mono text-xs text-primary hover:underline"
                        >
                          {session.cuid.slice(0, 10)}…
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={session.status} />
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {formatNumber(session.totalAddresses)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDate(session.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-1.5">
                  <AlertTriangle className="size-4 text-muted-foreground" />
                  Recent failures
                </CardTitle>
                <CardDescription>
                  Failed delivery attempts — start here when something is wrong.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={scoped('logs')}>All logs</Link>
              </Button>
            </CardHeader>

            {failures.isLoading ? (
              <TableSkeleton rows={4} columns={3} />
            ) : failures.error ? (
              <div className="p-4">
                <ErrorNotice error={failures.error} />
              </div>
            ) : failureRows.length === 0 ? (
              <Empty
                title="No failures recorded"
                hint="Every delivery attempt so far has succeeded or is still pending."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Session</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {failureRows.map((log) => (
                    <TableRow key={log.cuid}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDate(log.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={scoped(`sessions/${log.session}`)}
                          className="font-mono text-xs text-primary hover:underline"
                        >
                          {log.session?.slice(0, 10)}…
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-64">
                        {log.notes ? (
                          <span className="line-clamp-2">{log.notes}</span>
                        ) : log.details ? (
                          <details>
                            <summary className="cursor-pointer text-muted-foreground">
                              View
                            </summary>
                            <Json value={log.details} className="mt-2" />
                          </details>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </div>

        {totals ? (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Delivery volume</CardTitle>
                <CardDescription>
                  What this application has consumed, in billable units.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={scoped('usage')}>Usage &amp; credits</Link>
              </Button>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  ['Characters', totals.chars],
                  ['SMS segments', totals.segments],
                  ['Calls', totals.calls],
                  ['Call duration (s)', totals.duration],
                  ['Sessions', totals.sessions],
                  ['Credits', totals.credits],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="tabular text-lg font-semibold">
                      {formatNumber(value as number)}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        ) : null}

        {templateRows.length > 0 ? (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Templates</CardTitle>
                <CardDescription>Registered with your providers.</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={scoped('templates')}>
                  <FileText /> Manage
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {Object.values(TemplateStatus).map((status) => {
                const count = templateRows.filter((t) => t.status === status).length;
                if (!count) return null;
                return (
                  <Badge key={status} variant="outline" className="gap-1.5 py-1">
                    <StatusBadge status={status} />
                    <span className="tabular font-semibold">{count}</span>
                  </Badge>
                );
              })}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
