'use client';

import { Pause, Play, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { Empty, PageHead } from '../../../components/ui/feedback';
import { Input } from '../../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { LogEntry } from '../../../lib/types';
import { useLogStream, type ConnectionState } from '../../../lib/use-log-stream';
import { cn } from '../../../lib/utils';

/** Older lines are dropped: this is a tail, not an archive. */
const LIMIT = 2000;

const LEVELS = ['error', 'warn', 'log', 'debug', 'verbose'] as const;

const LEVEL_STYLE: Record<LogEntry['level'], string> = {
  error: 'text-destructive',
  warn: 'text-warning',
  log: 'text-foreground',
  debug: 'text-muted-foreground',
  verbose: 'text-muted-foreground',
};

const STATUS_LABEL: Record<ConnectionState, string> = {
  connecting: 'Connecting',
  live: 'Live',
  offline: 'Reconnecting',
};

function ConnectionBadge({ status }: { status: ConnectionState }) {
  return (
    <Badge variant={status === 'live' ? 'success' : 'warning'}>
      <span
        className={cn(
          'mr-1.5 size-1.5 rounded-full',
          status === 'live' ? 'bg-success' : 'bg-warning',
        )}
        aria-hidden
      />
      {STATUS_LABEL[status]}
    </Badge>
  );
}

/** `HH:MM:SS.mmm` — the date is noise when you are watching a live tail. */
function formatTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toTimeString().slice(0, 8) + `.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

export default function SystemLogsPage() {
  const [paused, setPaused] = useState(false);
  const [level, setLevel] = useState<'all' | LogEntry['level']>('all');
  const [search, setSearch] = useState('');

  const { entries, status, clear } = useLogStream({ paused, limit: LIMIT });

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (level !== 'all' && entry.level !== level) return false;
      if (!needle) return true;
      return (
        entry.message.toLowerCase().includes(needle) ||
        entry.context.toLowerCase().includes(needle)
      );
    });
  }, [entries, level, search]);

  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  // Follow the tail only while the viewer is already at the bottom, so
  // scrolling back to read something does not get yanked away.
  useEffect(() => {
    const node = scroller.current;
    if (node && pinned.current) node.scrollTop = node.scrollHeight;
  }, [visible]);

  return (
    <>
      <PageHead
        title="System logs"
        subtitle="Live output from the Connect API — every application, as it happens."
        actions={
          <>
            <ConnectionBadge status={status} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPaused((value) => !value)}
            >
              {paused ? <Play /> : <Pause />}
              {paused ? 'Resume' : 'Pause'}
            </Button>
            <Button variant="outline" size="sm" onClick={clear}>
              <Trash2 />
              Clear
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b p-3">
          <Select
            value={level}
            onValueChange={(value) => setLevel(value as typeof level)}
          >
            <SelectTrigger className="w-36" aria-label="Level">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All levels</SelectItem>
              {LEVELS.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            className="w-64"
            placeholder="Filter by message or context…"
            aria-label="Filter logs"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <span className="ml-auto text-sm text-muted-foreground">
            {visible.length === entries.length
              ? `${entries.length} lines`
              : `${visible.length} of ${entries.length} lines`}
            {paused ? ' · paused' : ''}
          </span>
        </div>

        <div
          ref={scroller}
          onScroll={(event) => {
            const node = event.currentTarget;
            pinned.current =
              node.scrollHeight - node.scrollTop - node.clientHeight < 40;
          }}
          className="h-[65vh] overflow-auto bg-muted/30 p-3 font-mono text-xs leading-relaxed"
          role="log"
          aria-live="polite"
        >
          {visible.length === 0 ? (
            <Empty
              title={entries.length ? 'Nothing matches' : 'Waiting for output'}
              hint={
                entries.length
                  ? 'No lines match the current filter.'
                  : 'Lines appear here as the Connect API logs them.'
              }
            />
          ) : (
            visible.map((entry, index) => (
              <div
                key={`${entry.timestamp}-${index}`}
                className="flex gap-2 whitespace-pre-wrap break-words py-0.5"
              >
                <span className="shrink-0 text-muted-foreground">
                  {formatTime(entry.timestamp)}
                </span>
                <span
                  className={cn(
                    'w-14 shrink-0 uppercase',
                    LEVEL_STYLE[entry.level],
                  )}
                >
                  {entry.level}
                </span>
                <span className="shrink-0 text-primary">[{entry.context}]</span>
                <span className={LEVEL_STYLE[entry.level]}>{entry.message}</span>
              </div>
            ))
          )}
        </div>
      </Card>
    </>
  );
}
