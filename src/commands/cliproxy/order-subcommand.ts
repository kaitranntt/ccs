/**
 * CLIProxy Accounts Drain Order Subcommand
 *
 * Handles:
 *   ccs cliproxy accounts order <provider>
 *   ccs cliproxy accounts order <provider> --by-tier
 *   ccs cliproxy accounts order <provider> --set a@x.com,b@y.com,...
 *   ccs cliproxy accounts order <provider> --reset
 */

import { initUI, header, subheader, color, dim, ok, fail, warn, info } from '../../utils/ui';
import { extractOption, hasAnyFlag } from '../arg-extractor';
import { saveDrainOrderConfig, clearDrainOrderConfig } from '../../cliproxy/accounts/registry';
import { getProviderAccounts } from '../../cliproxy/accounts/query';
import {
  computeManualDrainOrder,
  computeTierDrainOrder,
  applyDrainOrder,
  resolveEffectiveDrainOrder,
  clearDrainOrderPriorities,
  tieBreakKey,
  type DrainOrderEntry,
  type DrainOrderInput,
} from '../../cliproxy/accounts/drain-order';
import { detectRunningProxy } from '../../cliproxy/proxy/proxy-detector';
import { getProxyTarget } from '../../cliproxy/proxy/proxy-target-resolver';
import { mapExternalProviderName } from '../../cliproxy/provider-capabilities';
import type { CLIProxyProvider } from '../../cliproxy/types';
import type { AccountTier } from '../../cliproxy/accounts/types';
import { resolveLifecyclePort } from '../../cliproxy/config/port-manager';

/** Providers where tier metadata is expected and --by-tier is meaningful. */
const TIER_AWARE_PROVIDERS = new Set<CLIProxyProvider>(['agy', 'gemini']);

// tieBreakKey now lives in drain-order.ts (shared with the quota pool section);
// re-exported here so existing callers/tests keep importing it from this module.
export { tieBreakKey };

function formatTierLabel(tier: AccountTier | undefined, tierDerived: boolean): string {
  if (!tier || tier === 'unknown') {
    return dim('unknown');
  }
  const label =
    tier === 'ultra' ? color(tier, 'success') : tier === 'pro' ? color(tier, 'info') : dim(tier);
  return tierDerived ? label : dim(tier);
}

function printOrderTable(
  entries: DrainOrderEntry[],
  showCurrentPriority: boolean,
  sortByFilePriority: boolean = false
): void {
  const rows = entries.slice().sort((a, b) => {
    if (sortByFilePriority) {
      // Sort by currentPriority (the selector's actual input), treating undefined as 0.
      // This is the priority the selector actually sees on disk, not the computed config priority.
      const aCurrent = a.currentPriority ?? 0;
      const bCurrent = b.currentPriority ?? 0;
      return bCurrent - aCurrent || (tieBreakKey(a.tokenFile) < tieBreakKey(b.tokenFile) ? -1 : 1);
    }
    // Tie-break by tokenFile ascending, matching the Go selector. Upstream sorts
    // by Auth.ID byte order and only lowercases on Windows (see tieBreakKey).
    // localeCompare is intentionally avoided - Go sorts by byte value, not locale.
    return (
      b.priority - a.priority || (tieBreakKey(a.tokenFile) < tieBreakKey(b.tokenFile) ? -1 : 1)
    );
  });

  const maxId = Math.max(...rows.map((r) => r.accountId.length), 'Account'.length);
  const maxPri = Math.max(...rows.map((r) => String(r.priority).length), 'Priority'.length);

  console.log(
    `  ${'#'.padStart(3)}  ${color('Account'.padEnd(maxId), 'command')}  ${'Priority'.padStart(maxPri)}  Tier`
  );
  console.log(`  ${'---'}  ${'-'.repeat(maxId)}  ${'-'.repeat(maxPri)}  ----`);

  rows.forEach((entry, idx) => {
    const pos = String(idx + 1).padStart(3);
    const id = entry.accountId.padEnd(maxId);
    const pri = String(entry.priority).padStart(maxPri);
    const tierLabel = formatTierLabel(entry.tier, entry.tierDerived);
    const currentNote =
      showCurrentPriority && entry.currentPriority !== undefined
        ? dim(` (file: ${entry.currentPriority})`)
        : '';
    console.log(
      `  ${pos}  ${color(id, 'command')}  ${color(pri, 'info')}  ${tierLabel}${currentNote}`
    );
  });
}

