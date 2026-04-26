/**
 * Analytics Controls Component
 *
 * Date filter, 24H toggle, refresh, and last-updated text.
 * Exported as AnalyticsControls (slim) for use in PageHeader.actions slot.
 * The h1/subtitle have moved to PageHeader; this component is controls-only.
 */

import type { ReactNode } from 'react';
import type { DateRange } from 'react-day-picker';
import { subDays, startOfMonth } from 'date-fns';
import { Button } from '@/components/ui/button';
import { DateRangeFilter } from '@/components/analytics/date-range-filter';
import { useTranslation } from 'react-i18next';

interface AnalyticsControlsProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  onTodayClick: () => void;
  viewMode: 'daily' | 'hourly';
  lastUpdatedText: string | null;
  /** Refresh button node — passed from parent so controls stay pure. */
  refreshButton: ReactNode;
}

export function AnalyticsControls({
  dateRange,
  onDateRangeChange,
  onTodayClick,
  viewMode,
  lastUpdatedText,
  refreshButton,
}: AnalyticsControlsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant={viewMode === 'hourly' ? 'default' : 'outline'}
        size="sm"
        className="h-8"
        onClick={onTodayClick}
      >
        24H
      </Button>
      <DateRangeFilter
        className="flex-wrap"
        value={dateRange}
        onChange={onDateRangeChange}
        presets={[
          { label: '7D', range: { from: subDays(new Date(), 7), to: new Date() } },
          { label: '30D', range: { from: subDays(new Date(), 30), to: new Date() } },
          {
            label: t('analytics.month'),
            range: { from: startOfMonth(new Date()), to: new Date() },
          },
          { label: t('analytics.allTime'), range: { from: undefined, to: new Date() } },
        ]}
      />
      {lastUpdatedText && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {t('analytics.updated', { value: lastUpdatedText })}
        </span>
      )}
      {refreshButton}
    </div>
  );
}
