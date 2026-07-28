'use client';

import {
  ArrowLeft,
  ChevronRight,
  FileText,
  LayoutGrid,
  LayoutDashboard,
  Send,
  Boxes,
  ListOrdered,
  Radio,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { appHref, useApp } from '../lib/app-context';
import { useApplications } from '../lib/hooks';
import { cn } from '../lib/utils';

/** Shown when no application is open. */
const GLOBAL_NAV = [
  { href: '/', Icon: LayoutDashboard, title: 'Dashboard' },
  { href: '/apps', Icon: LayoutGrid, title: 'Applications' },
];

/** Shown while inside `/apps/[cuid]/…` — scoped to that one application. */
const APP_NAV = [
  { suffix: '', Icon: LayoutDashboard, title: 'Overview' },
  { suffix: 'transports', Icon: Radio, title: 'Transports' },
  { suffix: 'templates', Icon: FileText, title: 'Templates' },
  { suffix: 'broadcasts', Icon: Send, title: 'Send broadcast' },
  { suffix: 'sessions', Icon: ListOrdered, title: 'Sessions' },
  { suffix: 'logs', Icon: Boxes, title: 'Delivery logs' },
  { suffix: 'usage', Icon: Wallet, title: 'Usage & credits' },
];

function NavLink({
  href,
  Icon,
  title,
  active,
}: {
  href: string;
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="size-4 shrink-0" />
      {title}
    </Link>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const { appId } = useApp();
  const { data } = useApplications();
  const app = data?.data?.find((a) => a.cuid === appId);

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-4 border-r bg-card p-3 md:sticky md:top-0 md:h-screen md:overflow-y-auto">
      <Link href="/" className="flex items-center gap-2 px-1.5 py-1 font-semibold">
        <span className="grid size-7 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          RC
        </span>
        Connect Console
      </Link>

      {appId ? (
        <>
          <Link
            href="/apps"
            className="flex items-center gap-1.5 px-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> All applications
          </Link>

          <div className="rounded-md bg-muted px-2.5 py-2">
            <div className="truncate text-sm font-semibold" title={app?.name}>
              {app?.name ?? 'Application'}
            </div>
            <div className="truncate font-mono text-[11px] text-muted-foreground">
              {appId}
            </div>
          </div>

          <nav className="flex flex-col gap-0.5" aria-label="Application">
            {APP_NAV.map(({ suffix, Icon, title }) => {
              const href = appHref(appId, suffix);
              const active = suffix
                ? pathname.startsWith(href)
                : pathname === href;
              return (
                <NavLink key={title} href={href} Icon={Icon} title={title} active={active} />
              );
            })}
          </nav>
        </>
      ) : (
        <nav className="flex flex-col gap-0.5" aria-label="Main">
          {GLOBAL_NAV.map(({ href, Icon, title }) => (
            <NavLink
              key={href}
              href={href}
              Icon={Icon}
              title={title}
              active={href === '/' ? pathname === '/' : pathname.startsWith(href)}
            />
          ))}
        </nav>
      )}
    </aside>
  );
}

function Breadcrumb() {
  const pathname = usePathname();
  const { appId } = useApp();
  const { data } = useApplications();
  const app = data?.data?.find((a) => a.cuid === appId);

  if (!appId) {
    return (
      <span className="text-sm text-muted-foreground">
        {pathname === '/' ? 'Dashboard' : 'Applications'}
      </span>
    );
  }

  const section = APP_NAV.find(
    (item) => item.suffix && pathname.startsWith(appHref(appId, item.suffix)),
  );

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
      <Link href="/apps" className="text-muted-foreground hover:text-foreground">
        Applications
      </Link>
      <ChevronRight className="size-3.5 text-muted-foreground" />
      <Link
        href={appHref(appId)}
        className={cn(
          section ? 'text-muted-foreground hover:text-foreground' : 'font-medium',
        )}
      >
        {app?.name ?? 'Application'}
      </Link>
      {section ? (
        <>
          <ChevronRight className="size-3.5 text-muted-foreground" />
          <span className="font-medium">{section.title}</span>
        </>
      ) : null}
    </nav>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b bg-card px-6 py-3">
          <Breadcrumb />
        </header>
        <main id="main" className="w-full max-w-[1400px] p-6 pb-16">
          {children}
        </main>
      </div>
    </div>
  );
}