/**
 * Show effective drain order for a provider without making any changes.
 */
async function handleOrderShow(provider: CLIProxyProvider): Promise<void> {
  // Use getProviderAccounts() so auth files not yet in accounts.json
  // (e.g. file-copied fleets) are visible and tier metadata is preserved.
  const allAccounts = getProviderAccounts(provider);

  if (allAccounts.length === 0) {
    console.log(warn(`No accounts found for provider: ${provider}`));
    console.log('');
    return;
  }

  const accounts: DrainOrderInput[] = allAccounts
    .filter((a) => !a.paused)
    .map((a) => ({
      accountId: a.id,
      tokenFile: a.tokenFile,
      tier: a.tier,
    }));

  if (accounts.length === 0) {
    console.log(warn(`All accounts for ${provider} are paused.`));
    console.log('');
    return;
  }

  // Shared effective-order resolver: same semantics the quota Pool section and
  // the selector use (sort by on-disk priority, surface drift).
  const effective = resolveEffectiveDrainOrder(provider, accounts);

  if (effective.mode === 'file') {
    // File order: no priority writes. Render from the resolver's output so the
    // displayed order matches what the selector actually drains, honouring any
    // residual on-disk priorities (e.g. left by `order --reset`). Reached when
    // no config is stored, or when a stored manual order has only stale IDs.
    printFileOrderView(provider, effective.entries, effective.hasDrift);
    return;
  }

  const entries = effective.entries;
  const modeLabel =
    effective.mode === 'manual'
      ? `manual (${color('--set', 'command')})`
      : `tier-derived (${color('--by-tier', 'command')})`;
  const hasDrift = effective.hasDrift;

  console.log(`  Mode:  ${modeLabel}`);
  if (hasDrift) {
    console.log('');
    console.log(
      warn(
        `Drift detected: stored order does not match auth files; re-run --set/--by-tier to re-apply.`
      )
    );
  }
  console.log('');
  // Show rows in selector pick order (currentPriority desc, tokenFile asc on tie).
  // This reflects what CLIProxy will actually drain, not just the intended config.
  console.log(subheader('Effective drain order (selector pick order, highest priority first):'));
  printOrderTable(entries, true, true);
  console.log('');
  console.log(
    dim(`  To update: ccs cliproxy accounts order ${provider} --set <comma-separated-ids>`)
  );
  if (TIER_AWARE_PROVIDERS.has(provider)) {
    console.log(dim(`  Tier-based: ccs cliproxy accounts order ${provider} --by-tier`));
  }
  console.log(dim(`  To reset:  ccs cliproxy accounts order ${provider} --reset`));
  console.log('');
}

function filePriorityNote(entry: DrainOrderEntry): string {
  return entry.currentPriority !== undefined ? dim(` [priority: ${entry.currentPriority}]`) : '';
}

/**
 * Render the file-order view from the shared resolver's output. No priority
 * writes; used when no drain order config is stored, or when a stored manual
 * order has only stale IDs.
 *
 * Entries arrive already sorted in selector pick order (on-disk priority desc,
 * tokenFile asc on tie), so the displayed order matches what CLIProxy actually
 * drains even when residual priorities exist (e.g. left by `order --reset`). The
 * mode label and drift warning are kept honest for that residual case.
 */
