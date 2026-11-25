/**
 * Usage Trend Chart Component
 *
 * Displays usage trends over time with tokens and cost.
 * Supports daily, hourly, and monthly granularity with interactive tooltips.
 * Respects privacy mode to blur sensitive data.
 */

import { useCallback, useMemo } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { DailyUsage, HourlyUsage } from '@/hooks/use-usage';
import { usePrivacy, PRIVACY_BLUR_CLASS } from '@/contexts/privacy-context';

type ChartData = DailyUsage | HourlyUsage;

interface UsageTrendChartProps {
  data: ChartData[];
  isLoading?: boolean;
  granularity?: 'daily' | 'monthly' | 'hourly';
  className?: string;
}

interface PrivacyTickProps {
  x?: number;
  y?: number;
  payload?: { value: string | number };
  isRight?: boolean;
  privacyMode: boolean;
}

function PrivacyTick({ x = 0, y = 0, payload, isRight, privacyMode }: PrivacyTickProps) {
  const rawValue = payload?.value ?? '';
  const displayValue = isRight ? `$${rawValue}` : formatNumber(Number(rawValue));

  return (
    <text
      x={x}
      y={y}
      dy={4}
      textAnchor={isRight ? 'start' : 'end'}
      fontSize={12}
      fill="currentColor"
      className={cn('fill-muted-foreground', privacyMode && 'blur-[4px]')}
    >
      {displayValue}
    </text>
  );
}

interface TooltipPayloadEntry {
  name?: string;
  value?: string | number;
  color?: string;
}

interface UsageTrendTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string | number;
  privacyMode: boolean;
}

function UsageTrendTooltip({ active, payload, label, privacyMode }: UsageTrendTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium mb-2">{label}</p>
      {payload.map((entry, index) => (
        <p
          key={index}
          className={cn('text-sm', privacyMode && PRIVACY_BLUR_CLASS)}
          style={{ color: entry.color }}
        >
          {entry.name}:{' '}
          {entry.name === 'Tokens' ? formatNumber(Number(entry.value) || 0) : `$${entry.value}`}
        </p>
      ))}
    </div>
  );
}

export function UsageTrendChart({
  data,
  isLoading,
  granularity = 'daily',
  className,
}: UsageTrendChartProps) {
  const { privacyMode } = usePrivacy();
  const { t } = useTranslation();

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // For hourly data, already sorted ascending from API
    const sortedData = data;

    return sortedData.map((item) => {
      // Handle hourly vs daily data format
      const timeKey = 'hour' in item ? item.hour : (item as DailyUsage).date;
      return {
        ...item,
        dateFormatted: formatTime(timeKey, granularity),
        costRounded: Number(item.cost.toFixed(4)),
      };
    });
  }, [data, granularity]);

  const renderLeftTick = useCallback(
    (props: Omit<PrivacyTickProps, 'isRight' | 'privacyMode'>) => (
      <PrivacyTick {...props} isRight={false} privacyMode={privacyMode} />
    ),
    [privacyMode]
  );

  const renderRightTick = useCallback(
    (props: Omit<PrivacyTickProps, 'isRight' | 'privacyMode'>) => (
      <PrivacyTick {...props} isRight={true} privacyMode={privacyMode} />
    ),
    [privacyMode]
  );

  const renderTooltip = useCallback(
    (props: { active?: boolean; payload?: unknown; label?: string | number }) => (
      <UsageTrendTooltip
        active={props.active}
        payload={props.payload as TooltipPayloadEntry[] | undefined}
        label={props.label}
        privacyMode={privacyMode}
      />
    ),
    [privacyMode]
  );

  if (isLoading) {
    return <Skeleton className={cn('h-full w-full', className)} />;
  }

  if (!data || data.length === 0) {
    return (
      <div className={cn('h-full flex items-center justify-center', className)}>
        <p className="text-muted-foreground">
          {granularity === 'hourly' ? t('analytics.noDailyUsage') : t('analytics.noUsageData')}
        </p>
      </div>
    );
  }

  return (
    <div className={cn('w-full h-full', className)}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <defs>
            <linearGradient id="tokenGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0080FF" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#0080FF" stopOpacity={0.1} />
            </linearGradient>
            <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#00C49F" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#00C49F" stopOpacity={0.1} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />

          <XAxis
            dataKey="dateFormatted"
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={{ className: 'stroke-muted' }}
          />

          <YAxis
            yAxisId="left"
            orientation="left"
            tick={renderLeftTick}
            tickLine={false}
            axisLine={{ className: 'stroke-muted' }}
          />

          <YAxis
            yAxisId="right"
            orientation="right"
            tick={renderRightTick}
            tickLine={false}
            axisLine={{ className: 'stroke-muted' }}
          />

          <Tooltip content={renderTooltip} />

          <Area
            yAxisId="left"
            type="monotone"
            dataKey="tokens"
            stroke="#0080FF"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#tokenGradient)"
            name="Tokens"
          />

          <Area
            yAxisId="right"
            type="monotone"
            dataKey="costRounded"
            stroke="#00C49F"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#costGradient)"
            name="Cost"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Helper functions
function formatTime(timeStr: string, granularity: 'daily' | 'monthly' | 'hourly'): string {
  if (granularity === 'hourly') {
    // Format: "YYYY-MM-DD HH:00" -> convert UTC to local time -> "HH:00"
    // Parse as UTC and format in local timezone
    const [datePart, timePart] = timeStr.split(' ');
    if (datePart && timePart) {
      // Create date in UTC: "2025-12-12 20:00" -> "2025-12-12T20:00:00Z"
      const utcDate = new Date(`${datePart}T${timePart}:00Z`);
      return format(utcDate, 'HH:mm');
    }
    return timeStr;
  }

  const date = new Date(timeStr);

  if (granularity === 'monthly') {
    return format(date, 'MMM yyyy');
  }

  // For daily, show shorter format
  return format(date, 'MMM dd');
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toLocaleString();
}
