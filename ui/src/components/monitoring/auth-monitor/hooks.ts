/**
 * Hooks for Auth Monitor data aggregation and state management
 */

import { useState, useMemo, useEffect } from 'react';
import { useCliproxyAuth } from '@/hooks/use-cliproxy';
import { useCliproxyStats } from '@/hooks/use-cliproxy-stats';
import { getProviderDisplayName } from '@/lib/provider-config';
import { getAccountStats } from '@/lib/cliproxy-account-stats';
import type { AuthStatus, OAuthAccount } from '@/lib/api-client';
import type { AccountRow, ProviderStats } from './types';
import { ACCOUNT_COLORS } from './utils';

export interface AuthMonitorData {
  accounts: AccountRow[];
  totalSuccess: number;
  totalFailure: number;
  totalRequests: number;
  providerStats: ProviderStats[];
  overallSuccessRate: number;
  isLoading: boolean;
  error: Error | null;
  timeSinceUpdate: string;
}

/** Hook for computing auth monitor data from CLIProxy auth and stats */
export function useAuthMonitorData(): AuthMonitorData {
  const { data, isLoading, error } = useCliproxyAuth();
  const { data: statsData, isLoading: statsLoading, dataUpdatedAt } = useCliproxyStats();
  const [timeSinceUpdate, setTimeSinceUpdate] = useState('');

  // Live countdown showing time since last data update
  useEffect(() => {
    if (!dataUpdatedAt) return;
    const updateTime = () => {
      const diff = Math.floor((Date.now() - dataUpdatedAt) / 1000);
      if (diff < 60) {
        setTimeSinceUpdate(`${diff}s ago`);
      } else {
        setTimeSinceUpdate(`${Math.floor(diff / 60)}m ago`);
      }
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [dataUpdatedAt]);

  // Transform auth status data into account rows
  const { accounts, totalSuccess, totalFailure, totalRequests, providerStats } = useMemo(() => {
    if (!data?.authStatus) {
      return {
        accounts: [] as AccountRow[],
        totalSuccess: 0,
        totalFailure: 0,
        totalRequests: 0,
        providerStats: [] as ProviderStats[],
      };
    }

    const accountsList: AccountRow[] = [];
    const providerMap = new Map<
      string,
      { success: number; failure: number; accounts: AccountRow[] }
    >();
    let tSuccess = 0;
    let tFailure = 0;
    let colorIndex = 0;

    data.authStatus.forEach((status: AuthStatus) => {
      const providerKey = status.provider;
      if (!providerMap.has(providerKey)) {
        providerMap.set(providerKey, { success: 0, failure: 0, accounts: [] });
      }
      const providerData = providerMap.get(providerKey);
      if (!providerData) return;

      status.accounts?.forEach((account: OAuthAccount) => {
        const realStats = getAccountStats(statsData, account);
        const success = realStats?.successCount ?? 0;
        const failure = realStats?.failureCount ?? 0;
        tSuccess += success;
        tFailure += failure;
        providerData.success += success;
        providerData.failure += failure;

        const row: AccountRow = {
          id: account.id,
          email: account.email || account.id,
          tokenFile: account.tokenFile,
          provider: status.provider,
          displayName: status.displayName,
          isDefault: account.isDefault,
          successCount: success,
          failureCount: failure,
          lastUsedAt: realStats?.lastUsedAt ?? account.lastUsedAt,
          color: ACCOUNT_COLORS[colorIndex % ACCOUNT_COLORS.length],
          projectId: account.projectId,
          paused: account.paused,
          tier: account.tier,
        };
        accountsList.push(row);
        providerData.accounts.push(row);
        colorIndex++;
      });
    });

    // Build provider stats array
    const providerStatsArr: ProviderStats[] = [];
    providerMap.forEach((pData, provider) => {
      if (pData.accounts.length === 0) return;
      providerStatsArr.push({
        provider,
        displayName: getProviderDisplayName(provider),
        totalRequests: pData.success + pData.failure,
        successCount: pData.success,
        failureCount: pData.failure,
        accountCount: pData.accounts.length,
        accounts: pData.accounts,
      });
    });
    providerStatsArr.sort((a, b) => b.totalRequests - a.totalRequests);

    return {
      accounts: accountsList,
      totalSuccess: tSuccess,
      totalFailure: tFailure,
      totalRequests: tSuccess + tFailure,
      providerStats: providerStatsArr,
    };
  }, [data?.authStatus, statsData]);

  const overallSuccessRate =
    totalRequests > 0 ? Math.round((totalSuccess / totalRequests) * 100) : 100;

  return {
    accounts,
    totalSuccess,
    totalFailure,
    totalRequests,
    providerStats,
    overallSuccessRate,
    isLoading: isLoading || statsLoading,
    error: error ?? null,
    timeSinceUpdate,
  };
}
