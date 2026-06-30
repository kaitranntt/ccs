/**
 * Pool onboarding hint
 *
 * Fires once (per install, TTY only) when a user has >= 2 native Claude account
 * profiles and has not yet enabled pool routing.  Covers the #1464 use case:
 * existing users with multiple native profiles who have never touched CLIProxy
 * and would miss the 1->2 account-add opt-in prompt.
 *
 * Three hint sites call this module:
 *   1. ccs doctor  (post-checks summary, fires for ALL install types)
 *   2. account-flow launch (print-only, pre-spawn) - unified config only
 *   3. ccs auth create (before spawning Claude for a 2nd+ profile) - unified config only
 *
 * Sites 2 and 3 are gated on hasUnifiedConfig() so that legacy profiles.json-only
 * installs receive the hint exclusively from ccs doctor (site 1).  This ensures
 * once-per-install dismissal semantics for every install type: unified installs
 * dismiss via config.yaml on first show; legacy installs see the hint from
 * doctor only (which is the natural discovery surface for that population).
 *
 * Dismissal: stored in pool_routing.onboarding_hint_dismissed in config.yaml.
 * Reuses the Phase 3 pool_routing schema family - one schema home, no duplicate
 * plumbing.  Legacy installs cannot persist a dismissal without config.yaml;
 * this is intentional - dismissal for legacy users happens via ccs migrate or
 * pool enable (both create config.yaml).
 *
 * TTY contract: non-TTY sessions never print the hint (single line only).
 * The hint is informational only - it never blocks the calling flow.
 *
 * History note: pooled sessions live in the CLIProxy lane, not the native
 * profile's CLAUDE_CONFIG_DIR lane.  Transcripts and --continue inventory do
 * NOT follow.  This is stated on the docs page linked in the hint copy.
 */

import { info } from '../../utils/ui';
import {
  loadOrCreateUnifiedConfig,
  mutateConfig,
  hasUnifiedConfig,
} from '../../config/config-loader-facade';
import type { UnifiedConfig } from '../../config/unified-config-types';
import { ProfileRegistry } from '../../auth/profile-registry';

// Docs anchor - Phase 7 acceptance item: verify curl returns HTTP 200 before release.
// Pattern matches canonical docs domain used in error-codes.ts and version-command.ts.
export const POOL_DOCS_LINK = 'https://docs.ccs.kaitran.ca/features/pool';

/**
 * Whether the one-time pool onboarding hint has already been dismissed.
 *
 * @param config - Optional pre-loaded config to avoid a redundant disk read +
 *   YAML parse.  When omitted the config is loaded here.
 */
export function isOnboardingHintDismissed(config?: UnifiedConfig): boolean {
  const cfg = config ?? loadOrCreateUnifiedConfig();
  return cfg.cliproxy?.pool_routing?.onboarding_hint_dismissed === true;
}

/**
 * Mark the pool onboarding hint as permanently dismissed.
 * Written after first display so subsequent invocations are silent.
 *
 * Guard: skipped when config.yaml does not yet exist (legacy profiles.json-only
 * installs). Writing here would create config.yaml, flipping isUnifiedMode()
 * and silently mode-migrating the install outside the deliberate ccs migrate
 * flow. For those users the hint may re-appear across process restarts; that
 * is acceptable -- the hint is informational and non-blocking, and the user
 * can silence it permanently via ccs migrate.
 */
export function dismissOnboardingHint(): void {
  if (!hasUnifiedConfig()) {
    // Legacy-only install: skip persist to avoid implicit config.yaml creation.
    return;
  }
  mutateConfig((cfg) => {
    if (!cfg.cliproxy) return;
    cfg.cliproxy.pool_routing = {
      ...cfg.cliproxy.pool_routing,
      onboarding_hint_dismissed: true,
    };
  });
}

