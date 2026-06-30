/**
 * Auth Coordinator — Executor-level authentication handoff
 *
 * Extracted from executor/index.ts (Phase 06).
 * Handles:
 * - --logout early exit
 * - --import token early exit (Kiro only)
 * - --auth / forceAuth OAuth flow (single + composite providers)
 * - Antigravity responsibility gate (run and oauth contexts)
 * - isAuthenticated checks + automatic OAuth trigger
 * - Proactive token refresh (multi-provider for composite)
 * - lastUsedAt touch via touchDefaultAccount
 * - Preflight quota check
 * - Account safety guards (cross-provider isolation)
 * - First-run model configuration
 *
 * ORDERING (load-bearing — do not change):
 *   1. logout/import/forceAuth early exits
 *   2. Remote-proxy auth skip detection
 *   3. Antigravity gate (oauth context: remote+forceAuth | run context: else branch)
 *   4. OAuth check / trigger (single or composite)
 *   5. Token refresh
 *   6. lastUsedAt touch
 *   7. Preflight quota check
 *   8. Account safety guards
 *   9. First-run model configuration
 */

import { ok, fail, info } from '../../utils/ui';
import { isAuthenticated } from '../auth/auth-handler';
import { CLIProxyProvider, ExecutorConfig } from '../types';
import { getProviderConfig, ensureProviderSettings } from '../config/config-generator';
import { configureProviderModel, getCurrentModel } from '../config/model-config';
import { reconcileCodexModelForActivePlan } from '../ai-providers/codex-plan-compatibility';
import { supportsModelConfig } from '../model-catalog';
import {
  ensureCliAntigravityResponsibility,
  ANTIGRAVITY_ACCEPT_RISK_FLAGS,
} from '../auth/antigravity-responsibility';
import { handleTokenExpiration, handleQuotaCheck } from './retry-handler';
import { applyAccountSafetyGuards, touchDefaultAccount } from './account-resolution';
import { MANAGED_QUOTA_PROVIDERS } from '../quota/quota-manager';
import type { ParsedExecutorFlags } from './arg-parser';
import type { UnifiedConfig } from '../../config/schemas/unified-config';

// ── Context / Result types ─────────────────────────────────────────────────────

export interface AuthCoordinationContext {
  provider: CLIProxyProvider;
  compositeProviders: CLIProxyProvider[];
  parsedFlags: ParsedExecutorFlags;
  cfg: ExecutorConfig;
  unifiedConfig: UnifiedConfig;
  verbose: boolean;
  log: (msg: string) => void;
}

// ── 1. Special early-exit auth flags (logout / import) ────────────────────────

/**
 * Handle --logout: clear auth and exit 0.
 * Returns true if early exit occurred (caller should return immediately).
 */
export async function handleLogout(context: AuthCoordinationContext): Promise<boolean> {
  const { provider, parsedFlags } = context;
  if (!parsedFlags.forceLogout) return false;

  const providerConfig = getProviderConfig(provider);
  const { clearAuth } = await import('../auth/auth-handler');
  if (clearAuth(provider)) {
    console.log(ok(`Logged out from ${providerConfig.displayName}`));
  } else {
    console.log(info(`No authentication found for ${providerConfig.displayName}`));
  }
  process.exit(0);
}

/**
 * Handle --import: Kiro-only token import flow, exits when done.
 * Returns true if early exit occurred.
 */
