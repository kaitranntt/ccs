/**
 * Pre-flight Quota Checks, Account Failover & Exhaustion Reconciliation
 */

import { CLIProxyProvider } from '../../types';
import {
  getDefaultAccount,
  getProviderAccounts,
  isAccountPaused,
  setDefaultAccount,
  touchAccount,
  type AccountInfo,
} from '../../accounts/account-manager';
import { loadOrCreateUnifiedConfig } from '../../../config/config-loader-facade';
import { getTierLockForProvider } from '../../../config/schemas/quota';
import { emitSessionNotice } from '../../accounts/session-notices';
import { maskEmail, pauseAccountForQuotaCooldown } from '../../accounts/account-safety';
import {
  applyCooldownInState,
  batchedMap,
  calculateQuotaPercent,
  fetchQuotaWithDedupInState,
  getCachedQuotaFromState,
  isManagedQuotaProvider,
  isOnCooldownInState,
  type ManagedQuotaProvider,
  type QuotaManagerState,
} from './quota-cache-and-cooldown';

/**
 * Result of pre-flight quota check
 */
export interface PreflightResult {
  /** Whether to proceed with session */
  proceed: boolean;
  /** Account to use (may differ from original default) */
  accountId: string;
  /** If switched, the original account ID */
  switchedFrom?: string;
  /** Reason for switch or failure */
  reason?: string;
  /** Average quota percentage of selected account */
  quotaPercent?: number | null;
}

export async function findHealthyAccountInState(
  state: QuotaManagerState,
  provider: CLIProxyProvider,
  exclude: string[]
): Promise<{ id: string; tier: string; lastQuota: number | null } | null> {
  if (!isManagedQuotaProvider(provider)) {
    return null;
  }

  const { restoreExpiredQuotaPauses } = await import('../../accounts/account-safety');
  restoreExpiredQuotaPauses();

  const config = loadOrCreateUnifiedConfig();
  const tierPriority = config.quota_management?.auto?.tier_priority ?? ['ultra', 'pro', 'free'];
  const threshold = config.quota_management?.auto?.exhaustion_threshold ?? 5;

  const accounts = getProviderAccounts(provider);
  const tierLock = getTierLockForProvider(config.quota_management?.manual, provider);

  const available = accounts.filter(
    (a) =>
      !exclude.includes(a.id) &&
      !isAccountPaused(provider, a.id) &&
      !isOnCooldownInState(state, provider, a.id) &&
      (tierLock === null || (a.tier || 'unknown') === tierLock)
  );

  if (available.length === 0) return null;

  const withQuotas = await batchedMap(
    available,
    async (account) => {
      let quota = getCachedQuotaFromState(state, provider, account.id);
      if (!quota) {
        quota = await fetchQuotaWithDedupInState(state, provider, account.id);
      }

      const avgQuota = calculateQuotaPercent(provider, quota);

      return {
        id: account.id,
        tier: account.tier || 'unknown',
        lastQuota: avgQuota,
      };
    },
    10
  );

  const healthy = withQuotas.filter((a) => a.lastQuota !== null && a.lastQuota >= threshold);
  const selectable = healthy.length > 0 ? healthy : withQuotas.filter((a) => a.lastQuota === null);
  if (selectable.length === 0) return null;

  selectable.sort((a, b) => {
    const tierA = tierPriority.indexOf(a.tier);
    const tierB = tierPriority.indexOf(b.tier);
    const tierOrderA = tierA === -1 ? 999 : tierA;
    const tierOrderB = tierB === -1 ? 999 : tierB;

    if (tierOrderA !== tierOrderB) return tierOrderA - tierOrderB;
    return (b.lastQuota ?? -1) - (a.lastQuota ?? -1);
  });

  return selectable[0];
}

