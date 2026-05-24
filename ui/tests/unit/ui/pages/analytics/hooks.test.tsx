import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAnalyticsPage } from '@/pages/analytics/hooks';
import { AllProviders } from '@tests/setup/test-utils';

const usageMocks = vi.hoisted(() => ({
  useUsageSummary: vi.fn(() => ({ data: undefined, isLoading: false })),
  useUsageTrends: vi.fn(() => ({ data: undefined, isLoading: false })),
  useHourlyUsage: vi.fn(() => ({ data: undefined, isLoading: false })),
  useModelUsage: vi.fn(() => ({ data: undefined, isLoading: false })),
  useRefreshUsage: vi.fn(() => vi.fn()),
  useUsageStatus: vi.fn(() => ({ data: { lastFetch: null } })),
  useSessions: vi.fn(() => ({ data: undefined, isLoading: false })),
}));

vi.mock('@/hooks/use-usage', () => usageMocks);
vi.mock('@/hooks/use-accounts', () => ({
  useAccounts: vi.fn(() => ({
    data: { accounts: [{ name: 'work' }], default: 'work' },
    isLoading: false,
  })),
}));
vi.mock('@/hooks/use-profiles', () => ({
  useProfiles: vi.fn(() => ({ data: { profiles: [] }, isLoading: false })),
}));

describe('useAnalyticsPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.values(usageMocks).forEach((mock) => mock.mockClear());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('restores the persisted selected profile and passes it to analytics queries', () => {
    vi.spyOn(globalThis.localStorage, 'getItem').mockImplementation((key) =>
      key === 'ccs.analytics.selectedProfile' ? 'work' : null
    );

    renderHook(() => useAnalyticsPage(), {
      wrapper: AllProviders,
    });

    expect(usageMocks.useUsageSummary).toHaveBeenCalledWith(
      expect.objectContaining({ profile: 'work' })
    );
    expect(usageMocks.useUsageTrends).toHaveBeenCalledWith(
      expect.objectContaining({ profile: 'work' })
    );
    expect(usageMocks.useModelUsage).toHaveBeenCalledWith(
      expect.objectContaining({ profile: 'work' })
    );
  });

  it('requests a broader recent session sample instead of the old 3-session slice', () => {
    renderHook(() => useAnalyticsPage(), {
      wrapper: AllProviders,
    });

    expect(usageMocks.useSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 50,
      })
    );
    expect(usageMocks.useSessions).not.toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 3,
      })
    );
  });

  describe('isProfileScopedEmpty', () => {
    const zeroSummary = {
      totalTokens: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheTokens: 0,
      totalCacheCreationTokens: 0,
      totalCacheReadTokens: 0,
      totalCost: 0,
      tokenBreakdown: {
        input: { tokens: 0, cost: 0 },
        output: { tokens: 0, cost: 0 },
        cacheCreation: { tokens: 0, cost: 0 },
        cacheRead: { tokens: 0, cost: 0 },
      },
      totalDays: 0,
      averageTokensPerDay: 0,
      averageCostPerDay: 0,
    };

    it('is false on All profiles even when totals are zero', () => {
      vi.spyOn(globalThis.localStorage, 'getItem').mockReturnValue(null);
      usageMocks.useUsageSummary.mockReturnValueOnce({ data: zeroSummary, isLoading: false });
      const { result } = renderHook(() => useAnalyticsPage(), { wrapper: AllProviders });
      expect(result.current.selectedProfile).toBe('all');
      expect(result.current.isProfileScopedEmpty).toBe(false);
    });

    it('is true when a specific profile is selected and totals are zero', () => {
      vi.spyOn(globalThis.localStorage, 'getItem').mockImplementation((key) =>
        key === 'ccs.analytics.selectedProfile' ? 'work' : null
      );
      usageMocks.useUsageSummary.mockReturnValueOnce({ data: zeroSummary, isLoading: false });

      const { result } = renderHook(() => useAnalyticsPage(), { wrapper: AllProviders });
      expect(result.current.isProfileScopedEmpty).toBe(true);
    });

    it('is false while the summary is still loading', () => {
      vi.spyOn(globalThis.localStorage, 'getItem').mockImplementation((key) =>
        key === 'ccs.analytics.selectedProfile' ? 'work' : null
      );
      usageMocks.useUsageSummary.mockReturnValueOnce({ data: undefined, isLoading: true });

      const { result } = renderHook(() => useAnalyticsPage(), { wrapper: AllProviders });
      expect(result.current.isProfileScopedEmpty).toBe(false);
    });

    it('is false when totals are non-zero for a specific profile', () => {
      vi.spyOn(globalThis.localStorage, 'getItem').mockImplementation((key) =>
        key === 'ccs.analytics.selectedProfile' ? 'work' : null
      );
      usageMocks.useUsageSummary.mockReturnValueOnce({
        data: { ...zeroSummary, totalTokens: 100, totalCost: 0.5 },
        isLoading: false,
      });

      const { result } = renderHook(() => useAnalyticsPage(), { wrapper: AllProviders });
      expect(result.current.isProfileScopedEmpty).toBe(false);
    });

    it('clearProfileFilter resets selection to All profiles and removes it from storage', () => {
      vi.spyOn(globalThis.localStorage, 'getItem').mockImplementation((key) =>
        key === 'ccs.analytics.selectedProfile' ? 'work' : null
      );
      const removeSpy = vi.spyOn(globalThis.localStorage, 'removeItem');

      const { result, rerender } = renderHook(() => useAnalyticsPage(), { wrapper: AllProviders });
      expect(result.current.selectedProfile).toBe('work');

      result.current.clearProfileFilter();
      rerender();

      expect(result.current.selectedProfile).toBe('all');
      expect(removeSpy).toHaveBeenCalledWith('ccs.analytics.selectedProfile');
    });
  });
});