export async function handleImport(context: AuthCoordinationContext): Promise<boolean> {
  const { provider, parsedFlags, verbose } = context;
  const {
    forceImport,
    forceAuth,
    forceLogout,
    kiroAuthMethod,
    kiroIDCStartUrl,
    kiroIDCRegion,
    kiroIDCFlow,
    setNickname,
  } = parsedFlags;

  if (!forceImport) return false;

  if (provider !== 'kiro') {
    process.stderr.write(String(fail('--import is only available for Kiro')) + '\n');
    process.stderr.write(`    Run "ccs ${provider} --auth" to authenticate` + '\n');
    process.exit(1);
  }
  if (forceAuth) {
    process.stderr.write(String(fail('Cannot use --import with --auth')) + '\n');
    process.stderr.write('    --import: Import existing token from Kiro IDE' + '\n');
    process.stderr.write('    --auth: Trigger new OAuth flow in browser' + '\n');
    process.exit(1);
  }
  if (forceLogout) {
    process.stderr.write(String(fail('Cannot use --import with --logout')) + '\n');
    process.exit(1);
  }

  const { triggerOAuth } = await import('../auth/auth-handler');
  const authSuccess = await triggerOAuth(provider, {
    verbose,
    import: true,
    ...(kiroAuthMethod ? { kiroMethod: kiroAuthMethod } : {}),
    ...(kiroIDCStartUrl ? { kiroIDCStartUrl } : {}),
    ...(kiroIDCRegion ? { kiroIDCRegion } : {}),
    ...(kiroIDCFlow ? { kiroIDCFlow } : {}),
    ...(setNickname ? { nickname: setNickname } : {}),
  });
  if (!authSuccess) {
    process.stderr.write(String(fail('Failed to import Kiro token from IDE')) + '\n');
    process.stderr.write('    Make sure you are logged into Kiro IDE first' + '\n');
    process.exit(1);
  }
  process.exit(0);
}

// ── 2. Remote proxy auth skip ──────────────────────────────────────────────────

/**
 * Returns true when a remote proxy with an authToken is active —
 * local OAuth is not needed in this case.
 */
export function resolveSkipLocalAuth(
  remoteAuthToken: string | undefined,
  useRemoteProxy: boolean
): boolean {
  return useRemoteProxy && !!remoteAuthToken?.trim();
}

// ── 3. Antigravity responsibility gate ────────────────────────────────────────

/**
 * Runs the Antigravity responsibility gate for the relevant code path.
 *
 * Two scenarios (must match original ordering in index.ts):
 *   A. provider=agy + forceAuth + skipLocalAuth → oauth-context gate; if refused, log and return
 *      (caller must return early — this function returns { earlyReturn: true })
 *   B. provider=agy + !forceAuth + (skipLocalAuth || !requiresAuthNow) → run-context gate;
 *      if refused, log and process.exit(1)
 *
 * Returns { earlyReturn: true } when the caller should return immediately (case A refused).
 */
export async function runAntigravityGate(
  context: AuthCoordinationContext,
  skipLocalAuth: boolean
): Promise<{ earlyReturn: boolean }> {
  const { provider, parsedFlags } = context;
  const { forceAuth, acceptAgyRisk } = parsedFlags;

  if (provider !== 'agy') return { earlyReturn: false };

  const providerConfig = getProviderConfig(provider);
  const requiresAuthNow = providerConfig.requiresOAuth && !isAuthenticated(provider);

  if (forceAuth && skipLocalAuth) {
    // Case A: remote proxy + forceAuth — gate in oauth context, skip local OAuth
    const acknowledged = await ensureCliAntigravityResponsibility({
      context: 'oauth',
      acceptedByFlag: acceptAgyRisk,
    });
    if (!acknowledged) {
      throw new Error(
        `Antigravity auth blocked. Re-run after completing confirmation or pass ${ANTIGRAVITY_ACCEPT_RISK_FLAGS[0]}.`
      );
    }
    process.stderr.write(
      String(info('Remote proxy mode is active; local OAuth flow is skipped in --auth mode.')) +
        '\n'
    );
    return { earlyReturn: true };
  }

  if (!forceAuth) {
    // Case B: run-context gate (only when auth not immediately required)
    if (skipLocalAuth || !requiresAuthNow) {
      const acknowledged = await ensureCliAntigravityResponsibility({
        context: 'run',
        acceptedByFlag: acceptAgyRisk,
      });
      if (!acknowledged) {
        process.stderr.write(
          String(
            fail(
              `Antigravity session blocked. Re-run after completing confirmation or pass ${ANTIGRAVITY_ACCEPT_RISK_FLAGS[0]}.`
            )
          ) + '\n'
        );
        process.exit(1);
      }
    }
  }

  return { earlyReturn: false };
}

