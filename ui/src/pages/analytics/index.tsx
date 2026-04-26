/**
 * Analytics Page
 *
 * Monitor archetype: PageShell + PageHeader + MonitorLayout + MonitorGrid.
 * Displays Claude Code usage analytics — trends, model breakdown, cost, sessions.
 */

import { useRef } from 'react';
import { BarChart2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { ModelDetailsContent } from '@/components/analytics/model-details-content';
import { PageShell } from '@/components/page-shell/page-shell';
import { PageHeader } from '@/components/page-shell/page-header';
import { MonitorLayout } from '@/components/monitor-layout/monitor-layout';
import { useAnalyticsPage } from './hooks';
import { AnalyticsControls } from './components/analytics-header';
import { ChartsGrid } from './components/charts-grid';
import { AnalyticsSummaryRow } from './components/analytics-summary-row';
import { useTranslation } from 'react-i18next';

export function AnalyticsPage() {
  const { t } = useTranslation();
  const popoverAnchorRef = useRef<HTMLDivElement>(null);
  const {
    dateRange,
    handleDateRangeChange,
    handleTodayClick,
    handleRefresh,
    isRefreshing,
    lastUpdatedText,
    viewMode,
    summary,
    isSummaryLoading,
    trends,
    hourlyData,
    models,
    sessions,
    isTrendsLoading,
    isHourlyLoading,
    isModelsLoading,
    isSessionsLoading,
    handleModelClick,
    selectedModel,
    popoverPosition,
    handlePopoverClose,
  } = useAnalyticsPage();

  return (
    <PageShell>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-muted-foreground" />
            {t('analytics.title')}
          </span>
        }
        description={t('analytics.subtitle')}
        actions={
          <AnalyticsControls
            dateRange={dateRange}
            onDateRangeChange={handleDateRangeChange}
            onTodayClick={handleTodayClick}
            viewMode={viewMode}
            lastUpdatedText={lastUpdatedText}
            refreshButton={
              <Button
                variant="outline"
                size="sm"
                className="gap-2 h-8"
                onClick={() => void handleRefresh()}
                disabled={isRefreshing}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            }
          />
        }
      />

      <MonitorLayout>
        {/* Summary KPI row — 5 metrics, rendered inside MonitorLayout body */}
        <AnalyticsSummaryRow data={summary} isLoading={isSummaryLoading} />

        {/* Charts grid */}
        <ChartsGrid
          viewMode={viewMode}
          trends={trends}
          hourlyData={hourlyData}
          models={models}
          sessions={sessions}
          isTrendsLoading={isTrendsLoading}
          isHourlyLoading={isHourlyLoading}
          isModelsLoading={isModelsLoading}
          isSessionsLoading={isSessionsLoading}
          isSummaryLoading={isSummaryLoading}
          onModelClick={handleModelClick}
        />
      </MonitorLayout>

      {/* Model Details Popover - positioned at cursor */}
      <Popover
        open={!!selectedModel}
        onOpenChange={(open) => {
          if (!open) handlePopoverClose();
        }}
      >
        <PopoverAnchor asChild>
          <div
            ref={popoverAnchorRef}
            className="fixed pointer-events-none"
            style={{
              left: popoverPosition?.x ?? 0,
              top: popoverPosition?.y ?? 0,
              width: 1,
              height: 1,
            }}
          />
        </PopoverAnchor>
        <PopoverContent className="w-80 p-3" side="top" align="center">
          {selectedModel && <ModelDetailsContent model={selectedModel} />}
        </PopoverContent>
      </Popover>
    </PageShell>
  );
}

// Re-export skeleton for route-level loading
export { AnalyticsSkeleton } from './components/analytics-skeleton';
