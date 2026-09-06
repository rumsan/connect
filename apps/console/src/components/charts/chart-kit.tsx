'use client';

import { Table2, TrendingUp } from 'lucide-react';
import * as React from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Empty } from '../ui/feedback';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';

/**
 * Shared chart chrome and mark specs.
 *
 * Colours come from the `--viz-*` custom properties in global.css, which SVG
 * resolves natively in `fill`/`stroke`. Categorical slots 1–2 were validated
 * with the dataviz validator against this app's real card surfaces in both
 * modes; green/red was rejected for the delivered/failed pair because it fails
 * CVD separation (deuteranopia ΔE 4.1).
 */
export const VIZ = {
  surface: 'var(--viz-surface)',
  grid: 'var(--viz-grid)',
  axis: 'var(--viz-axis)',
  muted: 'var(--viz-muted)',
  series1: 'var(--viz-1)',
  series2: 'var(--viz-2)',
} as const;

/** Fixed mark specs — thin marks, hairline solid grid, wash-weight area fills. */
export const MARK = {
  /** Bars never fill their band; the leftover is air. */
  maxBarSize: 24,
  /** Rounded data-end, square at the baseline. */
  radiusY: [4, 4, 0, 0] as [number, number, number, number],
  radiusX: [0, 4, 4, 0] as [number, number, number, number],
  lineWidth: 2,
  dotRadius: 4,
  areaOpacity: 0.1,
  /** 2px of surface colour is what separates touching marks — not a border. */
  gap: 2,
} as const;

export const axisProps = {
  stroke: VIZ.axis,
  tickLine: false,
  axisLine: false,
  tick: { fill: VIZ.muted, fontSize: 11 },
} as const;

export const gridProps = {
  stroke: VIZ.grid,
  strokeDasharray: '0', // solid hairline; dashed grids read as thresholds
  vertical: false,
} as const;

export function compact(value: number) {
  if (Math.abs(value) >= 1000) {
    return new Intl.NumberFormat(undefined, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  }
  return value.toLocaleString();
}

type TooltipEntry = { name?: string; value?: number | string; color?: string };

/** Tooltip enhances; it never gates a value — the table view carries them all. */
export function VizTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      {label !== undefined ? (
        <div className="mb-1 font-medium text-popover-foreground">{label}</div>
      ) : null}
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-muted-foreground">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ background: entry.color }}
          />
          <span>{entry.name}</span>
          <span className="tabular ml-auto font-medium text-popover-foreground">
            {typeof entry.value === 'number'
              ? entry.value.toLocaleString()
              : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Legend keyed by a coloured mark beside text — text itself stays in ink. */
export function VizLegend({ series }: { series: { name: string; color: string }[] }) {
  if (series.length < 2) return null; // one series: the title already names it
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {series.map((s) => (
        <li key={s.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden
            className="size-2.5 rounded-sm"
            style={{ background: s.color }}
          />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

export type TableColumn = { key: string; label: string; numeric?: boolean };

/**
 * Chart card with a built-in table-view twin. Every chart ships one, so no
 * value is reachable only by hovering a coloured mark.
 */
export function ChartCard({
  title,
  description,
  legend,
  columns,
  rows,
  empty,
  isLoading,
  height = 260,
  children,
}: {
  title: string;
  description?: string;
  legend?: { name: string; color: string }[];
  /** Table-view twin. */
  columns: TableColumn[];
  rows: Record<string, string | number>[];
  empty?: string;
  isLoading?: boolean;
  height?: number;
  children: React.ReactNode;
}) {
  const [view, setView] = React.useState<'chart' | 'table'>('chart');
  const hasData = rows.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
          {legend && view === 'chart' ? (
            <div className="mt-1.5">
              <VizLegend series={legend} />
            </div>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={view === 'table'}
          onClick={() => setView((v) => (v === 'chart' ? 'table' : 'chart'))}
        >
          {view === 'chart' ? <Table2 /> : <TrendingUp />}
          {view === 'chart' ? 'Table' : 'Chart'}
        </Button>
      </CardHeader>

      {!hasData ? (
        <Empty title={empty ?? 'No data for this period'} />
      ) : view === 'table' ? (
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key} className={cn(c.numeric && 'text-right')}>
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i}>
                {columns.map((c) => (
                  <TableCell
                    key={c.key}
                    className={cn(c.numeric && 'tabular text-right')}
                  >
                    {typeof row[c.key] === 'number'
                      ? (row[c.key] as number).toLocaleString()
                      : row[c.key]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        // Height includes the x-axis band so the card never nests a scrollbar.
        <div
          className={cn('p-4 pt-2 transition-opacity', isLoading && 'opacity-50')}
          style={{ height }}
        >
          {children}
        </div>
      )}
    </Card>
  );
}
