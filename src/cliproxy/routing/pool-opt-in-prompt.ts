/**
 * Pool routing opt-in prompt
 *
 * Fires at the 1->2 account-add transition for verified providers (claude, agy).
 * Informed-consent copy: discloses instance-global effect and lists ALL providers
 * with >=2 accounts that will be affected.
 *
 * Codex/gemini get no prompt until failover behavior is verified for pool routing
 * (spike Test D pending).  They continue with implicit round-robin.
 *
 * Remote/Docker targets: prompt replaced by manual-config hint because session
 * affinity is not remotely toggleable from CCS (PR #1117 precedent).
 */

import { info, warn } from '../../utils/ui';
import { InteractivePrompt } from '../../utils/prompt';
import { getProxyTarget } from '../proxy/proxy-target-resolver';
import {
  enablePoolRouting,
  POOL_ROUTING_VERIFIED_PROVIDERS,
  POOL_MAX_RETRY_CREDENTIALS,
} from './routing-strategy';
import {
  loadOrCreateUnifiedConfig,
  mutateConfig,
  hasUnifiedConfig,
} from '../../config/config-loader-facade';
import { CLIPROXY_DEFAULT_PORT } from '../config/port-manager';
import { getConfigPathForPort } from '../config/path-resolver';
import { getAuthDir } from '../config/path-resolver';
import type { CLIProxyProvider } from '../types';
import { getProviderAccounts } from '../accounts/account-manager';
import { loadAccountsRegistry } from '../accounts/registry';

/**
 * Collect names of all providers that currently have >= 2 accounts registered.
 * Derived from the registry's actual provider keys so this list can never drift
 * from the CLIProxyProvider type union (spec requirement: disclose ALL affected
 * providers, not just a hardcoded subset).
 */
function getMultiAccountProviders(): CLIProxyProvider[] {
  const result: CLIProxyProvider[] = [];
  try {
    const registry = loadAccountsRegistry();
    for (const p of Object.keys(registry.providers) as CLIProxyProvider[]) {
      try {
        if (getProviderAccounts(p).length >= 2) result.push(p);
      } catch {
        // Provider registry entry present but accounts unreadable — skip
      }
    }
  } catch {
    // Registry unreadable (first-run, corrupt) — return empty; caller falls back to provider param
  }
  return result;
}

/**
 * Whether the pool routing opt-in prompt has been permanently dismissed.
 * Dismissal is recorded per-provider in pool_routing.prompt_dismissed.
 */
export function isPoolPromptDismissed(): boolean {
  return loadOrCreateUnifiedConfig().cliproxy?.pool_routing?.prompt_dismissed === true;
}

/**
 * Mark the pool routing prompt as permanently dismissed (user said no explicitly).
 */
export function dismissPoolPrompt(): void {
  // Defense in depth: never write the unified config on a legacy install — that
  // would create config.yaml and silently flip isUnifiedMode().  maybeOfferPoolRouting
  // already gates the only caller, but this keeps the exported helper safe too.
  if (!hasUnifiedConfig()) return;
  mutateConfig((cfg) => {
    if (!cfg.cliproxy) return;
    cfg.cliproxy.pool_routing = {
      ...cfg.cliproxy.pool_routing,
      prompt_dismissed: true,
    };
  });
}

/**
 * Show the remote/Docker hint instead of an interactive prompt.
 * Session affinity is not remotely toggleable from CCS (fail-closed
 * per PR #1117 precedent) so we emit guidance only.
 */
function printRemoteHint(provider: CLIProxyProvider): void {
  console.log('');
  console.log(
    info(`[i] Pool routing hint: you now have 2+ ${provider} accounts on a remote/Docker CLIProxy.`)
  );
  console.log(
    '    CCS cannot toggle session affinity on remote targets yet (management API limitation).'
  );
  console.log('    To enable pool routing manually, add to your CLIProxy config.yaml:');
  console.log('      disable-cooling: false');
  console.log(`      max-retry-credentials: ${POOL_MAX_RETRY_CREDENTIALS}`);
  console.log('      routing:');
  console.log('        strategy: fill-first');
  console.log('        session-affinity: true');
  console.log('        session-affinity-ttl: "1h"');
  console.log('');
}

