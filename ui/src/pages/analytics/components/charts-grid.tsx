/**
 * Charts Grid Component
 *
 * Monitor archetype grid — usage trend, model breakdown, sessions, CLIProxy stats,
 * and cost-by-model rendered inside a MonitorGrid.
 *
 * SessionStatsCard and CliproxyStatsCard own their own Card shells, so they are
 * placed directly in the grid via col-span wrapper divs instead of MonitorCard.
 */

import { TrendingUp, PieChart } from 'lucide-react';
import { MonitorGrid, MonitorCard } from '@/components/monitor-layout/monitor-grid';
import { UsageTrendChart } from '@/components/analytics/usage-trend-chart';
import { ModelBreakdownChart } from '@/components/analytics/model-breakdown-chart';
import { SessionStatsCard } from '@/components/analytics/session-stats-card';
import { CliproxyStatsCard } from '@/components/analytics/cliproxy-stats-card';
import { usePrivacy } from '@/contexts/privacy-context';
import { CostByModelCard } from './cost-by-model-card';
import type { ModelUsage, PaginatedSessions, DailyUsage, HourlyUsage } from '@/hooks/use-usage';

interface ChartsGridProps {
  viewMode: 'daily' | 'hourly';
  trends: DailyUsage[] | undefined;
  hourlyData: HourlyUsage[] | undefined;
  models: ModelUsage[] | undefined;
  sessions: PaginatedSessions | undefined;
  isTrendsLoading: boolean;
  isHourlyLoading: boolean;
  isModelsLoading: boolean;
  isSessionsLoading: boolean;
  isSummaryLoading: boolean;
  onModelClick: (model: ModelUsage, event: React.MouseEvent) => void;
}

export function ChartsGrid({
  viewMode,
  trends,
  hourlyData,
  models,
  sessions,
  isTrendsLoading,
  isHourlyLoading,
  isModelsLoading,
  isSessionsLoading,
  isSummaryLoading,
  onModelClick,
}: ChartsGridProps) {
  const { privacyMode } = usePrivacy();

  const trendTitle = viewMode === 'hourly' ? 'Last 24 Hours' : 'Usage Trends';
  const trendData = viewMode === 'hourly' ? (hourlyData ?? []) : (trends ?? []);
  const trendLoading = viewMode === 'hourly' ? isHourlyLoading : isTrendsLoading;

  return (
    <MonitorGrid>
      {/* Usage Trend — full width */}
      <MonitorCard
        span={12}
        title={
          <span className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            {/* TODO i18n: add keys for "Last 24 Hours" / "Usage Trends" */}
            {trendTitle}
          </span>
        }
        className="min-h-[260px]"
      >
        <div className="h-52">
          <UsageTrendChart
            data={trendData}
            isLoading={trendLoading}
            granularity={viewMode === 'hourly' ? 'hourly' : 'daily'}
          />
        </div>
      </MonitorCard>

      {/* Cost by Model — 5/12 cols desktop; owns Card shell via headless=true */}
      <MonitorCard span={5} className="min-h-[220px] overflow-hidden p-0 gap-0">
        <CostByModelCard
          models={models}
          isLoading={isModelsLoading}
          onModelClick={onModelClick}
          privacyMode={privacyMode}
          headless
        />
      </MonitorCard>

      {/* Model Distribution pie — 3/12 cols desktop */}
      <MonitorCard
        span={3}
        title={
          <span className="flex items-center gap-2">
            <PieChart className="w-4 h-4" />
            {/* TODO i18n: add key for "Model Usage" */}
            Model Usage
          </span>
        }
        className="min-h-[220px]"
      >
        <div className="flex h-44 items-center justify-center">
          <ModelBreakdownChart
            data={models ?? []}
            isLoading={isModelsLoading}
            className="h-full w-full"
          />
        </div>
      </MonitorCard>

      {/*
       * SessionStatsCard + CliproxyStatsCard own their own Card shell.
       * Place them in col-span wrapper divs so MonitorGrid col-span classes apply
       * without the double-border from nesting inside MonitorCard.
       */}
      <div className="col-span-1 sm:col-span-2 lg:col-span-2 min-h-[220px]">
        <SessionStatsCard data={sessions} isLoading={isSessionsLoading} className="h-full" />
      </div>

      <div className="col-span-1 sm:col-span-2 lg:col-span-2 min-h-[220px]">
        <CliproxyStatsCard isLoading={isSummaryLoading} className="h-full" />
      </div>
    </MonitorGrid>
  );
}
