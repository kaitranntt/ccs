/**
 * Profile and target resolution — Phase C extraction from src/ccs.ts.
 *
 * Extracted from main() lines ~136–313 (after Phase B pre-dispatch).
 * Responsible for: dynamic imports of auth modules, profile detection, target type
 * resolution, Claude CLI detection, target adapter resolution, compatibility preflight
 * checks (preserved with duplication per plan risk note 5), binary detection, and
 * per-target argument normalization (droid routing + reasoning flag stripping,
 * codex reasoning normalization, native Claude effort normalization).
 *
 * Outputs a ResolvedProfile context object consumed by Phase D (environment-builder
 * argument normalization) and Phase E (per-profile dispatch flows).
 */

import { detectClaudeCli } from '../utils/claude-detector';
import { getSettingsPath } from '../utils/config-manager';
import { loadSettings } from '../config/config-loader-facade';
import { expandPath } from '../utils/helpers';
import { fail, info, warn } from '../utils/ui';
import { ErrorManager } from '../utils/error-manager';
import { getBrowserConfig } from '../config/config-loader-facade';
import {
  getEffectiveClaudeBrowserAttachConfig,
  resolveBrowserExposure,
  getBlockedBrowserOverrideWarning,
} from '../utils/browser';
import { getTarget, evaluateTargetRuntimeCompatibility, pruneOrphanedModels } from '../targets';
import { resolveTargetType, stripTargetFlag } from '../targets/target-resolver';
import { DroidReasoningFlagError } from '../targets/droid-reasoning-runtime';
import { DroidCommandRouterError, routeDroidCommandArgs } from '../targets/droid-command-router';
import { resolveCliproxyBridgeMetadata } from '../api/services/cliproxy-profile-bridge';
import { resolveCodexRuntimeConfigOverrides } from './environment-builder';
import {
  detectProfile,
  resolveRuntimeReasoningFlags,
  normalizeCodexRuntimeReasoningOverride,
  exitWithRuntimeReasoningFlagError,
  normalizeNativeClaudeEffortArgs,
  shouldNormalizeNativeClaudeEffort,
} from './cli-argument-parser';
import type ProfileDetector from '../auth/profile-detector';
import type { ProfileDetectionResult } from '../auth/profile-detector';
import type { BrowserLaunchOverride } from '../utils/browser';
import type { ResolvedBrowserExposure } from '../utils/browser/browser-policy';
import type { Logger } from '../services/logging/logger';
import type { TargetAdapter, TargetBinaryInfo } from '../targets';

// ========== Interfaces ==========

export interface ProfileResolutionContext {
  args: string[];
  browserLaunchOverride: BrowserLaunchOverride | undefined;
  cliLogger: Logger;
}

export interface ResolvedProfile {
  /** Detected profile name (first positional arg or 'default') */
  profile: string;
  /** Args remaining after stripping profile token and --target flags */
  remainingArgs: string[];
  profileInfo: ProfileDetectionResult;
  resolvedTarget: ReturnType<typeof resolveTargetType>;
  claudeCli: string;
  targetAdapter: TargetAdapter | null;
  targetBinaryInfo: TargetBinaryInfo | null;
  resolvedSettingsPath: string | undefined;
  resolvedSettings: ReturnType<typeof loadSettings> | undefined;
  resolvedCliproxyBridge: ReturnType<typeof resolveCliproxyBridgeMetadata> | undefined;
  /** Per-target normalized args (droid/codex routing applied) */
  targetRemainingArgs: string[];
  /** Claude-specific args with effort normalization applied */
  nativeClaudeRemainingArgs: string[];
  runtimeReasoningOverride: string | number | undefined;
  codexRuntimeConfigOverrides: string[];
  claudeBrowserExposure: ResolvedBrowserExposure | undefined;
  codexBrowserExposure: ResolvedBrowserExposure | undefined;
  claudeAttachConfig: ReturnType<typeof getEffectiveClaudeBrowserAttachConfig> | undefined;
  /** ProfileDetector instance — Phase E account/settings flows need getAllProfiles() */
  detector: InstanceType<typeof ProfileDetector>;
}

