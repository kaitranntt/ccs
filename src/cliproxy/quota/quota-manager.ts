/**
 * Quota Manager for Hybrid Auto+Manual Account Selection (Facade)
 *
 * Instantiates module-scoped quota/cooldown/monitor state per import instance
 * so cache-busting test imports remain isolated while production callers share
 * a single module instance.
 */

import type { CLIProxyProvider } from '../types';
import {
  applyCooldownInState,
  clearCooldownInState,
  clearQuotaCacheInState,
  createQuotaManagerState,
  getCachedQuotaFromState,
  getCooldownUntilInState,
  isManagedQuotaProvider,
  isOnCooldownInState,
  MANAGED_QUOTA_PROVIDERS,
  setCachedQuotaInState,
  type ManagedQuotaProvider,
  type ManagedQuotaResult,
} from './quota-manager/quota-cache-and-cooldown';
import {
  findHealthyAccountInState,
  getQuotaStatusInState,
  handleQuotaExhaustionInState,
  preflightCheckInState,
  reconcileExhaustedRotationAccountsInState,
  type PreflightResult,
} from './quota-manager/preflight-and-failover';
import { startQuotaMonitorInState, stopQuotaMonitorInState } from './quota-manager/runtime-monitor';

export type { ManagedQuotaProvider, PreflightResult };
export { MANAGED_QUOTA_PROVIDERS, isManagedQuotaProvider };

const state = createQuotaManagerState();

export function getCachedQuota(
  provider: CLIProxyProvider,
  accountId: string
): ManagedQuotaResult | null {
  return getCachedQuotaFromState(state, provider, accountId);
}

export function setCachedQuota(
  provider: CLIProxyProvider,
  accountId: string,
  result: ManagedQuotaResult
): void {
  setCachedQuotaInState(state, provider, accountId, result);
}

export function clearQuotaCache(): void {
  clearQuotaCacheInState(state);
}

export function isOnCooldown(provider: CLIProxyProvider, accountId: string): boolean {
  return isOnCooldownInState(state, provider, accountId);
}

export function getCooldownUntil(
  provider: CLIProxyProvider,
  accountId: string
): number | undefined {
  return getCooldownUntilInState(state, provider, accountId);
}

export function applyCooldown(
  provider: CLIProxyProvider,
  accountId: string,
  minutes: number
): void {
  applyCooldownInState(state, provider, accountId, minutes);
}

export function clearCooldown(provider: CLIProxyProvider, accountId: string): void {
  clearCooldownInState(state, provider, accountId);
}

export function findHealthyAccount(provider: CLIProxyProvider, exclude: string[]) {
  return findHealthyAccountInState(state, provider, exclude);
}

export function reconcileExhaustedRotationAccounts(provider: CLIProxyProvider) {
  return reconcileExhaustedRotationAccountsInState(state, provider);
}

export function preflightCheck(provider: CLIProxyProvider): Promise<PreflightResult> {
  return preflightCheckInState(state, provider);
}

export function getQuotaStatus(provider: CLIProxyProvider) {
  return getQuotaStatusInState(state, provider);
}

export function startQuotaMonitor(provider: CLIProxyProvider, accountId: string): void {
  startQuotaMonitorInState(state, provider, accountId);
}

export function stopQuotaMonitor(): void {
  stopQuotaMonitorInState(state);
}

export function handleQuotaExhaustion(
  provider: CLIProxyProvider,
  accountId: string,
  cooldownMinutes: number
) {
  return handleQuotaExhaustionInState(state, provider, accountId, cooldownMinutes);
}
