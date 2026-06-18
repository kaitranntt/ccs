/**
 * Quota CLI subcommand handlers.
 *
 * Public entry points consumed by src/commands/cliproxy/index.ts:
 *   - handleQuotaStatus   (`ccs cliproxy quota`)
 *   - handleDoctor        (`ccs cliproxy doctor` / `diag`)
 *   - handleSetDefault    (`ccs cliproxy default <account>`)
 *   - handlePauseAccount  (`ccs cliproxy pause <account>`)
 *   - handleResumeAccount (`ccs cliproxy resume <account>`)
 *
 * Behavior is preserved verbatim from the original god file; only the
 * module boundaries changed.
 */

import {
  getProviderAccounts,
  pauseAccount,
  resumeAccount,
  setDefaultAccount,
  findAccountByQuery,
} from '../../../cliproxy/accounts/account-manager';
import type { CLIProxyProvider } from '../../../cliproxy/types';
import {
  QUOTA_SUPPORTED_PROVIDER_IDS,
  type QuotaSupportedProvider,
} from '../../../cliproxy/provider-capabilities';
import { fetchAllProviderQuotas } from '../../../cliproxy/quota/quota-fetcher';
import { initUI, header, subheader, color, dim, ok, fail, warn, info } from '../../../utils/ui';
import { renderProviderPoolSection, readPoolRoutingSettings } from '../pool-state-renderer';
import { displayQuotaFailure } from './quota-failure-display';
import { formatCliAccountLabel, formatQuotaBar } from './format-helpers';
import { parseProfileArgs } from './profile-args';
import { QUOTA_PROVIDER_RUNTIME } from './provider-runtime';

/** `ccs cliproxy quota [--provider <name>]` */
export async function handleQuotaStatus(
  verbose = false,
  providerFilter: QuotaSupportedProvider | 'all' = 'all'
): Promise<void> {
  await initUI();
  console.log(header('Quota Status'));
  console.log('');

  const requestedProviders = new Set<QuotaSupportedProvider>(
    providerFilter === 'all' ? QUOTA_SUPPORTED_PROVIDER_IDS : [providerFilter]
  );
  const shouldFetch = (provider: QuotaSupportedProvider): boolean =>
    requestedProviders.has(provider);

  console.log(dim('Fetching quotas...'));

  const providerResults = new Map<QuotaSupportedProvider, unknown | null>(
    await Promise.all(
      QUOTA_SUPPORTED_PROVIDER_IDS.map(async (provider) => {
        if (!shouldFetch(provider)) {
          return [provider, null] as const;
        }
        return [provider, await QUOTA_PROVIDER_RUNTIME[provider].fetch(verbose)] as const;
      })
    )
  );

  console.log('');

  // Pool routing settings are global to the CLIProxy config; read once.
  const poolSettings = readPoolRoutingSettings();

  for (const provider of QUOTA_SUPPORTED_PROVIDER_IDS) {
    if (!shouldFetch(provider)) {
      continue;
    }

    const runtime = QUOTA_PROVIDER_RUNTIME[provider];
    const result = providerResults.get(provider) ?? null;
    if (result !== null && runtime.hasData(result)) {
      runtime.render(result);
      // Pool context: drain order + per-account state (available/cooling/paused).
      // QuotaSupportedProvider ids are all valid CLIProxyProvider values.
      // Async: folds in live in-proxy 429 cooldowns when pool routing is on.
      await renderProviderPoolSection(provider as CLIProxyProvider, poolSettings);
      continue;
    }

    console.log(subheader(runtime.emptyTitle));
    console.log(info(runtime.emptyMessage));
    console.log(`  Run: ${color(runtime.authCommand, 'command')} to authenticate`);
    console.log('');
  }
}

/** `ccs cliproxy doctor` (alias: `diag`) - Antigravity diagnostics. */
export async function handleDoctor(verbose = false): Promise<void> {
  await initUI();
  console.log(header('CLIProxy Quota Diagnostics'));
  console.log('');

  const provider: CLIProxyProvider = 'agy';
  const accounts = getProviderAccounts(provider);

  if (accounts.length === 0) {
    console.log(info('No Antigravity accounts configured'));
    console.log(`    Run: ${color('ccs agy --auth', 'command')} to authenticate`);
    return;
  }

  console.log(subheader(`Antigravity Accounts (${accounts.length})`));
  console.log('');

  console.log(dim('Fetching quotas...'));
  const quotaResult = await fetchAllProviderQuotas(provider, verbose);

  for (const { account, quota } of quotaResult.accounts) {
    const accountLabel = formatCliAccountLabel(account);
    const defaultBadge = account.isDefault ? color(' (default)', 'info') : '';

    if (!quota.success) {
      console.log(`  ${fail(accountLabel)}${defaultBadge}`);
      displayQuotaFailure(quota);
      if (quota.isUnprovisioned) {
        console.log(
          `    ${warn('Account not provisioned - open Gemini Code Assist in IDE first')}`
        );
      }
      console.log('');
      continue;
    }

    const avgQuota =
      quota.models.length > 0
        ? quota.models.reduce((sum, m) => sum + m.percentage, 0) / quota.models.length
        : 0;
    const statusIcon = avgQuota > 50 ? ok('') : avgQuota > 10 ? warn('') : fail('');

    console.log(`  ${statusIcon}${accountLabel}${defaultBadge}`);
    if (quota.projectId) {
      console.log(`    Project: ${dim(quota.projectId)}`);
    }

    for (const model of quota.models) {
      const bar = formatQuotaBar(model.percentage);
      console.log(`    ${model.name.padEnd(20)} ${bar} ${model.percentage.toFixed(0)}%`);
    }
    console.log('');
  }

  const sharedProjects = Object.entries(quotaResult.projectGroups).filter(
    ([, accountIds]) => accountIds.length > 1
  );

  if (sharedProjects.length > 0) {
    console.log('');
    console.log(subheader('Shared Project Warning'));
    console.log('');
    for (const [projectId, accountIds] of sharedProjects) {
      console.log(
        fail(`Project ${projectId.substring(0, 20)}... shared by ${accountIds.length} accounts:`)
      );
      for (const accountId of accountIds) {
        console.log(`    - ${accountId}`);
      }
      console.log('');
      console.log(warn('These accounts share the same quota pool!'));
      console.log(warn('Failover between them will NOT help when quota is exhausted.'));
      console.log(info('Solution: Use accounts from different GCP projects.'));
    }
  }

  console.log('');
  console.log(subheader('Summary'));
  const healthyAccounts = quotaResult.accounts.filter(
    ({ quota }) => quota.success && quota.models.some((m) => m.percentage > 5)
  );
  console.log(`  Accounts with quota: ${healthyAccounts.length}/${accounts.length}`);
  if (sharedProjects.length > 0) {
    console.log(`  ${fail(`Shared projects: ${sharedProjects.length} (failover limited)`)}`);
  } else if (accounts.length > 1) {
    console.log(`  ${ok('No shared projects (failover fully operational)')}`);
  }
  console.log('');
}

