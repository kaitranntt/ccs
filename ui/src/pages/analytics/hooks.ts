/**
 * Analytics Page Hooks
 *
 * Composite hook centralizing all data fetching and state for the analytics page.
 */

import { useState, useMemo, useCallback } from 'react';
import type { DateRange } from 'react-day-picker';
import { subDays, formatDistanceToNow } from 'date-fns';
import {
  useUsageSummary,
  useUsageTrends,
  useHourlyUsage,
  useModelUsage,
  useRefreshUsage,
  useUsageStatus,
  useSessions,
  type ModelUsage,
} from '@/hooks/use-usage';
import { useAccounts } from '@/hooks/use-accounts';
import { useProfiles } from '@/hooks/use-profiles';

const RECENT_SESSION_SAMPLE_LIMIT = 50;
const ANALYTICS_PROFILE_STORAGE_KEY = 'ccs.analytics.selectedProfile';
const ALL_PROFILES_VALUE = 'all';

export interface AnalyticsProfileOption {
  value: string;
  label: string;
  description: string;
  supported: boolean;
}

function readPersistedProfile(): string {
  if (typeof globalThis.localStorage === 'undefined') return ALL_PROFILES_VALUE;
  const profile = globalThis.localStorage.getItem(ANALYTICS_PROFILE_STORAGE_KEY);
  if (!profile || profile.startsWith('unsupported:')) return ALL_PROFILES_VALUE;
  return profile;
}

function persistSelectedProfile(profile: string): void {
  if (typeof globalThis.localStorage === 'undefined') return;
  if (profile === ALL_PROFILES_VALUE) {
    globalThis.localStorage.removeItem(ANALYTICS_PROFILE_STORAGE_KEY);
    return;
  }
  globalThis.localStorage.setItem(ANALYTICS_PROFILE_STORAGE_KEY, profile);
}

export function useAnalyticsPage() {
  // Default to last 30 days
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelUsage | null>(null);
  const [selectedProfile, setSelectedProfileState] = useState(readPersistedProfile);
  const [popoverPosition, setPopoverPosition] = useState<{ x: number; y: number } | null>(null);
  const [viewMode, setViewMode] = useState<'daily' | 'hourly'>('daily');
  const { data: accountsView } = useAccounts();
  const { data: apiProfiles } = useProfiles();

  // Refresh hook
  const refreshUsage = useRefreshUsage();

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshUsage();
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshUsage]);

  // Convert dates to API format - memoized to prevent unnecessary re-renders
  const apiOptions = useMemo(
    () => ({
      startDate: dateRange?.from,
      endDate: dateRange?.to,
      profile: selectedProfile === ALL_PROFILES_VALUE ? undefined : selectedProfile,
    }),
    [dateRange?.from, dateRange?.to, selectedProfile]
  );

  const profileOptions = useMemo<AnalyticsProfileOption[]>(() => {
    const accountNames = new Set(accountsView?.accounts.map((account) => account.name) ?? []);
    const options: AnalyticsProfileOption[] = [
      {
        value: ALL_PROFILES_VALUE,
        label: 'All profiles',
        description: 'Includes all analytics sources.',
        supported: true,
      },
      {
        value: 'default',
        label: 'Default Claude',
        description: 'Profile-scoped Claude JSONL data.',
        supported: true,
      },
      ...Array.from(accountNames)
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({
          value: name,
          label: name,
          description: 'Profile-scoped account data.',
          supported: true,
        })),
    ];

    for (const profile of apiProfiles?.profiles ?? []) {
      if (accountNames.has(profile.name) || profile.name === 'default') continue;
      options.push({
        value: `unsupported:${profile.name}`,
        label: profile.name,
        description: 'API profile usage is not yet attributed by stable profile.',
        supported: false,
      });
    }

    return options;
  }, [accountsView?.accounts, apiProfiles?.profiles]);

  // Fetch data
  const { data: summary, isLoading: isSummaryLoading } = useUsageSummary(apiOptions);
  const { data: trends, isLoading: isTrendsLoading } = useUsageTrends(apiOptions);
  const { data: hourlyData, isLoading: isHourlyLoading } = useHourlyUsage(apiOptions);
  const { data: models, isLoading: isModelsLoading } = useModelUsage(apiOptions);
  const { data: sessions, isLoading: isSessionsLoading } = useSessions({
    ...apiOptions,
    limit: RECENT_SESSION_SAMPLE_LIMIT,
  });
  const { data: status } = useUsageStatus();

  // Handle "24H" preset click
  const handleTodayClick = useCallback(() => {
    const now = new Date();
    setDateRange({ from: subDays(now, 1), to: now });
    setViewMode('hourly');
  }, []);

  // Handle date range changes from DateRangeFilter
  const handleDateRangeChange = useCallback((range: DateRange | undefined) => {
    setDateRange(range);
    setViewMode('daily'); // Switch back to daily view for multi-day ranges
  }, []);

  const handleProfileChange = useCallback((profile: string) => {
    if (profile.startsWith('unsupported:')) return;
    setSelectedProfileState(profile);
    persistSelectedProfile(profile);
  }, []);

  const clearProfileFilter = useCallback(() => {
    setSelectedProfileState(ALL_PROFILES_VALUE);
    persistSelectedProfile(ALL_PROFILES_VALUE);
  }, []);

  // Selected-profile views deliberately exclude CLIProxy + native runtime data.
  // When the chosen profile yields zero totals, surface a banner instead of
  // letting the cards read "$0" silently.
  const isProfileScopedEmpty =
    selectedProfile !== ALL_PROFILES_VALUE &&
    !isSummaryLoading &&
    !!summary &&
    summary.totalTokens === 0 &&
    summary.totalCost === 0;

  // Format "Last updated" text
  const lastUpdatedText = useMemo(() => {
    if (!status?.lastFetch) return null;
    return formatDistanceToNow(new Date(status.lastFetch), { addSuffix: true });
  }, [status?.lastFetch]);

  // Handle model click for popover
  const handleModelClick = useCallback((model: ModelUsage, event: React.MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setPopoverPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    setSelectedModel(model);
  }, []);

  const handlePopoverClose = useCallback(() => {
    setSelectedModel(null);
    setPopoverPosition(null);
  }, []);

  return {
    // State
    dateRange,
    isRefreshing,
    viewMode,
    selectedProfile,
    profileOptions,
    selectedModel,
    popoverPosition,
    // Data
    summary,
    trends,
    hourlyData,
    models,
    sessions,
    status,
    // Loading states
    isSummaryLoading,
    isTrendsLoading,
    isHourlyLoading,
    isModelsLoading,
    isSessionsLoading,
    // Combined loading
    isLoading: isSummaryLoading || isTrendsLoading || isModelsLoading || isSessionsLoading,
    // Handlers
    handleRefresh,
    handleTodayClick,
    handleDateRangeChange,
    handleProfileChange,
    clearProfileFilter,
    handleModelClick,
    handlePopoverClose,
    // Derived UI flags
    isProfileScopedEmpty,
    // Text
    lastUpdatedText,
  };
}
