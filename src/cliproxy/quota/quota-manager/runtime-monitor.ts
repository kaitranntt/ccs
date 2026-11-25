/**
 * Adaptive Runtime Quota Monitor (Active Session Polling)
 */

import { CLIProxyProvider } from '../../types';
import type { RuntimeMonitorConfig } from '../../../config/unified-config-types';
import { loadOrCreateUnifiedConfig } from '../../../config/config-loader-facade';
import {
  calculateQuotaPercent,
  fetchQuotaWithDedupInState,
  getCacheKey,
  isManagedQuotaProvider,
  type ManagedQuotaProvider,
  type QuotaManagerState,
  type RuntimeMonitorState,
} from './quota-cache-and-cooldown';
import { handleQuotaExhaustionInState } from './preflight-and-failover';

function scheduleNextPoll(
  managerState: QuotaManagerState,
  provider: ManagedQuotaProvider,
  accountId: string,
  monitorConfig: RuntimeMonitorConfig,
  intervalMs: number,
  state: RuntimeMonitorState
): void {
  const monitorKey = getCacheKey(provider, accountId);
  state.timer = setTimeout(async () => {
    if (state.stopped || managerState.activeRuntimeMonitors.get(monitorKey) !== state) return;

    try {
      const quota = await fetchQuotaWithDedupInState(managerState, provider, accountId);
      if (state.stopped || managerState.activeRuntimeMonitors.get(monitorKey) !== state) return;
      const avgQuota = calculateQuotaPercent(provider, quota);

      if (avgQuota === null) {
        scheduleNextPoll(
          managerState,
          provider,
          accountId,
          monitorConfig,
          monitorConfig.normal_interval_seconds * 1000,
          state
        );
        return;
      }

      if (avgQuota <= monitorConfig.exhaustion_threshold) {
        await handleQuotaExhaustionInState(
          managerState,
          provider,
          accountId,
          monitorConfig.cooldown_minutes
        );
        state.stopped = true;
        state.timer = null;
        managerState.activeRuntimeMonitors.delete(monitorKey);
        return;
      }

      if (avgQuota <= monitorConfig.warn_threshold) {
        if (!state.hasWarnedThisSession) {
          const { writeQuotaWarning } = await import('../../accounts/account-safety');
          writeQuotaWarning(accountId, avgQuota);
          state.hasWarnedThisSession = true;
        }
        scheduleNextPoll(
          managerState,
          provider,
          accountId,
          monitorConfig,
          monitorConfig.critical_interval_seconds * 1000,
          state
        );
        return;
      }

      scheduleNextPoll(
        managerState,
        provider,
        accountId,
        monitorConfig,
        monitorConfig.normal_interval_seconds * 1000,
        state
      );
    } catch {
      if (!state.stopped && managerState.activeRuntimeMonitors.get(monitorKey) === state) {
        scheduleNextPoll(managerState, provider, accountId, monitorConfig, intervalMs, state);
      }
    }
  }, intervalMs);

  if (state.timer && typeof state.timer === 'object' && 'unref' in state.timer) {
    state.timer.unref();
  }
}

export function startQuotaMonitorInState(
  managerState: QuotaManagerState,
  provider: CLIProxyProvider,
  accountId: string
): void {
  if (!isManagedQuotaProvider(provider)) return;

  const config = loadOrCreateUnifiedConfig();
  const quotaConfig = config.quota_management;

  if (!quotaConfig) return;
  if (quotaConfig.mode === 'manual') return;
  if (!quotaConfig.runtime_monitor?.enabled) return;

  const monitorConfig = quotaConfig.runtime_monitor;
  if (monitorConfig.warn_threshold <= monitorConfig.exhaustion_threshold) {
    return;
  }

  const monitorKey = getCacheKey(provider, accountId);
  if (managerState.activeRuntimeMonitors.has(monitorKey)) return;

  const state: RuntimeMonitorState = {
    timer: null,
    hasWarnedThisSession: false,
    stopped: false,
  };
  managerState.activeRuntimeMonitors.set(monitorKey, state);

  scheduleNextPoll(
    managerState,
    provider,
    accountId,
    quotaConfig.runtime_monitor,
    quotaConfig.runtime_monitor.normal_interval_seconds * 1000,
    state
  );
}

export function stopQuotaMonitorInState(managerState: QuotaManagerState): void {
  for (const state of managerState.activeRuntimeMonitors.values()) {
    state.stopped = true;
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
  }
  managerState.activeRuntimeMonitors.clear();
}
