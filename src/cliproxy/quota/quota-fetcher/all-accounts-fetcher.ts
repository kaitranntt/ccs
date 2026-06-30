/**
 * fetchAllProviderQuotas and findAvailableAccount.
 *
 * fetchAllProviderQuotas fans quota fetches out across all accounts of a
 * provider in parallel and groups them by GCP project id (accounts that share
 * a project pool quota together, so failover between them won't help).
 * findAvailableAccount wraps that to pick the first account that still has
 * remaining quota (used by the auto-switch preflight check).
 */

import type { CLIProxyProvider } from '../../types';
import { getProviderAccounts, type AccountInfo } from '../../accounts/account-manager';

import { fetchAccountQuota } from './account-quota-fetcher';
import { readProjectIdFromAuthFile } from './auth-file-reader';
import type { AllAccountsQuotaResult, QuotaResult } from './types';

/**
 * Fetch quota for all accounts of a provider.
 * Also detects accounts sharing the same GCP project (failover won't help).
 *
 * @param provider - Provider name (only 'agy' supported for quota)
 * @param verbose - Show detailed diagnostics
 * @returns Results for all accounts with project grouping
 */
export async function fetchAllProviderQuotas(
  provider: CLIProxyProvider,
  verbose = false
): Promise<AllAccountsQuotaResult> {
  const accounts = getProviderAccounts(provider);
  const results: AllAccountsQuotaResult = {
    provider,
    accounts: [],
    projectGroups: {},
    lastUpdated: Date.now(),
  };

  if (accounts.length === 0) {
    return results;
  }

  // Fetch quota for each account in parallel
  const quotaPromises = accounts.map(async (account) => {
    const quota = await fetchAccountQuota(provider, account.id, verbose);

    // Read project ID from auth file if not in quota result
    let projectId = quota.projectId;
    if (!projectId) {
      projectId = readProjectIdFromAuthFile(provider, account.id) || undefined;
    }

    return {
      account,
      quota: { ...quota, accountId: account.id, projectId },
    };
  });

  const quotaResults = await Promise.all(quotaPromises);

  // Build project groups for detecting shared projects
  for (const { account, quota } of quotaResults) {
    results.accounts.push({ account, quota });

    if (quota.projectId) {
      if (!results.projectGroups[quota.projectId]) {
        results.projectGroups[quota.projectId] = [];
      }
      results.projectGroups[quota.projectId].push(account.id);
    }
  }

  return results;
}

/**
 * Find an available account with remaining quota.
 * Used by preflight check for auto-switching.
 *
 * @param provider - Provider name
 * @param excludeAccountId - Account to exclude (current exhausted account)
 * @param verbose - Show detailed diagnostics
 * @returns Account with available quota, or null if none available
 */
export async function findAvailableAccount(
  provider: CLIProxyProvider,
  excludeAccountId?: string,
  verbose = false
): Promise<{ account: AccountInfo; quota: QuotaResult } | null> {
  const allQuotas = await fetchAllProviderQuotas(provider, verbose);

  // Get excluded account's project ID to avoid switching to same-project accounts
  const excludedProjectId = allQuotas.accounts.find((a) => a.account.id === excludeAccountId)?.quota
    .projectId;

  for (const { account, quota } of allQuotas.accounts) {
    // Skip excluded account
    if (excludeAccountId && account.id === excludeAccountId) {
      continue;
    }

    // Skip failed quota fetches
    if (!quota.success) {
      continue;
    }

    // Skip accounts sharing the same GCP project (quota is pooled)
    if (excludedProjectId && quota.projectId === excludedProjectId) {
      continue;
    }

    // Check if any model has remaining quota (> 5% to avoid edge cases)
    const hasQuota = quota.models.some((m) => m.percentage > 5);
    if (hasQuota) {
      return { account, quota };
    }
  }

  return null;
}