export interface PoolOptInResult {
  /** Whether the prompt was shown */
  prompted: boolean;
  /** Whether pool routing was enabled */
  enabled: boolean;
  /** Whether the prompt was skipped (remote, dismissed, not verified, already enabled) */
  skipped: boolean;
  skipReason?: string;
}

/**
 * Offer pool routing opt-in when the account count crosses 1->2 for a verified provider.
 *
 * Call this immediately after a successful account registration when the provider
 * transitions from 1 to 2 accounts.  The function is a no-op when:
 *   - Pool routing is already enabled
 *   - Provider is not in the verified pool list (codex, gemini, etc.)
 *   - The prompt was previously dismissed
 *   - Target is non-TTY (piped input / CI)
 *
 * Remote/Docker targets get a manual-config hint instead of an interactive prompt.
 *
 * @param provider - The provider that just reached 2 accounts
 * @param accountCountBefore - Number of accounts before this add (should be 1 for transition)
 * @param port - CLIProxy port (default: 8317)
 */
export async function maybeOfferPoolRouting(
  provider: CLIProxyProvider,
  accountCountBefore: number,
  port: number = CLIPROXY_DEFAULT_PORT
): Promise<PoolOptInResult> {
  // Fast path: only fire at the 1->2 transition (accountCountBefore check only).
  // The actual post-add count is verified below, after cheap early-exit guards pass,
  // so that provider/dismissed/remote guards still return their expected skipReason
  // regardless of whether the registry has been populated in the test environment.
  if (accountCountBefore !== 1) {
    return { prompted: false, enabled: false, skipped: true, skipReason: 'not-at-transition' };
  }

  // Legacy install guard: on a profiles.json/config.json-only install there is no
  // unified config.yaml.  Both accept (enablePoolRouting) and decline
  // (dismissPoolPrompt) write the unified config, which would create config.yaml
  // and silently flip isUnifiedMode() outside the deliberate `ccs migrate` flow,
  // orphaning the user's config.json profiles.  Skip entirely before any prompt
  // or dismissal persistence.  Mirrors the guards in create-command.ts and
  // account-flow.ts and the hazard documented in pool-onboarding-hint.ts.
  // Silent by design: legacy installs receive pool guidance exclusively from
  // ccs doctor (pool-onboarding-hint site 1); printing here would nag on every
  // account add with no dismissal available.
  if (!hasUnifiedConfig()) {
    return { prompted: false, enabled: false, skipped: true, skipReason: 'legacy-config' };
  }

  // Only for providers where pool routing is verified
  if (!POOL_ROUTING_VERIFIED_PROVIDERS.has(provider)) {
    return {
      prompted: false,
      enabled: false,
      skipped: true,
      skipReason: `provider-${provider}-unverified`,
    };
  }

  // No-op if already enabled
  const config = loadOrCreateUnifiedConfig();
  if (config.cliproxy?.pool_routing?.enabled === true) {
    return { prompted: false, enabled: true, skipped: true, skipReason: 'already-enabled' };
  }

  // No-op if user already dismissed
  if (isPoolPromptDismissed()) {
    return { prompted: false, enabled: false, skipped: true, skipReason: 'dismissed' };
  }

  // Remote / Docker target: print hint, do not prompt.
  // Check before account count so remote targets with locally-unknown registries
  // still get the hint (the remote CLIProxy holds the authoritative account list).
  const target = getProxyTarget();
  if (target.isRemote) {
    printRemoteHint(provider);
    return { prompted: false, enabled: false, skipped: true, skipReason: 'remote-target' };
  }

  // Verify the actual post-add count is >= 2.  registerAccount deduplicates by
  // email/token-file so re-authenticating the single existing account keeps the
  // count at 1 — not a real 1->2 transition.  Checking here (before TTY) ensures
  // re-auth dedup always returns not-at-transition even in non-TTY/CI sessions.
  const accountCountAfter = getProviderAccounts(provider).length;
  if (accountCountAfter < 2) {
    return { prompted: false, enabled: false, skipped: true, skipReason: 'not-at-transition' };
  }

  // Non-TTY (piped input / CI): skip silently
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    return { prompted: false, enabled: false, skipped: true, skipReason: 'non-tty' };
  }

  // Automation bypass: InteractivePrompt.confirm auto-returns true when --yes/-y
  // is in argv or CCS_YES=1 is set, regardless of the default:false.  This is an
  // INSTANCE-GLOBAL routing/cooling consent decision; a generic automation flag
  // must never grant it.  Skip WITHOUT printing the prompt and WITHOUT persisting
  // dismissal, so a future interactive run still offers the opt-in.
  if (
    process.env.CCS_YES === '1' ||
    process.argv.includes('--yes') ||
    process.argv.includes('-y')
  ) {
    return { prompted: false, enabled: false, skipped: true, skipReason: 'automation-bypass' };
  }

  // Gather all providers with 2+ accounts for disclosure
  const multiAccountProviders = getMultiAccountProviders();
  const providerList =
    multiAccountProviders.length > 0 ? multiAccountProviders.join(', ') : provider;

  console.log('');
  console.log(warn('Pool routing: you now have 2+ accounts for ' + provider));
  console.log('');
  console.log('    CCS can enable pool routing (fill-first + session affinity + 429 cooldown).');
  console.log('    This is an INSTANCE-GLOBAL change: it affects account selection for ALL');
  console.log(`    CLIProxy providers on this machine: ${providerList}`);
  console.log('');
  console.log('    What changes:');
  console.log('      - disable-cooling: false  (cooldown is required for retry-cap to work)');
  console.log('        A 429 suspends a credential briefly (1s -> 30m exp backoff).');
  console.log('        A 401/403 suspends it for 30 minutes (correct: broken auth = no traffic).');
  console.log('      - routing: fill-first      (drain one account before switching)');
  console.log('      - session-affinity: true   (TTL 1h, pinned per conversation)');
  console.log(
    `      - max-retry-credentials: ${POOL_MAX_RETRY_CREDENTIALS}  (stop after ${POOL_MAX_RETRY_CREDENTIALS} attempts per request)`
  );
  console.log('');
  console.log('    You can roll back at any time: ccs cliproxy pool --disable');
  console.log('    (Or re-enable later: ccs cliproxy pool --enable)');
  console.log('');

  const yes = await InteractivePrompt.confirm(
    '    Enable pool routing for all CLIProxy providers?',
    { default: false }
  );

  if (!yes) {
    // Persist decline so we don't re-ask on every subsequent add
    dismissPoolPrompt();
    console.log(
      info(
        "    Declined. Pool routing stays off. Run 'ccs cliproxy pool --enable' to opt in later."
      )
    );
    console.log('');
    return { prompted: true, enabled: false, skipped: false };
  }

  const configPath = getConfigPathForPort(port);
  const authDir = getAuthDir();
  const result = enablePoolRouting(port, { configPath, authDir });

  console.log('');
  if (result.failed) {
    // Config regeneration failed and the flag was rolled back: pool routing is
    // NOT active.  Surface the recovery copy and report enabled:false so callers
    // (and quota/dashboard) do not claim pool ON.
    console.log(warn(result.message));
    console.log('');
    return { prompted: true, enabled: false, skipped: false };
  }
  if (result.changed) {
    console.log(info(result.message));
  }
  console.log('');

  // User accepted and enablePoolRouting completed: pool routing is enabled
  // even when this call was an idempotent no-op (changed=false).
  return { prompted: true, enabled: true, skipped: false };
}
