'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartCard,
  MARK,
  VIZ,
  VizTooltip,
  axisProps,
  compact,
  type TableColumn,
} from './chart-kit';

/**
 * Single-measure trend over time. One series, so no legend box — the card
 * title names what is plotted. Area fill is a 10% wash, never a solid block.
 */
export function TrendChart({
  title,
  description,
  data,
  dataKey,
  label,
  isLoading,
}: {
  title: string;
  description?: string;
  data: { date: string; [k: string]: string | number }[];
  dataKey: string;
  label: string;
  isLoading?: boolean;
}) {
  const columns: TableColumn[] = [
    { key: 'date', label: 'Date' },
    { key: dataKey, label, numeric: true },
  ];

  return (
    <ChartCard
      title={title}
      description={description}
      columns={columns}
      rows={data}
      isLoading={isLoading}
      empty="No activity in this period"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`fill-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={VIZ.series1} stopOpacity={MARK.areaOpacity} />
              <stop offset="100%" stopColor={VIZ.series1} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={VIZ.grid} vertical={false} />
          <XAxis dataKey="date" {...axisProps} minTickGap={24} />
          <YAxis {...axisProps} width={44} tickFormatter={compact} />
          <Tooltip content={<VizTooltip />} cursor={{ stroke: VIZ.axis }} />
          <Area
            type="monotone"
            dataKey={dataKey}
            name={label}
            stroke={VIZ.series1}
            strokeWidth={MARK.lineWidth}
            fill={`url(#fill-${dataKey})`}
            // 2px surface ring keeps end-dots legible where they cross the line.
            activeDot={{ r: MARK.dotRadius, strokeWidth: 2, stroke: VIZ.surface }}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/**
 * Magnitude across nominal categories — one hue for every bar. A value ramp
 * here would double-encode length as lightness and say nothing new.
 */
export function RankedBarChart({
  title,
  description,
  data,
  isLoading,
  valueLabel,
  categoryLabel,
}: {
  title: string;
  description?: string;
  data: { name: string; value: number }[];
  isLoading?: boolean;
  valueLabel: string;
  categoryLabel: string;
}) {
  const columns: TableColumn[] = [
    { key: 'name', label: categoryLabel },
    { key: 'value', label: valueLabel, numeric: true },
  ];

  return (
    <ChartCard
      title={title}
      description={description}
      columns={columns}
      rows={data}
      isLoading={isLoading}
      height={Math.max(200, data.length * 38 + 40)}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 32, bottom: 0, left: 0 }}
        >
          <CartesianGrid stroke={VIZ.grid} horizontal={false} />
          <XAxis type="number" {...axisProps} tickFormatter={compact} />
          <YAxis
            type="category"
            dataKey="name"
            {...axisProps}
            width={140}
            interval={0}
          />
          <Tooltip content={<VizTooltip />} cursor={{ fill: VIZ.grid, opacity: 0.4 }} />
          <Bar
            dataKey="value"
            name={valueLabel}
            fill={VIZ.series1}
            radius={MARK.radiusX}
            maxBarSize={MARK.maxBarSize}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/**
 * Delivered vs failed per item. Blue/orange rather than green/red: the
 * green/red pair fails CVD separation outright (deutan ΔE 4.1), so it cannot
 * carry the distinction even with secondary encoding.
 */
export function OutcomeChart({
  title,
  description,
  data,
  isLoading,
  categoryLabel,
}: {
  title: string;
  description?: string;
  data: { name: string; delivered: number; failed: number }[];
  isLoading?: boolean;
  categoryLabel: string;
}) {
  const columns: TableColumn[] = [
    { key: 'name', label: categoryLabel },
    { key: 'delivered', label: 'Delivered', numeric: true },
    { key: 'failed', label: 'Failed', numeric: true },
  ];

  return (
    <ChartCard
      title={title}
      description={description}
      legend={[
        { name: 'Delivered', color: VIZ.series1 },
        { name: 'Failed', color: VIZ.series2 },
      ]}
      columns={columns}
      rows={data}
      isLoading={isLoading}
      height={Math.max(200, data.length * 38 + 40)}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 32, bottom: 0, left: 0 }}
        >
          <CartesianGrid stroke={VIZ.grid} horizontal={false} />
          <XAxis type="number" {...axisProps} tickFormatter={compact} />
          <YAxis
            type="category"
            dataKey="name"
            {...axisProps}
            width={140}
            interval={0}
          />
          <Tooltip content={<VizTooltip />} cursor={{ fill: VIZ.grid, opacity: 0.4 }} />
          {/* The surface-coloured stroke is the 2px gap between segments —
              negative space, not a border drawn around the mark. */}
          <Bar
            dataKey="delivered"
            name="Delivered"
            stackId="outcome"
            fill={VIZ.series1}
            maxBarSize={MARK.maxBarSize}
            stroke={VIZ.surface}
            strokeWidth={MARK.gap}
          />
          <Bar
            dataKey="failed"
            name="Failed"
            stackId="outcome"
            fill={VIZ.series2}
            radius={MARK.radiusX}
            maxBarSize={MARK.maxBarSize}
            stroke={VIZ.surface}
            strokeWidth={MARK.gap}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