// ── 4–6. OAuth check / trigger + token refresh + account touch ─────────────────

/**
 * Ensure provider(s) are authenticated; trigger OAuth if needed.
 * Handles both composite (multi-provider) and single-provider flows.
 * Also runs proactive token refresh and touches lastUsedAt.
 *
 * Only called when providerConfig.requiresOAuth && !skipLocalAuth.
 */
export async function ensureProviderAuthentication(
  context: AuthCoordinationContext
): Promise<void> {
  const { provider, compositeProviders, parsedFlags, verbose, log } = context;
  const {
    forceAuth,
    addAccount,
    acceptAgyRisk,
    kiroAuthMethod,
    kiroIDCStartUrl,
    kiroIDCRegion,
    kiroIDCFlow,
    gitlabTokenLogin,
    gitlabBaseUrl,
    forceHeadless,
    setNickname,
    noIncognito,
    pasteCallback,
    portForward,
  } = parsedFlags;

  log(`Checking authentication for ${provider}`);

  // Multi-provider path (composite variants)
  if (compositeProviders.length > 0) {
    if (forceAuth) {
      const { triggerOAuth } = await import('../auth/auth-handler');
      const failures: string[] = [];
      for (const p of compositeProviders) {
        const authSuccess = await triggerOAuth(p, {
          verbose,
          add: addAccount,
          ...(acceptAgyRisk ? { acceptAgyRisk: true } : {}),
          ...(kiroAuthMethod && p === 'kiro' ? { kiroMethod: kiroAuthMethod } : {}),
          ...(kiroIDCStartUrl && p === 'kiro' ? { kiroIDCStartUrl } : {}),
          ...(kiroIDCRegion && p === 'kiro' ? { kiroIDCRegion } : {}),
          ...(kiroIDCFlow && p === 'kiro' ? { kiroIDCFlow } : {}),
          ...(gitlabTokenLogin && p === 'gitlab' ? { gitlabAuthMode: 'pat' as const } : {}),
          ...(gitlabBaseUrl && p === 'gitlab' ? { gitlabBaseUrl } : {}),
          ...(forceHeadless ? { headless: true } : {}),
          ...(setNickname ? { nickname: setNickname } : {}),
          ...(noIncognito ? { noIncognito: true } : {}),
          ...(pasteCallback ? { pasteCallback: true } : {}),
          ...(portForward ? { portForward: true } : {}),
        });
        if (!authSuccess) {
          failures.push(p);
        }
      }
      if (failures.length > 0) {
        const succeeded = compositeProviders.filter((p) => !failures.includes(p));
        process.stderr.write(String(fail(`Auth failed for: ${failures.join(', ')}`)) + '\n');
        if (succeeded.length > 0) {
          process.stderr.write(String(info(`Succeeded: ${succeeded.join(', ')}`)) + '\n');
        }
        process.exit(1);
      }
      process.exit(0);
    }

    // Check for unauthenticated providers
    const unauthenticatedProviders: string[] = [];
    for (const p of compositeProviders) {
      if (!isAuthenticated(p)) {
        unauthenticatedProviders.push(p);
      }
    }
    if (unauthenticatedProviders.length > 0) {
      process.stderr.write(
        String(fail('Composite variant requires authentication for multiple providers:')) + '\n'
      );
      for (const p of unauthenticatedProviders) {
        process.stderr.write(`    - ${p} (run "ccs ${p} --auth")` + '\n');
      }
      process.exit(1);
    }
  } else {
    // Single-provider path
    if (forceAuth || !isAuthenticated(provider)) {
      const { triggerOAuth } = await import('../auth/auth-handler');
      const providerConfig = getProviderConfig(provider);
      const authSuccess = await triggerOAuth(provider, {
        verbose,
        add: addAccount,
        ...(acceptAgyRisk ? { acceptAgyRisk: true } : {}),
        ...(kiroAuthMethod ? { kiroMethod: kiroAuthMethod } : {}),
        ...(kiroIDCStartUrl ? { kiroIDCStartUrl } : {}),
        ...(kiroIDCRegion ? { kiroIDCRegion } : {}),
        ...(kiroIDCFlow ? { kiroIDCFlow } : {}),
        ...(gitlabTokenLogin ? { gitlabAuthMode: 'pat' as const } : {}),
        ...(gitlabBaseUrl ? { gitlabBaseUrl } : {}),
        ...(forceHeadless ? { headless: true } : {}),
        ...(setNickname ? { nickname: setNickname } : {}),
        ...(noIncognito ? { noIncognito: true } : {}),
        ...(pasteCallback ? { pasteCallback: true } : {}),
        ...(portForward ? { portForward: true } : {}),
      });
      if (!authSuccess) {
        throw new Error(`Authentication required for ${providerConfig.displayName}`);
      }
      if (forceAuth) {
        process.exit(0);
      }
    } else {
      log(`${provider} already authenticated`);
    }
  }

  // 3a. Proactive token refresh (multi-provider for composite)
  if (compositeProviders.length > 0) {
    for (const p of compositeProviders) {
      await handleTokenExpiration(p, verbose);
    }
  } else {
    await handleTokenExpiration(provider, verbose);
  }

  // 3a-1. Update lastUsedAt
  touchDefaultAccount(provider);
}