export async function reconcileExhaustedRotationAccountsInState(
  state: QuotaManagerState,
  provider: CLIProxyProvider
): Promise<string[]> {
  if (!isManagedQuotaProvider(provider)) {
    return [];
  }

  const { pauseAccountForQuotaCooldown, restoreExpiredQuotaPauses } = await import(
    '../../accounts/account-safety'
  );
  restoreExpiredQuotaPauses();

  const config = loadOrCreateUnifiedConfig();
  const threshold = config.quota_management?.auto?.exhaustion_threshold ?? 5;
  const cooldownMinutes = config.quota_management?.auto?.cooldown_minutes ?? 5;

  const activeAccounts = getProviderAccounts(provider).filter(
    (account) => !isAccountPaused(provider, account.id)
  );
  if (activeAccounts.length < 2) {
    return [];
  }

  const accountsWithQuota = await batchedMap(
    activeAccounts,
    async (account) => {
      let quota = getCachedQuotaFromState(state, provider, account.id);
      if (!quota) {
        quota = await fetchQuotaWithDedupInState(state, provider, account.id);
      }

      return {
        account,
        quotaPercent: calculateQuotaPercent(provider, quota),
      };
    },
    10
  );

  const healthyAccountIds = new Set(
    accountsWithQuota
      .filter(({ account, quotaPercent }) => {
        if (isOnCooldownInState(state, provider, account.id)) return false;
        return quotaPercent !== null && quotaPercent >= threshold;
      })
      .map(({ account }) => account.id)
  );
  if (healthyAccountIds.size === 0) {
    return [];
  }

  const pausedAccountIds: string[] = [];
  for (const { account, quotaPercent } of accountsWithQuota) {
    const exhaustedByQuota = quotaPercent !== null && quotaPercent < threshold;
    const exhaustedByCooldown = isOnCooldownInState(state, provider, account.id);
    if (!exhaustedByQuota && !exhaustedByCooldown) continue;

    const hasOtherHealthyAccount = [...healthyAccountIds].some((id) => id !== account.id);
    if (!hasOtherHealthyAccount) continue;

    applyCooldownInState(state, provider, account.id, cooldownMinutes);
    if (pauseAccountForQuotaCooldown(provider, account.id, cooldownMinutes)) {
      pausedAccountIds.push(account.id);
    }
  }

  return pausedAccountIds;
}

async function findAndSwitchInState(
  state: QuotaManagerState,
  provider: ManagedQuotaProvider,
  excludeAccountId: string,
  reason: string
): Promise<PreflightResult> {
  const alternative = await findHealthyAccountInState(state, provider, [excludeAccountId]);

  if (!alternative) {
    return {
      proceed: true,
      accountId: excludeAccountId,
      reason: `${reason}, no alternatives available`,
    };
  }

  setDefaultAccount(provider, alternative.id);
  touchAccount(provider, alternative.id);

  return {
    proceed: true,
    accountId: alternative.id,
    switchedFrom: excludeAccountId,
    reason,
    quotaPercent: alternative.lastQuota,
  };
}

export async function preflightCheckInState(
  state: QuotaManagerState,
  provider: CLIProxyProvider
): Promise<PreflightResult> {
  if (!isManagedQuotaProvider(provider)) {
    const defaultAccount = getDefaultAccount(provider);
    return { proceed: true, accountId: defaultAccount?.id || '' };
  }

  const { pauseAccountForQuotaCooldown, restoreExpiredQuotaPauses } = await import(
    '../../accounts/account-safety'
  );
  restoreExpiredQuotaPauses();

  const config = loadOrCreateUnifiedConfig();
  const quotaConfig = config.quota_management;

  if (!quotaConfig?.auto?.preflight_check || quotaConfig?.mode === 'manual') {
    const defaultAccount = getDefaultAccount(provider);
    return { proceed: true, accountId: defaultAccount?.id || '' };
  }

  const defaultAccount = getDefaultAccount(provider);
  if (!defaultAccount) {
    return { proceed: false, accountId: '', reason: 'No accounts configured' };
  }

  await reconcileExhaustedRotationAccountsInState(state, provider);

  const forcedDefault = quotaConfig.manual?.forced_default;
  if (forcedDefault) {
    const forcedAccount = getProviderAccounts(provider).find((a) => a.id === forcedDefault);
    if (forcedAccount && !isAccountPaused(provider, forcedAccount.id)) {
      return { proceed: true, accountId: forcedAccount.id, reason: 'Forced default override' };
    }
  }

  const tierLock = getTierLockForProvider(quotaConfig.manual, provider);
  if (tierLock !== null && (defaultAccount.tier || 'unknown') !== tierLock) {
    const lockedTierAccount = await findHealthyAccountInState(state, provider, []);
    if (lockedTierAccount) {
      setDefaultAccount(provider, lockedTierAccount.id);
      touchAccount(provider, lockedTierAccount.id);
      return {
        proceed: true,
        accountId: lockedTierAccount.id,
        switchedFrom: defaultAccount.id,
        reason: `Tier lock: selected ${tierLock} account`,
      };
    }

    return {
      proceed: false,
      accountId: '',
      reason: `Tier lock: no healthy ${tierLock} account available`,
    };
  }

  if (isAccountPaused(provider, defaultAccount.id)) {
    return await findAndSwitchInState(
      state,
      provider,
      defaultAccount.id,
      'Default account is paused'
    );
  }

  if (isOnCooldownInState(state, provider, defaultAccount.id)) {
    return await findAndSwitchInState(
      state,
      provider,
      defaultAccount.id,
      'Default account on cooldown'
    );
  }

  let quota = getCachedQuotaFromState(state, provider, defaultAccount.id);
  if (!quota) {
    quota = await fetchQuotaWithDedupInState(state, provider, defaultAccount.id);
  }

  const quotaPercent = calculateQuotaPercent(provider, quota);
  if (quotaPercent === null) {
    return {
      proceed: true,
      accountId: defaultAccount.id,
      reason: 'Quota unavailable, using default account',
    };
  }

  const avgQuota = quotaPercent;
  const threshold = quotaConfig.auto?.exhaustion_threshold ?? 5;

  if (avgQuota < threshold) {
    applyCooldownInState(
      state,
      provider,
      defaultAccount.id,
      quotaConfig.auto?.cooldown_minutes ?? 5
    );

    const alternative = await findHealthyAccountInState(state, provider, [defaultAccount.id]);
    if (!alternative) {
      return {
        proceed: true,
        accountId: defaultAccount.id,
        reason: `Quota exhausted (${avgQuota.toFixed(1)}%), no alternatives available`,
        quotaPercent,
      };
    }

    if (alternative.lastQuota !== null && alternative.lastQuota >= threshold) {
      pauseAccountForQuotaCooldown(
        provider,
        defaultAccount.id,
        quotaConfig.auto?.cooldown_minutes ?? 5
      );
    }
    setDefaultAccount(provider, alternative.id);
    touchAccount(provider, alternative.id);
    return {
      proceed: true,
      accountId: alternative.id,
      switchedFrom: defaultAccount.id,
      reason: `Quota exhausted (${avgQuota.toFixed(1)}%)`,
      quotaPercent: alternative.lastQuota,
    };
  }

  return {
    proceed: true,
    accountId: defaultAccount.id,
    quotaPercent,
  };
}