function printFileOrderView(
  provider: CLIProxyProvider,
  entries: DrainOrderEntry[],
  hasDrift: boolean
): void {
  if (!TIER_AWARE_PROVIDERS.has(provider)) {
    console.log(
      info(
        `Tier unknown for ${provider} accounts - using file order.\n` +
          `    Use --set to specify manual order.`
      )
    );
  }
  // Under drift, "no priority set" would be a lie - residual on-disk priorities
  // are present and are what the selector follows. Label accordingly.
  const label = hasDrift
    ? 'file order (residual priorities present)'
    : 'file order (no priority set)';
  console.log(`  Mode:  ${dim(label)}`);
  if (hasDrift) {
    console.log('');
    console.log(
      warn(
        `Drift detected: residual on-disk priorities steer the selector;\n` +
          `    clear them with --reset (or re-auth the accounts) to return to plain file order.`
      )
    );
  }
  console.log('');
  console.log(subheader('Active accounts (selector pick order):'));
  // Entries are already in selector pick order from the resolver; render as-is.
  entries.forEach((entry, idx) => {
    const pri = filePriorityNote(entry);
    console.log(`  ${String(idx + 1).padStart(3)}  ${color(entry.accountId, 'command')}${pri}`);
  });
  console.log('');
  console.log(
    dim(`  To set manual order:    ccs cliproxy accounts order ${provider} --set a@x.com,b@y.com`)
  );
  if (TIER_AWARE_PROVIDERS.has(provider)) {
    console.log(
      dim(`  To use tier-based order: ccs cliproxy accounts order ${provider} --by-tier`)
    );
  }
  console.log('');
}

/**
 * Apply tier-derived drain order for a provider.
 */
async function handleOrderByTier(provider: CLIProxyProvider): Promise<void> {
  if (!TIER_AWARE_PROVIDERS.has(provider)) {
    console.log(
      warn(
        `Tier metadata is not available for ${provider} accounts.\n` +
          `    Tier is tracked for: ${[...TIER_AWARE_PROVIDERS].join(', ')}\n` +
          `    Use --set for manual order instead.`
      )
    );
    console.log('');
    process.exitCode = 1;
    return;
  }

  // Use getProviderAccounts() so auth files not yet in accounts.json
  // (e.g. file-copied fleets) are visible and tier metadata is preserved.
  const allProviderAccounts = getProviderAccounts(provider);

  if (allProviderAccounts.length === 0) {
    console.log(warn(`No accounts found for provider: ${provider}`));
    console.log('');
    process.exitCode = 1;
    return;
  }

  const accounts: DrainOrderInput[] = allProviderAccounts
    .filter((a) => !a.paused)
    .map((a) => ({
      accountId: a.id,
      tokenFile: a.tokenFile,
      tier: a.tier,
    }));

  if (accounts.length === 0) {
    console.log(warn(`All ${provider} accounts are paused.`));
    console.log('');
    process.exitCode = 1;
    return;
  }

  const allUnknown = accounts.every((a) => !a.tier || a.tier === 'unknown');
  if (allUnknown) {
    console.log(
      warn(
        `All ${provider} accounts have unknown tier.\n` +
          `    Run quota to populate tier metadata, or use --set for manual order.`
      )
    );
    console.log('');
    process.exitCode = 1;
    return;
  }

  const entries = computeTierDrainOrder(accounts);

  console.log(subheader('Computed tier-based drain order:'));
  printOrderTable(entries, false);
  console.log('');

  // Check proxy state for write path selection.
  // Use the configured local port (not the hardcoded default) for detection.
  // Remote targets: refuse with guidance - detection and current-priority reads
  // require management API access that is not wired in v1.
  const proxyTarget = getProxyTarget();
  if (proxyTarget.isRemote) {
    console.log(
      warn(
        `Remote proxy target detected. Drain order management for remote proxies is not\n` +
          `    supported in v1. Run this command on the host running CLIProxy instead.`
      )
    );
    console.log('');
    process.exitCode = 1;
    return;
  }

  const localPort = resolveLifecyclePort();
  const proxyStatus = await detectRunningProxy(localPort);

  // Ambiguous state: proxy process is alive but not yet responding to HTTP.
  // A direct file write while CLIProxy is serving could be silently clobbered
  // by the MarkResult-persist path. Refuse rather than risk priority loss.
  if (proxyStatus.running && !proxyStatus.verified) {
    console.log(fail('Proxy state ambiguous - retry in a moment or stop the proxy first.'));
    console.log('');
    process.exitCode = 1;
    return;
  }

  const proxyRunning = proxyStatus.running && proxyStatus.verified;

  if (proxyRunning) {
    console.log(info('Proxy is running - writing via management API (avoids clobber race).'));
  } else {
    console.log(info('Proxy is stopped - writing directly to auth files.'));
  }
  console.log('');

  const result = await applyDrainOrder(entries, proxyRunning);

  if (result.written.length > 0) {
    console.log(ok(`Set priorities for ${result.written.length} account(s).`));
  }
  if (result.skipped.length > 0) {
    console.log(info(`Skipped ${result.skipped.length} account(s) (priority already correct).`));
  }
  if (result.failed.length > 0) {
    for (const f of result.failed) {
      console.log(fail(`Failed to set priority for ${f.entry.accountId}: ${f.reason}`));
    }
    process.exitCode = 1;
  }

  if (result.failed.length === 0) {
    // Persist mode
    const persisted = saveDrainOrderConfig(provider, { mode: 'tier' });
    if (persisted) {
      console.log(
        ok(
          `Drain order mode saved as "tier". Re-run "ccs cliproxy accounts order ${provider} --by-tier" after adding or re-authing accounts to re-apply.`
        )
      );
    } else {
      console.log(
        warn(
          `Order applied to auth files but mode not persisted - no registered accounts for ${provider}; run ccs cliproxy quota to register, then re-run`
        )
      );
    }
  }
  console.log('');
}