// ── 7. Preflight quota check ──────────────────────────────────────────────────

/**
 * Preflight quota check for providers with quota-based rotation.
 * Only runs when !skipLocalAuth.
 */
export async function runPreflightQuotaCheck(
  provider: CLIProxyProvider,
  compositeProviders: CLIProxyProvider[]
): Promise<void> {
  if (compositeProviders.length > 0) {
    for (const managedProvider of MANAGED_QUOTA_PROVIDERS) {
      if (compositeProviders.includes(managedProvider)) {
        await handleQuotaCheck(managedProvider);
      }
    }
  } else {
    await handleQuotaCheck(provider);
  }
}

// ── 8. Account safety guards ──────────────────────────────────────────────────

/**
 * Enforce cross-provider account isolation. Only runs when !skipLocalAuth.
 */
export function runAccountSafetyGuards(
  provider: CLIProxyProvider,
  compositeProviders: CLIProxyProvider[]
): void {
  applyAccountSafetyGuards(provider, compositeProviders);
}

// ── 9. First-run model configuration ─────────────────────────────────────────

/**
 * Ensure provider model is configured on first run.
 * Skipped for composite variants and remote proxy mode.
 * Also reconciles Codex model for active plan.
 *
 * claude is model-neutral passthrough: the user's own /model selection inside
 * Claude Code governs which model is used, so no auto-prompt at launch.
 * Use `ccs claude --config` for an explicit pin opt-in.
 */
export async function ensureModelConfiguration(
  provider: CLIProxyProvider,
  cfg: ExecutorConfig,
  verbose: boolean
): Promise<void> {
  if (!cfg.isComposite && provider !== 'claude' && supportsModelConfig(provider)) {
    await configureProviderModel(provider, false, cfg.customSettingsPath);
  }

  if (provider === 'codex' && !cfg.isComposite) {
    await reconcileCodexModelForActivePlan({
      currentModel: getCurrentModel(provider, cfg.customSettingsPath),
      verbose,
    });
  }
}

// ── Ensure provider settings file ────────────────────────────────────────────

/**
 * Ensure the provider settings file exists.
 */
export function ensureProviderSettingsFile(provider: CLIProxyProvider): void {
  ensureProviderSettings(provider);
}
