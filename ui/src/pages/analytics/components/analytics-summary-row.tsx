/**
 * Analytics Summary Row
 *
 * Renders the 5-metric summary (total tokens, cost, cache, input cost, output cost)
 * inside a MonitorGrid / MonitorCard layout that matches the new design system shell.
 * Replaces the standalone UsageSummaryCards on the analytics page.
 *
 * Because analytics exposes 5 hero metrics (> 4), we use a single full-width
 * MonitorCard wrapping a 5-col responsive grid rather than KpiRow (max 4).
 */

import { DollarSign, Database, FileText, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { MonitorGrid, MonitorCard } from '@/components/monitor-layout/monitor-grid';
import { cn } from '@/lib/utils';
import { usePrivacy, PRIVACY_BLUR_CLASS } from '@/contexts/privacy-context';
import { useTranslation } from 'react-i18next';
import type { UsageSummary } from '@/hooks/use-usage';

interface AnalyticsSummaryRowProps {
  data?: UsageSummary;
  isLoading?: boolean;
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

interface StatTileProps {
  label: string;
  value: string;
  subtitle: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  blurred: boolean;
  loading?: boolean;
}

function StatTile({
  label,
  value,
  subtitle,
  icon: Icon,
  iconColor,
  iconBg,
  blurred,
  loading,
}: StatTileProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-1.5 min-w-0">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-2.5 w-24" />
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-2 min-w-0">
      <div className="min-w-0 space-y-0.5">
        <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
        <p className={cn('text-xl font-bold truncate tabular-nums', blurred && PRIVACY_BLUR_CLASS)}>
          {value}
        </p>
        <p
          className={cn(
            'text-[10px] text-muted-foreground truncate',
            blurred && PRIVACY_BLUR_CLASS
          )}
        >
          {subtitle}
        </p>
      </div>
      <div className={cn('p-2 rounded-lg shrink-0 mt-0.5', iconBg)}>
        <Icon className={cn('h-4 w-4', iconColor)} />
      </div>
    </div>
  );
}

export function AnalyticsSummaryRow({ data, isLoading }: AnalyticsSummaryRowProps) {
  const { privacyMode } = usePrivacy();
  const { t } = useTranslation();

  const cacheCost =
    (data?.tokenBreakdown?.cacheCreation?.cost ?? 0) + (data?.tokenBreakdown?.cacheRead?.cost ?? 0);
  const cacheCostPercent = data?.totalCost ? Math.round((cacheCost / data.totalCost) * 100) : 0;

  const tiles: Omit<StatTileProps, 'blurred' | 'loading'>[] = [
    {
      label: t('analyticsSummary.totalTokens'),
      value: formatNumber(data?.totalTokens ?? 0),
      subtitle: t('analyticsSummary.totalTokensSubtitle', {
        input: formatNumber(data?.totalInputTokens ?? 0),
        output: formatNumber(data?.totalOutputTokens ?? 0),
      }),
      icon: FileText,
      iconColor: 'text-blue-600',
      iconBg: 'bg-blue-100 dark:bg-blue-900/20',
    },
    {
      label: t('analyticsSummary.totalCost'),
      value: `$${(data?.totalCost ?? 0).toFixed(2)}`,
      subtitle: t('analyticsSummary.totalCostSubtitle', {
        value: data?.averageCostPerDay?.toFixed(2) ?? '0.00',
      }),
      icon: DollarSign,
      iconColor: 'text-green-600',
      iconBg: 'bg-green-100 dark:bg-green-900/20',
    },
    {
      label: t('analyticsSummary.cacheTokens'),
      value: formatNumber(data?.totalCacheTokens ?? 0),
      subtitle: t('analyticsSummary.cacheTokensSubtitle', {
        cost: cacheCost.toFixed(2),
        percent: cacheCostPercent,
      }),
      icon: Database,
      iconColor: 'text-cyan-600',
      iconBg: 'bg-cyan-100 dark:bg-cyan-900/20',
    },
    {
      label: t('analyticsSummary.inputCost'),
      value: `$${(data?.tokenBreakdown?.input?.cost ?? 0).toFixed(2)}`,
      subtitle: t('analyticsSummary.tokensSubtitle', {
        value: formatNumber(data?.tokenBreakdown?.input?.tokens ?? 0),
      }),
      icon: ArrowDownRight,
      iconColor: 'text-purple-600',
      iconBg: 'bg-purple-100 dark:bg-purple-900/20',
    },
    {
      label: t('analyticsSummary.outputCost'),
      value: `$${(data?.tokenBreakdown?.output?.cost ?? 0).toFixed(2)}`,
      subtitle: t('analyticsSummary.tokensSubtitle', {
        value: formatNumber(data?.tokenBreakdown?.output?.tokens ?? 0),
      }),
      icon: ArrowUpRight,
      iconColor: 'text-orange-600',
      iconBg: 'bg-orange-100 dark:bg-orange-900/20',
    },
  ];

  // 5 tiles × span-2 = 10 cols in a 12-col grid → single row (consistent between
  // loading and loaded states, prevents layout shift).
  return (
    <MonitorGrid>
      {tiles.map((tile, i) => (
        <MonitorCard key={i} span={2}>
          <StatTile {...tile} blurred={privacyMode} loading={isLoading} />
        </MonitorCard>
      ))}
    </MonitorGrid>
  );
}
