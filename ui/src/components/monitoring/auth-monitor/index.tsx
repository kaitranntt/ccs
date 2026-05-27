/**
 * Auth Monitor Component with Account Flow Visualization
 * Shows request flow from accounts to providers using custom SVG bezier curves
 * Uses glass panel aesthetic with hover interactions and glow effects
 */

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { STATUS_COLORS } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { AccountFlowViz } from '@/components/account-flow-viz';
import { usePrivacy } from '@/contexts/privacy-context';
import {
  useBulkPauseAccounts,
  useBulkResumeAccounts,
  usePauseAccount,
  useResumeAccount,
} from '@/hooks/use-cliproxy';
import { Activity, AlertTriangle, CheckCircle2, XCircle, Radio } from 'lucide-react';

import { useAuthMonitorData } from './hooks';
import { LivePulse } from './components/live-pulse';
import { ProviderCard } from './components/provider-card';
import { SummaryCard } from './components/summary-card';
import { getSuccessRate } from './utils';

const STORAGE_KEY = 'auth-monitor-selected-provider';

export function AuthMonitor() {
  const { t } = useTranslation();
  const {
    accounts,
    totalSuccess,
    totalFailure,
    totalRequests,
    providerStats,
    overallSuccessRate,
    isLoading,
    error,
    timeSinceUpdate,
  } = useAuthMonitorData();

  const { privacyMode } = usePrivacy();

  // Persist selected provider in localStorage
  const [selectedProvider, setSelectedProviderState] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY);
    }
    return null;
  });

  // Wrapper to persist selection
  const setSelectedProvider = (provider: string | null) => {
    setSelectedProviderState(provider);
    if (provider) {
      localStorage.setItem(STORAGE_KEY, provider);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  // Effective provider: prefer saved (if still exists) > null (show grid)
  const effectiveProvider = useMemo(() => {
    if (selectedProvider && providerStats.some((p) => p.provider === selectedProvider)) {
      return selectedProvider;
    }
    return null;
  }, [selectedProvider, providerStats]);
  const [hoveredProvider, setHoveredProvider] = useState<string | null>(null);

  // Account control mutations for flow viz
  const pauseMutation = usePauseAccount();
  const resumeMutation = useResumeAccount();
  const bulkPauseMutation = useBulkPauseAccounts();
  const bulkResumeMutation = useBulkResumeAccounts();

  // Get selected provider data for detail view
  const selectedProviderData = effectiveProvider
    ? providerStats.find((ps) => ps.provider === effectiveProvider)
    : null;
  const displayedAccountCount = selectedProviderData?.accountCount ?? accounts.length;
  const displayedSuccess = selectedProviderData?.successCount ?? totalSuccess;
  const displayedFailure = selectedProviderData?.failureCount ?? totalFailure;
  const displayedTotalRequests = selectedProviderData?.totalRequests ?? totalRequests;
  const displayedSuccessRate = selectedProviderData
    ? getSuccessRate(selectedProviderData.successCount, selectedProviderData.failureCount)
    : overallSuccessRate;
  const showHighFailureGuidance =
    displayedAccountCount >= 5 && displayedFailure >= 20 && displayedSuccessRate < 50;

  const handlePauseToggle = (accountIds: string[], paused: boolean) => {
    if (
      !effectiveProvider ||
      pauseMutation.isPending ||
      resumeMutation.isPending ||
      bulkPauseMutation.isPending ||
      bulkResumeMutation.isPending
    ) {
      return;
    }

    if (accountIds.length > 1) {
      if (paused) {
        bulkPauseMutation.mutate({ provider: effectiveProvider, accountIds });
      } else {
        bulkResumeMutation.mutate({ provider: effectiveProvider, accountIds });
      }
      return;
    }

    const [accountId] = accountIds;
    if (!accountId) return;

    if (paused) {
      pauseMutation.mutate({ provider: effectiveProvider, accountId });
    } else {
      resumeMutation.mutate({ provider: effectiveProvider, accountId });
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border overflow-hidden font-mono text-[13px] bg-card/50 dark:bg-zinc-900/60 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="p-4 space-y-4">
          <div className="flex gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 flex-1 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || accounts.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden font-mono text-[13px] text-foreground bg-card/50 dark:bg-zinc-900/60 backdrop-blur-sm">
      {/* Enhanced Live Header with gradient glow */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-gradient-to-r from-emerald-500/5 via-transparent to-transparent dark:from-emerald-500/10">
        <div className="flex items-center gap-2">
          <LivePulse />
          <span className="text-xs font-semibold tracking-tight text-foreground">
            {t('authMonitorLive.live')}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {t('authMonitorLive.accountMonitor')}
          </span>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Radio className="w-3 h-3 animate-pulse" />
            <span>
              {timeSinceUpdate
                ? t('authMonitorLive.updated', { time: timeSinceUpdate })
                : t('authMonitorLive.updatedNow')}
            </span>
          </div>
          <span className="text-muted-foreground/50">|</span>
          <span>{t('authMonitor.accountsCount', { count: displayedAccountCount })}</span>
          <span className="font-mono">
            {displayedTotalRequests.toLocaleString()} {t('authMonitorLive.requestsLabel')}
          </span>
        </div>
      </div>

      {/* Summary Stats Row */}
      <div className="grid grid-cols-4 gap-3 p-4 border-b border-border bg-muted/20 dark:bg-zinc-900/30">
        <SummaryCard
          icon={<Activity className="w-4 h-4" />}
          label={t('authMonitor.accounts')}
          value={displayedAccountCount}
          color="var(--accent)"
        />
        <SummaryCard
          icon={<CheckCircle2 className="w-4 h-4" />}
          label={t('authMonitor.success')}
          value={displayedSuccess.toLocaleString()}
          color={STATUS_COLORS.success}
        />
        <SummaryCard
          icon={<XCircle className="w-4 h-4" />}
          label={t('authMonitor.failed')}
          value={displayedFailure.toLocaleString()}
          color={displayedFailure > 0 ? STATUS_COLORS.failed : undefined}
        />
        <SummaryCard
          icon={<Activity className="w-4 h-4" />}
          label={t('authMonitor.successRate')}
          value={`${displayedSuccessRate}%`}
          color={
            displayedSuccessRate === 100
              ? STATUS_COLORS.success
              : displayedSuccessRate >= 95
                ? STATUS_COLORS.degraded
                : STATUS_COLORS.failed
          }
        />
      </div>

      {showHighFailureGuidance && (
        <div className="flex items-start gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="space-y-1">
            <p className="font-semibold text-foreground">High CLIProxy failure rate detected</p>
            <p className="text-muted-foreground">
              Select the affected provider, pause failing accounts, then check{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono">ccs cliproxy routing</code>.
              For large Codex pools, prefer a smaller healthy active set and attach CLIProxy logs if
              failures continue.
            </p>
          </div>
        </div>
      )}

      {/* Flow Visualization */}
      <div className="relative overflow-hidden">
        {selectedProviderData ? (
          <AccountFlowViz
            providerData={selectedProviderData}
            onBack={() => setSelectedProvider(null)}
            onPauseToggle={handlePauseToggle}
            isPausingAccount={
              pauseMutation.isPending ||
              resumeMutation.isPending ||
              bulkPauseMutation.isPending ||
              bulkResumeMutation.isPending
            }
          />
        ) : (
          <div className="p-6">
            {/* TODO i18n: missing key for "Request Distribution by Provider" */}
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-4">
              Request Distribution by Provider
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {providerStats.map((ps) => (
                <ProviderCard
                  key={ps.provider}
                  stats={ps}
                  isHovered={hoveredProvider === ps.provider}
                  privacyMode={privacyMode}
                  onSelect={() => setSelectedProvider(ps.provider)}
                  onMouseEnter={() => setHoveredProvider(ps.provider)}
                  onMouseLeave={() => setHoveredProvider(null)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Re-export types for barrel
export type { AccountRow, ProviderStats } from './types';