/**
 * Apply manual drain order specified as comma-separated account IDs.
 */
async function handleOrderSet(provider: CLIProxyProvider, setArg: string): Promise<void> {
  const orderedIds = setArg
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (orderedIds.length === 0) {
    console.log(fail('--set requires a comma-separated list of account IDs.'));
    console.log('');
    process.exitCode = 1;
    return;
  }

  // Use getProviderAccounts() so auth files not yet in accounts.json
  // (e.g. file-copied fleets) are visible and tier metadata is preserved.
  const allProviderAccounts = getProviderAccounts(provider);

  if (allProviderAccounts.length === 0) {
    console.log(warn(`No accounts found for provider: ${provider}`));
    console.log('');
    process.exitCode = 1;
    return;
  }

  const allAccounts: DrainOrderInput[] = allProviderAccounts
    .filter((a) => !a.paused)
    .map((a) => ({
      accountId: a.id,
      tokenFile: a.tokenFile,
      tier: a.tier,
    }));

  let entries: DrainOrderEntry[];
  try {
    entries = computeManualDrainOrder(orderedIds, allAccounts);
  } catch (err) {
    console.log(fail(`${(err as Error).message}`));
    console.log('');
    process.exitCode = 1;
    return;
  }

  console.log(subheader('Computed manual drain order:'));
  printOrderTable(entries, false);
  console.log('');

  // Use the configured local port (not the hardcoded default) for detection.
  // Remote targets: refuse with guidance.
  const proxyTarget = getProxyTarget();
  if (proxyTarget.isRemote) {
    console.log(
      warn(
        `Remote proxy target detected. Drain order management for remote proxies is not\n` +
          `    supported in v1. Run this command on the host running CLIProxy instead.`
      )
    );
    console.log('');
    process.exitCode = 1;
    return;
  }

  const localPort = resolveLifecyclePort();
  const proxyStatus = await detectRunningProxy(localPort);

  // Ambiguous state: proxy process is alive but not yet responding to HTTP.
  // A direct file write while CLIProxy is serving could be silently clobbered
  // by the MarkResult-persist path. Refuse rather than risk priority loss.
  if (proxyStatus.running && !proxyStatus.verified) {
    console.log(fail('Proxy state ambiguous - retry in a moment or stop the proxy first.'));
    console.log('');
    process.exitCode = 1;
    return;
  }

  const proxyRunning = proxyStatus.running && proxyStatus.verified;

  if (proxyRunning) {
    console.log(info('Proxy is running - writing via management API (avoids clobber race).'));
  } else {
    console.log(info('Proxy is stopped - writing directly to auth files.'));
  }
  console.log('');

  const result = await applyDrainOrder(entries, proxyRunning);

  if (result.written.length > 0) {
    console.log(ok(`Set priorities for ${result.written.length} account(s).`));
  }
  if (result.skipped.length > 0) {
    console.log(info(`Skipped ${result.skipped.length} account(s) (priority already correct).`));
  }
  if (result.failed.length > 0) {
    for (const f of result.failed) {
      console.log(fail(`Failed to set priority for ${f.entry.accountId}: ${f.reason}`));
    }
    process.exitCode = 1;
  }

  if (result.failed.length === 0) {
    const persisted = saveDrainOrderConfig(provider, { mode: 'manual', orderedIds });
    if (persisted) {
      console.log(
        ok(
          `Drain order mode saved as "manual". Re-run "ccs cliproxy accounts order ${provider} --set <ids>" after adding or re-authing accounts to re-apply.`
        )
      );
    } else {
      console.log(
        warn(
          `Order applied to auth files but mode not persisted - no registered accounts for ${provider}; run ccs cliproxy quota to register, then re-run`
        )
      );
    }
  }
  console.log('');
}

