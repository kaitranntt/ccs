/**
 * Charts Grid Component
 *
 * Layout grid for analytics charts and cards.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UsageTrendChart } from '@/components/analytics/usage-trend-chart';
import { ModelBreakdownChart } from '@/components/analytics/model-breakdown-chart';
import { SessionStatsCard } from '@/components/analytics/session-stats-card';
import { CliproxyStatsCard } from '@/components/analytics/cliproxy-stats-card';
import { TrendingUp, PieChart } from 'lucide-react';
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

  return (
    <div className="flex flex-col min-h-0 gap-4">
      {/* Usage Trend Chart - Full Width */}
      <Card className="flex flex-col min-h-[300px] max-h-[500px] overflow-hidden shadow-sm">
        <CardHeader className="px-3 py-2 shrink-0">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            {viewMode === 'hourly' ? 'Last 24 Hours' : 'Usage Trends'}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0 flex-1 min-h-0">
          <UsageTrendChart
            data={viewMode === 'hourly' ? hourlyData || [] : trends || []}
            isLoading={viewMode === 'hourly' ? isHourlyLoading : isTrendsLoading}
            granularity={viewMode === 'hourly' ? 'hourly' : 'daily'}
          />
        </CardContent>
      </Card>

      {/* Bottom Row - fixed height with internal scroll per card */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-4 lg:h-[280px] shrink-0">
        {/* Cost by Model */}
        <CostByModelCard
          models={models}
          isLoading={isModelsLoading}
          onModelClick={onModelClick}
          privacyMode={privacyMode}
        />

        {/* Model Distribution */}
        <Card className="flex flex-col h-full min-h-0 shadow-sm lg:col-span-2">
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <PieChart className="w-4 h-4" />
              Model Usage
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-2 pt-0 flex-1 min-h-0 flex items-center justify-center">
            <ModelBreakdownChart
              data={models || []}
              isLoading={isModelsLoading}
              className="h-full w-full"
            />
          </CardContent>
        </Card>

        {/* Session Stats */}
        <SessionStatsCard data={sessions} isLoading={isSessionsLoading} className="lg:col-span-2" />

        {/* CLIProxy Stats */}
        <CliproxyStatsCard isLoading={isSummaryLoading} className="lg:col-span-2" />
      </div>
    </div>
  );
}