/** `ccs cliproxy default <account> [--provider <provider>]` */
export async function handleSetDefault(args: string[]): Promise<void> {
  await initUI();
  const parsed = parseProfileArgs(args);

  if (!parsed.name) {
    console.log(fail('Usage: ccs cliproxy default <account> [--provider <provider>]'));
    console.log('');
    console.log('Examples:');
    console.log('  ccs cliproxy default ultra@gmail.com');
    console.log('  ccs cliproxy default john --provider agy');
    process.exit(1);
  }

  const provider = (parsed.provider || 'agy') as CLIProxyProvider;
  const account = findAccountByQuery(provider, parsed.name);

  if (!account) {
    console.log(fail(`Account not found: ${parsed.name}`));
    console.log('');
    const accounts = getProviderAccounts(provider);
    if (accounts.length > 0) {
      console.log('Available accounts:');
      for (const acc of accounts) {
        const badge = acc.isDefault ? color(' (current default)', 'info') : '';
        console.log(`  - ${formatCliAccountLabel(acc)}${badge}`);
      }
    } else {
      console.log(`No accounts found for provider: ${provider}`);
      console.log(`Run: ccs ${provider} --auth`);
    }
    process.exit(1);
  }

  const success = setDefaultAccount(provider, account.id);

  if (success) {
    console.log(ok(`Default account set to: ${formatCliAccountLabel(account)}`));
    console.log(info(`Provider: ${provider}`));
  } else {
    console.log(fail('Failed to set default account'));
    process.exit(1);
  }
}

/** `ccs cliproxy pause <account> [--provider <provider>]` */
export async function handlePauseAccount(args: string[]): Promise<void> {
  await initUI();
  const parsed = parseProfileArgs(args);

  if (!parsed.name) {
    console.log(fail('Usage: ccs cliproxy pause <account> [--provider <provider>]'));
    console.log('');
    console.log('Pauses an account so it will be skipped in quota rotation.');
    process.exit(1);
  }

  const provider = (parsed.provider || 'agy') as CLIProxyProvider;
  const account = findAccountByQuery(provider, parsed.name);

  if (!account) {
    console.log(fail(`Account not found: ${parsed.name}`));
    process.exit(1);
  }

  if (account.paused) {
    const refreshed = pauseAccount(provider, account.id);
    const refreshedAccount = refreshed ? findAccountByQuery(provider, account.id) : account;
    console.log(warn(`Account already paused: ${formatCliAccountLabel(account)}`));
    if (refreshed) {
      console.log(info('Manual pause refreshed; account will stay out of quota rotation'));
    }
    console.log(info(`Paused at: ${refreshedAccount?.pausedAt || account.pausedAt || 'unknown'}`));
    return;
  }

  const success = pauseAccount(provider, account.id);

  if (success) {
    console.log(ok(`Account paused: ${formatCliAccountLabel(account)}`));
    console.log(info('Account will be skipped in quota rotation'));
  } else {
    console.log(fail('Failed to pause account'));
    process.exit(1);
  }
}

/** `ccs cliproxy resume <account> [--provider <provider>]` */
export async function handleResumeAccount(args: string[]): Promise<void> {
  await initUI();
  const parsed = parseProfileArgs(args);

  if (!parsed.name) {
    console.log(fail('Usage: ccs cliproxy resume <account> [--provider <provider>]'));
    console.log('');
    console.log('Resumes a paused account for quota rotation.');
    process.exit(1);
  }

  const provider = (parsed.provider || 'agy') as CLIProxyProvider;
  const account = findAccountByQuery(provider, parsed.name);

  if (!account) {
    console.log(fail(`Account not found: ${parsed.name}`));
    process.exit(1);
  }

  if (!account.paused) {
    console.log(warn(`Account is not paused: ${formatCliAccountLabel(account)}`));
    return;
  }

  const success = resumeAccount(provider, account.id);

  if (success) {
    console.log(ok(`Account resumed: ${formatCliAccountLabel(account)}`));
    console.log(info('Account is now active in quota rotation'));
  } else {
    console.log(fail('Failed to resume account'));
    process.exit(1);
  }
}