/**
 * Reset drain order to file order: remove the persisted config AND clear the
 * residual priority field from the provider's auth files so the selector
 * actually returns to plain file order.
 *
 * Clearing the field uses the same dual write path as --set/--by-tier:
 * - Proxy running: PATCH priority:0 via the management API (the management layer
 *   treats 0 as delete). A direct file write here would be clobbered by the
 *   proxy's whole-file MarkResult persist, so the API path is mandatory.
 * - Proxy stopped: delete the field directly with an atomic temp-rename.
 *
 * Remote targets are refused with guidance (same as --set/--by-tier), and an
 * ambiguous proxy state (alive but not yet serving HTTP) is refused to avoid a
 * clobbered write.
 */
async function handleOrderReset(provider: CLIProxyProvider): Promise<void> {
  const configCleared = clearDrainOrderConfig(provider);

  // Collect the auth files that may carry residual priorities. Use
  // getProviderAccounts() so file-copied fleets (not yet in accounts.json) are
  // covered too; clearing is idempotent for files with no priority field.
  const tokenFiles = getProviderAccounts(provider).map((a) => a.tokenFile);

  if (tokenFiles.length === 0) {
    if (configCleared) {
      console.log(ok(`Drain order reset to file order for ${provider}.`));
    } else {
      console.log(info(`No drain order config found for ${provider}. Already in file order.`));
    }
    console.log('');
    return;
  }

  // Remote targets: refuse with guidance - clearing priorities needs management
  // API access that is not wired for remote proxies in v1.
  const proxyTarget = getProxyTarget();
  if (proxyTarget.isRemote) {
    if (configCleared) {
      console.log(ok(`Drain order config cleared for ${provider} (mode reset to file order).`));
    } else {
      console.log(info(`No drain order config found for ${provider}.`));
    }
    console.log(
      warn(
        `Remote proxy target detected. Residual auth-file priorities were NOT cleared;\n` +
          `    drain order management for remote proxies is not supported in v1. Run this\n` +
          `    command on the host running CLIProxy to clear them.`
      )
    );
    console.log('');
    process.exitCode = 1;
    return;
  }

  const localPort = resolveLifecyclePort();
  const proxyStatus = await detectRunningProxy(localPort);

  // Ambiguous state: proxy alive but not yet serving HTTP. A direct write could
  // be clobbered; refuse rather than risk a half-cleared state.
  if (proxyStatus.running && !proxyStatus.verified) {
    if (configCleared) {
      console.log(ok(`Drain order config cleared for ${provider} (mode reset to file order).`));
    }
    console.log(
      fail(
        'Proxy state ambiguous - residual priorities not cleared. Retry in a moment or stop the proxy first.'
      )
    );
    console.log('');
    process.exitCode = 1;
    return;
  }

  const proxyRunning = proxyStatus.running && proxyStatus.verified;
  if (proxyRunning) {
    console.log(
      info('Proxy is running - clearing priorities via management API (avoids clobber race).')
    );
  } else {
    console.log(info('Proxy is stopped - clearing priorities directly in auth files.'));
  }

  const result = await clearDrainOrderPriorities(tokenFiles, proxyRunning);

  if (configCleared || result.cleared.length > 0) {
    console.log(ok(`Drain order reset to file order for ${provider}.`));
  } else {
    console.log(info(`No drain order config found for ${provider}. Already in file order.`));
  }

  if (result.cleared.length > 0) {
    console.log(ok(`Cleared residual priority from ${result.cleared.length} auth file(s).`));
  }
  if (result.alreadyClear.length > 0) {
    console.log(
      info(`${result.alreadyClear.length} auth file(s) had no priority set (nothing to clear).`)
    );
  }
  if (result.failed.length > 0) {
    for (const f of result.failed) {
      console.log(fail(`Failed to clear priority for ${f.tokenFile}: ${f.reason}`));
    }
    console.log(
      dim(
        '  Residual priorities remain on the failed files above and will still steer the selector.'
      )
    );
    process.exitCode = 1;
  }
  console.log('');
}

