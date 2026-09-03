'use client';

import { ArrowLeft, Download, Loader2, RotateCw } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '../../../../../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../../../components/ui/card';
import {
  Empty,
  ErrorNotice,
  Json,
  Loading,
  PageHead,
  Pagination,
  Stat,
  StatusBadge,
  SuccessNotice,
  formatDate,
  formatNumber,
} from '../../../../../../components/ui/feedback';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../../../components/ui/select';
import { TableSkeleton } from '../../../../../../components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../../../../components/ui/table';
import { appHref, useApp } from '../../../../../../lib/app-context';
import {
  useDownloadBroadcastsCsv,
  useSession,
  useSessionBroadcasts,
  useSessionLogs,
  useTriggerSession,
} from '../../../../../../lib/hooks';
import { BroadcastStatus } from '../../../../../../lib/types';

const ALL = '__all__';

function BroadcastList({ cuid }: { cuid: string }) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>(ALL);
  const { data, isLoading, error } = useSessionBroadcasts(cuid, {
    page,
    ...(status !== ALL ? { status } : {}),
  });
  const broadcasts = data?.data ?? [];

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Per-recipient delivery</CardTitle>
          <CardDescription>One row per address in this session.</CardDescription>
        </div>
        <Select
          value={status}
          onValueChange={(v) => {
            setPage(1);
            setStatus(v);
          }}
        >
          <SelectTrigger className="w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {Object.values(BroadcastStatus).map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>

      {isLoading ? (
        <TableSkeleton columns={5} />
      ) : error ? (
        <div className="p-4">
          <ErrorNotice error={error} />
        </div>
      ) : broadcasts.length === 0 ? (
        <Empty title="No broadcasts match this filter" />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Address</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Attempts</TableHead>
                <TableHead>Last attempt</TableHead>
                <TableHead>Disposition</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {broadcasts.map((broadcast) => (
                <TableRow key={broadcast.cuid}>
                  <TableCell className="font-mono text-xs">{broadcast.address}</TableCell>
                  <TableCell>
                    <StatusBadge status={broadcast.status} />
                  </TableCell>
                  <TableCell className="tabular whitespace-nowrap text-right">
                    {broadcast.attempts ?? 0} / {broadcast.maxAttempts}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(broadcast.lastAttempt)}
                  </TableCell>
                  <TableCell className="max-w-80">
                    {broadcast.disposition &&
                    Object.keys(broadcast.disposition).length > 0 ? (
                      <details>
                        <summary className="cursor-pointer text-muted-foreground">
                          View
                        </summary>
                        <Json value={broadcast.disposition} className="mt-2" />
                      </details>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={page}
            onPage={setPage}
            meta={data?.meta}
            count={broadcasts.length}
          />
        </>
      )}
    </Card>
  );
}

function AttemptLog({ cuid }: { cuid: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useSessionLogs(cuid, { page });
  const logs = data?.data ?? [];

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Attempt log</CardTitle>
          <CardDescription>Every delivery attempt, newest first.</CardDescription>
        </div>
      </CardHeader>

      {isLoading ? (
        <TableSkeleton columns={5} />
      ) : error ? (
        <div className="p-4">
          <ErrorNotice error={error} />
        </div>
      ) : logs.length === 0 ? (
        <Empty title="No log entries yet" />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Attempt</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.cuid}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(log.createdAt)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={log.status} />
                  </TableCell>
                  <TableCell className="tabular text-right">{log.attempt}</TableCell>
                  <TableCell>
                    {log.notes || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="max-w-96">
                    {log.details ? (
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
          <Pagination page={page} onPage={setPage} meta={data?.meta} count={logs.length} />
        </>
      )}
    </Card>
  );
}

export default function SessionDetailPage() {
  const params = useParams<{ sessionCuid: string }>();
  const cuid = params?.sessionCuid as string;
  const { appId } = useApp();

  const { data: session, isLoading, error } = useSession(cuid);
  const trigger = useTriggerSession();
  const download = useDownloadBroadcastsCsv();
  const [includeFailed, setIncludeFailed] = useState(true);

  const stats = (session?.stats ?? {}) as Record<string, number>;

  return (
    <>
      <PageHead
        title="Session"
        subtitle={cuid}
        actions={
          <Button variant="outline" asChild>
            <Link href={appHref(appId as string, 'sessions')}>
              <ArrowLeft /> All sessions
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorNotice error={error} />
      ) : !session ? (
        <Card>
          <Empty title="Session not found" />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {trigger.isSuccess ? (
            <SuccessNotice>Retry queued for incomplete recipients.</SuccessNotice>
          ) : null}
          <ErrorNotice error={trigger.error ?? download.error} />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Status" value={<StatusBadge status={session.status} />} />
            <Stat label="Recipients" value={formatNumber(session.totalAddresses)} />
            <Stat label="Succeeded" value={formatNumber(stats.success ?? stats.SUCCESS)} />
            <Stat label="Failed" value={formatNumber(stats.fail ?? stats.FAIL)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Request</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ['Transport', session.Transport?.name ?? session.transport],
                  ['Trigger', session.triggerType],
                  ['Max attempts', String(session.maxAttempts)],
                  ['Reference', session.xref || '—'],
                  ['Webhook', session.webhook || '—'],
                  ['Created', formatDate(session.createdAt)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="truncate">{value}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-4">
                <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Message
                </div>
                <Json value={session.message} />
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={trigger.isPending}
              onClick={() => trigger.mutate({ cuid, includeFailed })}
            >
              {trigger.isPending ? <Loader2 className="animate-spin" /> : <RotateCw />}
              Retry incomplete
            </Button>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={includeFailed}
                onChange={(e) => setIncludeFailed(e.target.checked)}
              />
              Include already-failed recipients
            </label>
            <Button
              variant="outline"
              disabled={download.isPending}
              onClick={() => download.mutate(cuid)}
            >
              {download.isPending ? <Loader2 className="animate-spin" /> : <Download />}
              Export CSV
            </Button>
          </div>

          <BroadcastList cuid={cuid} />
          <AttemptLog cuid={cuid} />
        </div>
      )}
    </>
  );
}
