/**
 * Analytics Page
 *
 * Displays Claude Code usage analytics with charts.
 * Features trend charts, model breakdown, cost analysis, and anomaly detection.
 */

import { useRef } from 'react';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { UsageSummaryCards } from '@/components/analytics/usage-summary-cards';
import { ModelDetailsContent } from '@/components/analytics/model-details-content';
import { useAnalyticsPage } from './hooks';
import { AnalyticsHeader } from './components/analytics-header';
import { ChartsGrid } from './components/charts-grid';

export function AnalyticsPage() {
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
    <div className="flex flex-col h-full overflow-hidden px-4 pt-4 pb-6 gap-4">
      {/* Header */}
      <AnalyticsHeader
        dateRange={dateRange}
        onDateRangeChange={handleDateRangeChange}
        onTodayClick={handleTodayClick}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        lastUpdatedText={lastUpdatedText}
        viewMode={viewMode}
      />

      {/* Summary Cards */}
      <UsageSummaryCards data={summary} isLoading={isSummaryLoading} />

      {/* Charts Grid */}
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

      {/* Model Details Popover - positioned at cursor */}
      <Popover open={!!selectedModel} onOpenChange={(open) => !open && handlePopoverClose()}>
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
    </div>
  );
}

// Re-export skeleton for route-level loading
export { AnalyticsSkeleton } from './components/analytics-skeleton';