function printOrderHelp(provider?: string): void {
  const prov = provider ?? '<provider>';
  console.log(subheader('Usage:'));
  console.log(`  ${color(`ccs cliproxy accounts order ${prov}`, 'command')}`);
  console.log(`  ${color(`ccs cliproxy accounts order ${prov} --by-tier`, 'command')}`);
  console.log(`  ${color(`ccs cliproxy accounts order ${prov} --set a@x.com,b@y.com`, 'command')}`);
  console.log(`  ${color(`ccs cliproxy accounts order ${prov} --reset`, 'command')}`);
  console.log('');
  console.log(subheader('Options:'));
  console.log(`  ${dim('(no flags)')}   Show effective drain order`);
  console.log(
    `  ${color('--by-tier', 'command')}    Derive order from tier metadata (ultra > pro > free)`
  );
  console.log(
    `  ${color('--set', 'command')} <ids>  Set manual order (comma-separated account IDs)`
  );
  console.log(`  ${color('--reset', 'command')}      Revert to stable file order`);
  console.log('');
  console.log(dim('  Tier-based ordering is available for: agy, gemini'));
  console.log(dim('  Claude accounts have unknown tier; use --set for manual order.'));
  console.log('');
}

/**
 * Main handler for `ccs cliproxy accounts order <provider> [flags]`
 */
export async function handleOrderSubcommand(args: string[]): Promise<void> {
  await initUI();
  console.log('');
  console.log(header('CLIProxy Drain Order'));
  console.log('');

  if (hasAnyFlag(args, ['--help', '-h']) || args.length === 0) {
    printOrderHelp();
    return;
  }

  // First positional arg is provider name
  const providerRaw = args[0];
  if (!providerRaw || providerRaw.startsWith('-')) {
    console.log(fail('Provider name required. Usage: ccs cliproxy accounts order <provider>'));
    console.log('');
    printOrderHelp();
    process.exitCode = 1;
    return;
  }

  const provider = mapExternalProviderName(providerRaw) as CLIProxyProvider | null;
  if (!provider) {
    console.log(fail(`Unknown provider: ${providerRaw}`));
    console.log('');
    process.exitCode = 1;
    return;
  }

  const subArgs = args.slice(1);

  if (hasAnyFlag(subArgs, ['--reset'])) {
    await handleOrderReset(provider);
    return;
  }

  if (hasAnyFlag(subArgs, ['--by-tier'])) {
    await handleOrderByTier(provider);
    return;
  }

  const extracted = extractOption(subArgs, ['--set']);
  if (extracted.found) {
    if (extracted.missingValue || !extracted.value) {
      console.log(fail('--set requires a value: --set a@x.com,b@y.com,...'));
      console.log('');
      process.exitCode = 1;
      return;
    }
    await handleOrderSet(provider, extracted.value);
    return;
  }

  // Default: show current order
  await handleOrderShow(provider);
}
