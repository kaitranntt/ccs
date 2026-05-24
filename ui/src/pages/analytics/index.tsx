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
import { ProfileScopedEmptyBanner } from './components/profile-scoped-empty-banner';

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
    selectedProfile,
    profileOptions,
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
    handleProfileChange,
    clearProfileFilter,
    isProfileScopedEmpty,
    selectedModel,
    popoverPosition,
    handlePopoverClose,
  } = useAnalyticsPage();

  const selectedProfileLabel =
    profileOptions.find((o) => o.value === selectedProfile)?.label ?? selectedProfile;

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-4 overflow-y-auto px-4 py-4">
      {/* Header */}
      <AnalyticsHeader
        dateRange={dateRange}
        onDateRangeChange={handleDateRangeChange}
        onTodayClick={handleTodayClick}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        lastUpdatedText={lastUpdatedText}
        viewMode={viewMode}
        selectedProfile={selectedProfile}
        profileOptions={profileOptions}
        onProfileChange={handleProfileChange}
      />

      {/* Empty-state banner + Summary Cards */}
      <div className="flex flex-col gap-4">
        {isProfileScopedEmpty && (
          <ProfileScopedEmptyBanner
            selectedProfileLabel={selectedProfileLabel}
            onShowAll={clearProfileFilter}
          />
        )}
        <UsageSummaryCards data={summary} isLoading={isSummaryLoading} />
      </div>

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
