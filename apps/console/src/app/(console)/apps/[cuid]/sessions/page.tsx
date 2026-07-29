'use client';

import { Download, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '../../../../../components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '../../../../../components/ui/card';
import {
  CopyId,
  Empty,
  ErrorNotice,
  PageHead,
  Pagination,
  StatusBadge,
  formatDate,
  formatNumber,
} from '../../../../../components/ui/feedback';
import { Input } from '../../../../../components/ui/input';
import { TableSkeleton } from '../../../../../components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../../../components/ui/table';
import { appHref, useApp } from '../../../../../lib/app-context';
import { useDownloadBroadcastsCsv, useSessions } from '../../../../../lib/hooks';

export default function SessionsPage() {
  const { appId } = useApp();
  const download = useDownloadBroadcastsCsv();
  const [page, setPage] = useState(1);
  const [xref, setXref] = useState('');
  const [applied, setApplied] = useState('');

  const { data, isLoading, error, isFetching } = useSessions({
    page,
    ...(applied ? { xref: applied } : {}),
  });
  const sessions = data?.data ?? [];

  return (
    <>
      <PageHead
        title="Sessions"
        subtitle="One session per broadcast request, fanned out to every address."
        actions={
          <Button
            variant="outline"
            disabled={download.isPending}
            onClick={() => download.mutate(undefined)}
          >
            {download.isPending ? <Loader2 className="animate-spin" /> : <Download />}
            Export all as CSV
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        <ErrorNotice error={download.error} />

        <Card>
          <CardHeader>
            <div>
              <CardTitle>All sessions</CardTitle>
              <CardDescription>Newest first.</CardDescription>
            </div>
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setPage(1);
                setApplied(xref.trim());
              }}
            >
              <Input
                value={xref}
                onChange={(e) => setXref(e.target.value)}
                placeholder="Filter by xref"
                aria-label="Filter by reference"
                className="w-48"
              />
              <Button type="submit" variant="outline" size="sm">
                Apply
              </Button>
              {applied ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setXref('');
                    setApplied('');
                    setPage(1);
                  }}
                >
                  <X /> Clear
                </Button>
              ) : null}
              {isFetching ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              ) : null}
            </form>
          </CardHeader>

          {isLoading ? (
            <TableSkeleton columns={7} />
          ) : error ? (
            <div className="p-4">
              <ErrorNotice error={error} />
            </div>
          ) : sessions.length === 0 ? (
            <Empty
              title="No sessions yet"
              hint="Send a broadcast and it will show up here with per-address delivery state."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Session</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead className="text-right">Recipients</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((session) => (
                    <TableRow key={session.cuid}>
                      <TableCell>
                        <CopyId value={session.cuid} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={session.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {session.triggerType}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {formatNumber(session.totalAddresses)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {session.xref || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDate(session.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" asChild>
                          <Link
                            href={appHref(appId as string, `sessions/${session.cuid}`)}
                          >
                            Open
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                page={page}
                onPage={setPage}
                meta={data?.meta}
                count={sessions.length}
              />
            </>
          )}
        </Card>
      </div>
    </>
  );
}
