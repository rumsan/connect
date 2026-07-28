'use client';

import { Loader2, RotateCw } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '../../../../components/ui/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../components/ui/card';
import {
  Empty,
  ErrorNotice,
  Json,
  PageHead,
  Pagination,
  StatusBadge,
  formatDate,
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
import { useLogs } from '../../../../lib/hooks';

export default function LogsPage() {
  const { appId } = useApp();
  const [page, setPage] = useState(1);
  const { data, isLoading, error, isFetching, refetch } = useLogs({ page });
  const logs = data?.data ?? [];

  return (
    <>
      <PageHead
        title="Delivery logs"
        subtitle="Raw attempt history — the first place to look when a message did not land."
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Delivery attempts</CardTitle>
            <CardDescription>
              Every attempt across every session for this application.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? <Loader2 className="animate-spin" /> : <RotateCw />}
            Refresh
          </Button>
        </CardHeader>

        {isLoading ? (
          <TableSkeleton columns={6} />
        ) : error ? (
          <div className="p-4">
            <ErrorNotice error={error} />
          </div>
        ) : logs.length === 0 ? (
          <Empty
            title="No delivery logs yet"
            hint="Logs appear as soon as the first broadcast is attempted."
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Attempt</TableHead>
                  <TableHead>Session</TableHead>
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
                    <TableCell className="font-mono text-xs">
                      <Link
                        href={appHref(appId as string, `sessions/${log.session}`)}
                        className="text-primary hover:underline"
                      >
                        {log.session?.slice(0, 10)}…
                      </Link>
                    </TableCell>
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
            <Pagination
              page={page}
              onPage={setPage}
              meta={data?.meta}
              count={logs.length}
            />
          </>
        )}
      </Card>
    </>
  );
}