function usesImplicitDefaultProfile(cleanArgs: string[]): boolean {
  return cleanArgs.length === 0 || cleanArgs[0]?.startsWith('-') === true;
}

function buildNativeCodexDefaultProfile(): ProfileDetectionResult {
  return {
    type: 'default',
    name: 'default',
    message: 'Using native Codex auth; CCS default profile is not applied to Codex target.',
  };
}

// ========== Profile and Target Resolver ==========

/**
 * Resolve profile detection, target type, adapter, binary, and per-target arg normalization.
 *
 * Throws ProfileError (caught by main() try/catch) for unknown profiles.
 * Calls process.exit(1) for hard-stop conditions (adapter not found, binary not found, etc.).
 *
 * NOTE: The compatibility preflight block for non-settings profiles (else branch) is
 * INTENTIONALLY duplicated between here (Phase C) and the settings flow (Phase E).
 * Per plan risk note 5, do NOT dedupe in this PR.
 */
export async function resolveProfileAndTarget(
  ctx: ProfileResolutionContext
): Promise<ResolvedProfile> {
  const { args, browserLaunchOverride } = ctx;

  // Dynamic imports — preserved at original call sites for latency/circular-dep avoidance.
  // InstanceManager, ProfileRegistry, AccountContext, ProfileContinuity are loaded here
  // to match original ordering; their resolved values flow into Phase E via the detector
  // instance or are re-imported inside flow handlers.
  const ProfileDetectorModule = await import('../auth/profile-detector');
  const ProfileDetectorClass = ProfileDetectorModule.default;
  await import('../management/instance-manager');
  await import('../auth/profile-registry');
  await import('../auth/account-context');
  await import('../auth/profile-continuity-inheritance');

  const detector = new ProfileDetectorClass();

  // Detect profile (strip --target flags before profile detection)
  const cleanArgs = stripTargetFlag(args);
  const { profile, remainingArgs } = detectProfile(cleanArgs);
  let profileInfo: ProfileDetectionResult = detector.detectProfileType(profile);

  let resolvedTarget: ReturnType<typeof resolveTargetType>;
  try {
    resolvedTarget = resolveTargetType(
      args,
      profileInfo.target ? { target: profileInfo.target } : undefined
    );
  } catch (error) {
    console.error(fail((error as Error).message));
    process.exit(1);
    // Unreachable; needed so TS knows resolvedTarget is always assigned below
    throw error;
  }

  if (resolvedTarget === 'codex' && usesImplicitDefaultProfile(cleanArgs)) {
    profileInfo = buildNativeCodexDefaultProfile();
  }

  // Detect Claude CLI (needed for claude target and all CLIProxy-derived flows)
  const claudeCliRaw = detectClaudeCli();
  if (resolvedTarget === 'claude' && !claudeCliRaw) {
    await ErrorManager.showClaudeNotFound();
    process.exit(1);
  }
  const claudeCli = claudeCliRaw || '';

  // Resolve non-claude target adapter once.
  const targetAdapter: TargetAdapter | null =
    resolvedTarget !== 'claude' ? (getTarget(resolvedTarget) ?? null) : null;
  let resolvedSettingsPath: string | undefined;
  let resolvedSettings: ReturnType<typeof loadSettings> | undefined;
  let resolvedCliproxyBridge: ReturnType<typeof resolveCliproxyBridgeMetadata> | undefined;

  // Preflight unsupported profile/target combinations BEFORE binary detection,
  // so users get the most actionable error even when the target CLI is not installed.
  if (resolvedTarget !== 'claude') {
    if (!targetAdapter) {
      console.error(fail(`Target adapter not found for "${resolvedTarget}"`));
      process.exit(1);
    }

    if (profileInfo.type === 'settings') {
      resolvedSettingsPath = profileInfo.settingsPath
        ? expandPath(profileInfo.settingsPath)
        : getSettingsPath(profileInfo.name);
      resolvedSettings = loadSettings(resolvedSettingsPath);
      resolvedCliproxyBridge = resolveCliproxyBridgeMetadata(resolvedSettings);
      const compatibility = evaluateTargetRuntimeCompatibility({
        target: resolvedTarget,
        profileType: profileInfo.type,
        cliproxyBridgeProvider: resolvedCliproxyBridge?.provider ?? null,
      });
      if (!compatibility.supported) {
        console.error(
          fail(
            compatibility.reason || `${targetAdapter.displayName} does not support this profile.`
          )
        );
        if (compatibility.suggestion) {
          console.error(info(compatibility.suggestion));
        }
        process.exit(1);
      }
    } else {
      // NOTE: Intentional duplication — Phase E settings flow re-runs this check post-load.
      // Per plan risk note 5, preserve verbatim; do NOT dedupe.
      const compatibility = evaluateTargetRuntimeCompatibility({
        target: resolvedTarget,
        profileType: profileInfo.type,
        cliproxyProvider: profileInfo.type === 'cliproxy' ? profileInfo.provider : undefined,
        isComposite: profileInfo.type === 'cliproxy' ? Boolean(profileInfo.isComposite) : undefined,
      });
      if (!compatibility.supported) {
        console.error(
          fail(
            compatibility.reason || `${targetAdapter.displayName} does not support this profile.`
          )
        );
        if (compatibility.suggestion) {
          console.error(info(compatibility.suggestion));
        }
        process.exit(1);
      }
    }

    if (profileInfo.type === 'default') {
      if (!targetAdapter.supportsProfileType('default')) {
        console.error(fail(`${targetAdapter.displayName} does not support default profile mode`));
        process.exit(1);
      }

      // For default mode, Droid requires explicit credentials from environment.
      if (resolvedTarget === 'droid') {
        const baseUrl = process.env['ANTHROPIC_BASE_URL'] || '';
        const apiKey = process.env['ANTHROPIC_AUTH_TOKEN'] || '';
        if (!baseUrl.trim() || !apiKey.trim()) {
          console.error(
            fail(
              `${targetAdapter.displayName} default mode requires ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN`
            )
          );
          console.error(info('Use a settings-based profile instead: ccs glm --target droid'));
          process.exit(1);
        }
      }
    }
  }

  // For non-claude targets, verify target binary exists once and pass it through.
  const targetBinaryInfo: TargetBinaryInfo | null = targetAdapter?.detectBinary() ?? null;
  const browserConfig = getBrowserConfig();
  const claudeAttachConfig =
    resolvedTarget === 'claude' ? getEffectiveClaudeBrowserAttachConfig(browserConfig) : undefined;
  const codexRuntimeConfigOverrides = resolveCodexRuntimeConfigOverrides(
    resolvedTarget,
    browserLaunchOverride
  );
  const claudeBrowserExposure: ResolvedBrowserExposure | undefined =
    resolvedTarget === 'claude'
      ? resolveBrowserExposure(
          {
            enabled: claudeAttachConfig?.enabled ?? browserConfig.claude.enabled,
            policy: browserConfig.claude.policy,
          },
          browserLaunchOverride
        )
      : undefined;
  const codexBrowserExposure: ResolvedBrowserExposure | undefined =
    resolvedTarget === 'codex'
      ? resolveBrowserExposure(browserConfig.codex, browserLaunchOverride)
      : undefined;
  const blockedBrowserOverrideWarning =
    resolvedTarget === 'claude' && claudeBrowserExposure
      ? getBlockedBrowserOverrideWarning('Claude Browser Attach', claudeBrowserExposure)
      : resolvedTarget === 'codex' && codexBrowserExposure
        ? getBlockedBrowserOverrideWarning('Codex Browser Tools', codexBrowserExposure)
        : undefined;
  if (blockedBrowserOverrideWarning) {
    console.error(warn(blockedBrowserOverrideWarning));
  }
  if (resolvedTarget !== 'claude' && !targetBinaryInfo) {
    const displayName = targetAdapter?.displayName || resolvedTarget;
    console.error(fail(`${displayName} CLI not found.`));
    if (resolvedTarget === 'droid') {
      console.error(info('Install: npm i -g @factory/cli'));
    } else if (resolvedTarget === 'codex') {
      console.error(info('Install a recent @openai/codex build, then retry.'));
    }
    process.exit(1);
  }

  // Best-effort: prune stale Droid model entries at runtime so settings.json stays clean.
  if (resolvedTarget === 'droid') {
    try {
      const allProfiles = detector.getAllProfiles();
      const activeProfiles = allProfiles.settings.filter((name) => /^[a-zA-Z0-9._-]+$/.test(name));
      await pruneOrphanedModels(activeProfiles);
    } catch (error) {
      console.error(warn(`[!] Droid prune skipped: ${(error as Error).message}`));
    }
  }

  // Per-target argument normalization
  let targetRemainingArgs = remainingArgs;
  let runtimeReasoningOverride: string | number | undefined;
  let nativeClaudeRemainingArgs = remainingArgs;

  if (resolvedTarget === 'droid') {
    try {
      const droidRoute = routeDroidCommandArgs(remainingArgs);
      targetRemainingArgs = droidRoute.argsForDroid;

      if (droidRoute.mode === 'interactive') {
        const runtime = resolveRuntimeReasoningFlags(remainingArgs, process.env['CCS_THINKING']);
        targetRemainingArgs = runtime.argsWithoutReasoningFlags;
        runtimeReasoningOverride = runtime.reasoningOverride;
      } else {
        if (droidRoute.duplicateReasoningDisplays.length > 0) {
          console.error(
            warn(
              `[!] Multiple reasoning flags detected. Using first occurrence: ${droidRoute.reasoningSourceDisplay || '<first-flag>'}`
            )
          );
        }
        if (droidRoute.autoPrependedExec && process.stdout.isTTY) {
          console.error(
            info('Detected Droid exec-only flags. Routing as: droid exec <flags> [prompt]')
          );
        }
      }
    } catch (error) {
      if (error instanceof DroidReasoningFlagError || error instanceof DroidCommandRouterError) {
        exitWithRuntimeReasoningFlagError(error.message, {
          codexAliasLevels: 'minimal|low|medium|high|xhigh',
          includeDroidExecExample: true,
        });
      }
      throw error;
    }
  } else if (resolvedTarget === 'codex') {
    try {
      const runtime = resolveRuntimeReasoningFlags(remainingArgs, process.env['CCS_THINKING']);
      targetRemainingArgs = runtime.argsWithoutReasoningFlags;
      const normalizedReasoning = normalizeCodexRuntimeReasoningOverride(runtime.reasoningOverride);
      if (runtime.reasoningOverride !== undefined && !normalizedReasoning) {
        if (runtime.reasoningSource === 'flag') {
          throw new DroidReasoningFlagError(
            'Codex target supports reasoning levels only: minimal, low, medium, high, xhigh.',
            '--effort'
          );
        }
        runtimeReasoningOverride = undefined;
      } else {
        runtimeReasoningOverride = normalizedReasoning;
      }
    } catch (error) {
      if (error instanceof DroidReasoningFlagError) {
        exitWithRuntimeReasoningFlagError(error.message, {
          codexAliasLevels: 'minimal|low|medium|high|xhigh',
        });
      }
      throw error;
    }
  } else if (resolvedTarget === 'claude' && shouldNormalizeNativeClaudeEffort(profileInfo.type)) {
    nativeClaudeRemainingArgs = normalizeNativeClaudeEffortArgs(remainingArgs);
  }

  return {
    profile,
    remainingArgs,
    profileInfo,
    resolvedTarget,
    claudeCli,
    targetAdapter,
    targetBinaryInfo,
    resolvedSettingsPath,
    resolvedSettings,
    resolvedCliproxyBridge,
    targetRemainingArgs,
    nativeClaudeRemainingArgs,
    runtimeReasoningOverride,
    codexRuntimeConfigOverrides,
    claudeBrowserExposure,
    codexBrowserExposure,
    claudeAttachConfig,
    detector,
  };
}