/**
 * Whether pool routing is currently enabled.
 *
 * @param config - Optional pre-loaded config to avoid a redundant disk read +
 *   YAML parse.  When omitted the config is loaded here.
 */
function isPoolEnabled(config?: UnifiedConfig): boolean {
  const cfg = config ?? loadOrCreateUnifiedConfig();
  return cfg.cliproxy?.pool_routing?.enabled === true;
}

/**
 * Count native Claude account profiles (type === 'account').
 *
 * Uses ProfileRegistry so the count respects both legacy profiles.json and
 * unified config accounts - same source of truth as the rest of the codebase.
 *
 * type === 'account' implies Claude: per the profile-registry schema, every
 * account profile is an isolated Claude instance (CLAUDE_CONFIG_DIR lane) with
 * no CLI discriminator. Gemini/Codex multi-account lives in CLIProxy auth
 * files, never in profiles.json, so this filter cannot over-count.
 */
export function countNativeClaudeProfiles(): number {
  try {
    const registry = new ProfileRegistry();
    const profiles = registry.getAllProfilesMerged();
    return Object.values(profiles).filter((p) => p.type === 'account').length;
  } catch {
    return 0;
  }
}

export interface OnboardingHintResult {
  /** Whether the hint was printed */
  printed: boolean;
  /** Why the hint was skipped (only set when printed === false) */
  skipReason?: string;
}

/**
 * Maybe print the one-time pool onboarding hint.
 *
 * Skips silently when any of the following are true:
 *   - Not a TTY (piped / CI / non-interactive)
 *   - Fewer than 2 native Claude account profiles exist
 *   - Pool routing is already enabled
 *   - The hint was already dismissed
 *   - Any error occurs while deciding (e.g. malformed config.yaml)
 *
 * Checks run cheapest-first: TTY and profile count are evaluated before any
 * config read, and the config is loaded exactly once for the two
 * config-derived checks.  The entire decision is wrapped in try/catch so a
 * hint failure can never break an account launch.
 *
 * When the hint is printed for the first time it is also dismissed so it
 * never appears again (it is informational, not an interactive prompt).
 *
 * @param profileCount - Pre-computed profile count (pass undefined to compute
 *   it here).  The caller may pass a count it already has to avoid a second
 *   registry read.
 */
export function maybeShowPoolOnboardingHint(profileCount?: number): OnboardingHintResult {
  // A hint must never break a launch.  Any error in the decision path
  // (malformed config.yaml, registry read failure, etc.) silently skips the
  // hint rather than rethrowing into the caller's account-launch flow.
  try {
    // Cheapest checks first, no disk read required.
    // Non-TTY: stay silent (piped / CI / non-interactive).
    if (!process.stdout.isTTY) {
      return { printed: false, skipReason: 'non-tty' };
    }

    const count = profileCount ?? countNativeClaudeProfiles();
    if (count < 2) {
      return { printed: false, skipReason: 'fewer-than-2-profiles' };
    }

    // Load config once and reuse it for both config-derived checks below,
    // avoiding two disk reads + YAML parses per call.
    const config = loadOrCreateUnifiedConfig();

    if (isPoolEnabled(config)) {
      return { printed: false, skipReason: 'pool-already-enabled' };
    }

    if (isOnboardingHintDismissed(config)) {
      return { printed: false, skipReason: 'dismissed' };
    }

    console.log(
      info(
        `You have ${count} Claude profiles. Pool routing can auto-continue 'ccs claude' when one account hits its limit. Enable: ccs cliproxy pool --enable  Docs: ${POOL_DOCS_LINK}`
      )
    );

    // Dismiss so subsequent invocations (other sites or next run) are silent.
    try {
      dismissOnboardingHint();
    } catch {
      // Best-effort: a config write failure must not surface to the user here.
    }

    return { printed: true };
  } catch {
    // Decision failed (e.g. malformed config) - skip the hint, never throw.
    return { printed: false, skipReason: 'error' };
  }
}
