'use client';

import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AppCard } from '../../../components/app-card';
import { CreateAppDialog } from '../../../components/create-app-dialog';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import {
  Empty,
  ErrorNotice,
  PageHead,
  SuccessNotice,
} from '../../../components/ui/feedback';
import { Input } from '../../../components/ui/input';
import { CardGridSkeleton } from '../../../components/ui/skeleton';
import { useApplications, useUsageForApps } from '../../../lib/hooks';
import type { CreateApplicationResult } from '../../../lib/types';

export default function ApplicationsPage() {
  const { data, isLoading, error } = useApplications();
  const [filter, setFilter] = useState('');
  const [created, setCreated] = useState<CreateApplicationResult | null>(null);

  const apps = useMemo(() => data?.data ?? [], [data]);
  const appIds = useMemo(() => apps.map((a) => a.cuid), [apps]);
  const usage = useUsageForApps(appIds);

  const visible = apps.filter((app) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return (
      app.name.toLowerCase().includes(q) ||
      (app.description ?? '').toLowerCase().includes(q) ||
      app.cuid.toLowerCase().includes(q)
    );
  });

  const totalsFor = (cuid: string) =>
    usage.data?.find((entry) => entry.appId === cuid)?.usage?.totals;

  return (
    <>
      <PageHead
        title="Applications"
        subtitle="Here is a list of all the applications registered with Connect."
        actions={
          <CreateAppDialog onCreated={setCreated}>
            <Button>
              <Plus /> New application
            </Button>
          </CreateAppDialog>
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

        <Card className="p-2">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter applications…"
            aria-label="Filter applications"
            className="border-0 shadow-none focus-visible:ring-0"
          />
        </Card>

        {isLoading ? (
          <CardGridSkeleton />
        ) : apps.length === 0 ? (
          <Card>
            <Empty
              title="No applications yet"
              hint="Create one to get an app id, then configure a transport and start sending."
              action={
                <CreateAppDialog onCreated={setCreated}>
                  <Button>
                    <Plus /> New application
                  </Button>
                </CreateAppDialog>
              }
            />
          </Card>
        ) : visible.length === 0 ? (
          <Card>
            <Empty title="No applications match that filter" />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((app) => (
              <AppCard
                key={app.cuid}
                app={app}
                totals={totalsFor(app.cuid)}
                loadingTotals={usage.isLoading}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
