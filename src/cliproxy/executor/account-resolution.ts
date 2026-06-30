/**
 * Account Resolution — Executor-level account management
 *
 * Extracted from executor/index.ts (Phase 05).
 * Handles:
 * - --accounts listing (early exit)
 * - --use <account> switching
 * - --nickname rename
 * - Default account touch (lastUsedAt update)
 * - Account safety guards (cross-provider isolation, ban risk, stale pauses)
 * - Runtime quota monitor provider resolution
 */

import { ok, fail, info } from '../../utils/ui';
import {
  findAccountByQuery,
  getProviderAccounts,
  setDefaultAccount,
  touchAccount,
  renameAccount,
  getDefaultAccount,
} from '../accounts/account-manager';
import { formatAccountDisplayName } from '../accounts/email-account-identity';
import { getProviderConfig } from '../config/config-generator';
import { CLIProxyProvider } from '../types';
import { MANAGED_QUOTA_PROVIDERS, type ManagedQuotaProvider } from '../quota/quota-manager';
import {
  warnCrossProviderDuplicates,
  warnOAuthBanRisk,
  cleanupStaleAutoPauses,
  enforceProviderIsolation,
  restoreAutoPausedAccounts,
} from '../accounts/account-safety';

// ── Quota provider resolution ─────────────────────────────────────────────────

/**
 * Determine which managed quota providers need runtime monitoring.
 * For composite variants, checks all tier providers; otherwise checks the
 * single active provider.
 */
export function resolveRuntimeQuotaMonitorProviders(
  provider: CLIProxyProvider,
  compositeProviders: CLIProxyProvider[]
): ManagedQuotaProvider[] {
  const candidates = compositeProviders.length > 0 ? compositeProviders : [provider];
  const resolved: ManagedQuotaProvider[] = [];

  for (const candidate of candidates) {
    if (
      MANAGED_QUOTA_PROVIDERS.includes(candidate as ManagedQuotaProvider) &&
      !resolved.includes(candidate as ManagedQuotaProvider)
    ) {
      resolved.push(candidate as ManagedQuotaProvider);
    }
  }

  return resolved;
}

// ── Account safety guards ─────────────────────────────────────────────────────

/**
 * Apply account safety guards: stale auto-pause cleanup, provider isolation,
 * cross-provider duplicate warnings, and OAuth ban risk warnings.
 *
 * Registers process.on('exit') restore handler when isolation is enforced.
 */
export function applyAccountSafetyGuards(
  provider: CLIProxyProvider,
  _compositeProviders: CLIProxyProvider[]
): void {
  cleanupStaleAutoPauses();
  const isolated = enforceProviderIsolation(provider);
  if (isolated === 0) {
    // No enforcement — still warn about duplicates for awareness
    warnCrossProviderDuplicates(provider);
  } else {
    // 'exit' handlers must be synchronous — restoreAutoPausedAccounts uses sync fs APIs
    process.on('exit', () => {
      restoreAutoPausedAccounts(provider);
    });
  }
}

// ── Context / Result types ────────────────────────────────────────────────────

export interface AccountResolutionContext {
  provider: CLIProxyProvider;
  /** True when running in composite variant mode */
  showAccounts: boolean;
  useAccount: string | undefined;
  setNickname: string | undefined;
  addAccount: boolean;
}

export interface AccountResolutionResult {
  /** true if --accounts listing was shown (caller should return early) */
  earlyExit: boolean;
}

// ── Main account resolution ───────────────────────────────────────────────────

/**
 * Handle account management CLI flags:
 * --accounts (list + early exit), --use (switch), --nickname (rename).
 *
 * Also calls warnOAuthBanRisk for the active provider.
 */
export async function resolveAccounts(
  ctx: AccountResolutionContext
): Promise<AccountResolutionResult> {
  const { provider, showAccounts, useAccount, setNickname, addAccount } = ctx;
  const providerConfig = getProviderConfig(provider);

  // Warn about OAuth ban risk for this provider (always)
  warnOAuthBanRisk(provider);

  // Handle --accounts
  if (showAccounts) {
    const accounts = getProviderAccounts(provider);
    if (accounts.length === 0) {
      console.log(info(`No accounts registered for ${providerConfig.displayName}`));
      console.log(`    Run "ccs ${provider} --auth" to add an account`);
    } else {
      console.log(`\n${providerConfig.displayName} Accounts:\n`);
      for (const acct of accounts) {
        const defaultMark = acct.isDefault ? ' (default)' : '';
        const nickname = acct.nickname ? `[${acct.nickname}]` : '';
        console.log(`  ${nickname.padEnd(12)} ${formatAccountDisplayName(acct)}${defaultMark}`);
      }
      console.log(`\n  Use "ccs ${provider} --use <nickname-or-id>" to switch accounts`);
    }
    process.exit(0);
    return { earlyExit: true };
  }

  // Handle --use
  if (useAccount) {
    const account = findAccountByQuery(provider, useAccount);
    if (!account) {
      console.error(fail(`Account not found: "${useAccount}"`));
      const accounts = getProviderAccounts(provider);
      if (accounts.length > 0) {
        console.error(`    Available accounts:`);
        for (const acct of accounts) {
          const displayName = formatAccountDisplayName(acct);
          const label = acct.nickname ? `${acct.nickname} (${displayName})` : displayName;
          console.error(`      - ${label}`);
        }
      }
      process.exit(1);
      return { earlyExit: true };
    }
    setDefaultAccount(provider, account.id);
    touchAccount(provider, account.id);
    const switchedLabel = account.nickname
      ? `${account.nickname} (${formatAccountDisplayName(account)})`
      : formatAccountDisplayName(account);
    console.log(ok(`Switched to account: ${switchedLabel}`));
  }

  // Handle --nickname (rename account) — only when not in --auth flow
  if (setNickname && !addAccount) {
    const defaultAccount = getDefaultAccount(provider);
    if (!defaultAccount) {
      console.error(fail(`No account found for ${providerConfig.displayName}`));
      console.error(`    Run "ccs ${provider} --auth" to add an account first`);
      process.exit(1);
      return { earlyExit: true };
    }
    try {
      const success = renameAccount(provider, defaultAccount.id, setNickname);
      if (success) {
        console.log(ok(`Renamed account to: ${setNickname}`));
      } else {
        console.error(fail('Failed to rename account'));
        process.exit(1);
        return { earlyExit: true };
      }
    } catch (err) {
      console.error(fail(err instanceof Error ? err.message : 'Failed to rename account'));
      process.exit(1);
      return { earlyExit: true };
    }
    process.exit(0);
    return { earlyExit: true };
  }

  return { earlyExit: false };
}

/**
 * Touch the default account's lastUsedAt timestamp.
 * Called after authentication succeeds and before proxy spawn.
 */
export function touchDefaultAccount(provider: CLIProxyProvider): void {
  const usedAccount = getDefaultAccount(provider);
  if (usedAccount) {
    touchAccount(provider, usedAccount.id);
  }
}