export async function getQuotaStatusInState(
  state: QuotaManagerState,
  provider: CLIProxyProvider
): Promise<{
  accounts: Array<{
    account: AccountInfo;
    quota: number | null;
    paused: boolean;
    onCooldown: boolean;
    isDefault: boolean;
  }>;
}> {
  const { restoreExpiredQuotaPauses } = await import('../../accounts/account-safety');
  restoreExpiredQuotaPauses();

  const accounts = getProviderAccounts(provider);
  const defaultAccount = getDefaultAccount(provider);

  const results = await Promise.all(
    accounts.map(async (account) => {
      const managedProvider = isManagedQuotaProvider(provider) ? provider : null;
      let quota = getCachedQuotaFromState(state, provider, account.id);
      if (!quota && managedProvider) {
        quota = await fetchQuotaWithDedupInState(state, managedProvider, account.id);
      }

      const avgQuota =
        quota && managedProvider ? calculateQuotaPercent(managedProvider, quota) : null;

      return {
        account,
        quota: avgQuota,
        paused: isAccountPaused(provider, account.id),
        onCooldown: isOnCooldownInState(state, provider, account.id),
        isDefault: defaultAccount?.id === account.id,
      };
    })
  );

  return { accounts: results };
}

function writeQuotaExhausted(
  accountId: string,
  switchedTo: string | null,
  cooldownMinutes: number
): void {
  emitSessionNotice({
    level: 'error',
    title: `Quota exhausted: ${maskEmail(accountId)}`,
    details: [
      `Cooldown: ${cooldownMinutes} minutes`,
      switchedTo
        ? `Next session default: ${maskEmail(switchedTo)}`
        : 'No alternative accounts available',
    ],
  });
}

export async function handleQuotaExhaustionInState(
  state: QuotaManagerState,
  provider: CLIProxyProvider,
  accountId: string,
  cooldownMinutes: number
): Promise<{ switchedTo: string | null; reason: string }> {
  const config = loadOrCreateUnifiedConfig();
  const threshold = config.quota_management?.auto?.exhaustion_threshold ?? 5;

  applyCooldownInState(state, provider, accountId, cooldownMinutes);

  const alternative = await findHealthyAccountInState(state, provider, [accountId]);

  if (alternative) {
    if (alternative.lastQuota !== null && alternative.lastQuota >= threshold) {
      pauseAccountForQuotaCooldown(provider, accountId, cooldownMinutes);
    }
    setDefaultAccount(provider, alternative.id);
    touchAccount(provider, alternative.id);
    writeQuotaExhausted(accountId, alternative.id, cooldownMinutes);
    return {
      switchedTo: alternative.id,
      reason: `Quota exhausted, switched to ${maskEmail(alternative.id)}`,
    };
  }

  writeQuotaExhausted(accountId, null, cooldownMinutes);
  return {
    switchedTo: null,
    reason: 'Quota exhausted, no alternatives available',
  };
}
