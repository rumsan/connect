'use client';

import { useMemo, useState } from 'react';
import {
  OutcomeChart,
  RankedBarChart,
  TrendChart,
} from '../../../../components/charts/charts';
import { Button } from '../../../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../components/ui/card';
import {
  Empty,
  ErrorNotice,
  Loading,
  PageHead,
  Stat,
  formatNumber,
} from '../../../../components/ui/feedback';
import { Input } from '../../../../components/ui/input';
import { Field } from '../../../../components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../../components/ui/table';
import {
  useCredits,
  useDaily,
  useUsage,
  type UsageRange,
} from '../../../../lib/hooks';

/** Charts read better with short dates than full ISO timestamps. */
function shortDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function UsageBody({ range }: { range: UsageRange }) {
  const usage = useUsage(range);
  const credits = useCredits(range);
  const daily = useDaily(range);

  const trend = useMemo(
    () => (daily.data ?? []).map((p) => ({ ...p, date: shortDate(p.date) })),
    [daily.data],
  );

  const byTransport = useMemo(
    () => usage.data?.byTransport ?? [],
    [usage.data],
  );

  const channelVolume = useMemo(
    () => byTransport.map((t) => ({ name: t.transportName, value: t.broadcasts })),
    [byTransport],
  );

  const channelOutcome = useMemo(
    () =>
      byTransport.map((t) => ({
        name: t.transportName,
        delivered: t.success,
        failed: t.fail,
      })),
    [byTransport],
  );

  if (usage.isLoading) return <Loading />;
  if (usage.error) return <ErrorNotice error={usage.error} />;

  const totals = usage.data?.totals;
  const creditRows = credits.data?.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Credits" value={formatNumber(totals?.credits)} />
        <Stat label="Sessions" value={formatNumber(totals?.sessions)} />
        <Stat label="Broadcasts" value={formatNumber(totals?.broadcasts)} />
        <Stat
          label="Delivered"
          value={formatNumber(totals?.success)}
          hint={
            totals?.broadcasts
              ? `${Math.round(((totals.success ?? 0) / totals.broadcasts) * 100)}% success rate`
              : undefined
          }
        />
        <Stat label="Failed" value={formatNumber(totals?.fail)} />
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
          title="Volume by transport"
          description="Broadcasts sent through each configured transport."
          data={channelVolume}
          categoryLabel="Transport"
          valueLabel="Broadcasts"
          isLoading={usage.isFetching}
        />
        <OutcomeChart
          title="Outcome by transport"
          description="Delivered against failed, per transport."
          data={channelOutcome}
          categoryLabel="Transport"
          isLoading={usage.isFetching}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>By transport</CardTitle>
        </CardHeader>
        {byTransport.length === 0 ? (
          <Empty
            title="No usage in this period"
            hint="Usage snapshots are written as sessions complete."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transport</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Broadcasts</TableHead>
                <TableHead className="text-right">Delivered</TableHead>
                <TableHead className="text-right">Failed</TableHead>
                <TableHead className="text-right">Segments</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Duration (s)</TableHead>
                <TableHead className="text-right">Credits</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byTransport.map((row) => (
                <TableRow key={row.transportCuid}>
                  <TableCell className="font-medium">{row.transportName}</TableCell>
                  <TableCell>{row.transportType}</TableCell>
                  <TableCell className="tabular text-right">
                    {formatNumber(row.broadcasts)}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {formatNumber(row.success)}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {formatNumber(row.fail)}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {formatNumber(row.segments)}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {formatNumber(row.calls)}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {formatNumber(row.duration)}
                  </TableCell>
                  <TableCell className="tabular text-right font-medium">
                    {formatNumber(row.credits)}
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
            <CardTitle>Credits by day</CardTitle>
            <CardDescription>
              Daily snapshots, the basis for billing reconciliation.
            </CardDescription>
          </div>
        </CardHeader>
        {credits.isLoading ? (
          <Loading />
        ) : credits.error ? (
          <div className="p-4">
            <ErrorNotice error={credits.error} />
          </div>
        ) : creditRows.length === 0 ? (
          <Empty title="No credit snapshots in this period" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Transport</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead className="text-right">Broadcasts</TableHead>
                <TableHead className="text-right">Credits</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {creditRows.map((row, index) => (
                <TableRow key={`${row.date}-${row.transportCuid}-${index}`}>
                  <TableCell className="whitespace-nowrap">
                    {new Date(row.date).toLocaleDateString()}
                  </TableCell>
                  <TableCell>{row.transportName}</TableCell>
                  <TableCell>{row.transportType}</TableCell>
                  <TableCell className="tabular text-right">
                    {formatNumber(row.sessions)}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {formatNumber(row.broadcasts)}
                  </TableCell>
                  <TableCell className="tabular text-right font-medium">
                    {formatNumber(row.credits)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

export default function UsagePage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [xref, setXref] = useState('');
  const [range, setRange] = useState<UsageRange>({});

  return (
    <>
      <PageHead
        title="Usage & credits"
        subtitle="What this application consumed, broken down by transport and day."
      />

      <div className="flex flex-col gap-4">
        <Card>
          <CardContent>
            <form
              className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4"
              onSubmit={(e) => {
                e.preventDefault();
                setRange({
                  from: from || undefined,
                  to: to || undefined,
                  xref: xref.trim() || undefined,
                });
              }}
            >
              <Field label="From" htmlFor="u-from">
                <Input
                  id="u-from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </Field>
              <Field label="To" htmlFor="u-to">
                <Input
                  id="u-to"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </Field>
              <Field
                label="Reference (xref)"
                htmlFor="u-xref"
                hint="Scope usage to one of your projects."
              >
                <Input
                  id="u-xref"
                  value={xref}
                  onChange={(e) => setXref(e.target.value)}
                  placeholder="project-abc"
                />
              </Field>
              <Button type="submit">Apply</Button>
            </form>
          </CardContent>
        </Card>

        <UsageBody range={range} />
      </div>
    </>
  );
}
