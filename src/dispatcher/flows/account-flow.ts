/**
 * Account dispatch flow — account-based profile (work, personal) with instance isolation.
 *
 * Extracted from src/ccs.ts main() profileInfo.type === 'account' branch.
 * Uses CLAUDE_CONFIG_DIR for per-profile instance isolation on all platforms.
 */

import { execClaude } from '../../utils/shell-executor';
import { maybeWarnAboutResumeLaneMismatch } from '../../auth/resume-lane-warning';
import { isProfileLocalSharedResourceMode } from '../../auth/shared-resource-policy';
import { resolveNativeClaudeLaunchArgs } from '../environment-builder';
import type { ProfileDispatchContext } from '../dispatcher-context';
import { maybeShowPoolOnboardingHint } from '../../cliproxy/routing/pool-onboarding-hint';
import { hasUnifiedConfig } from '../../config/config-loader-facade';

export async function runAccountFlow(ctx: ProfileDispatchContext): Promise<void> {
  const {
    profileInfo,
    claudeCli,
    nativeClaudeRemainingArgs,
    InstanceManager,
    ProfileRegistry,
    resolveAccountContextPolicy,
    isAccountContextMetadata,
  } = ctx;

  const registry = new ProfileRegistry();
  const instanceMgr = new InstanceManager();
  const accountMetadata = isAccountContextMetadata(profileInfo.profile)
    ? profileInfo.profile
    : undefined;
  const isBareProfile = isProfileLocalSharedResourceMode(
    typeof profileInfo.profile === 'object' && profileInfo.profile !== null
      ? (profileInfo.profile as { shared_resource_mode?: unknown; bare?: unknown })
      : undefined
  );
  const contextPolicy = resolveAccountContextPolicy(accountMetadata);

  // Ensure instance exists (lazy init if needed)
  const instancePath = await instanceMgr.ensureInstance(profileInfo.name, contextPolicy, {
    bare: isBareProfile,
  });

  // Update last_used timestamp (check unified config first, fallback to legacy)
  if (registry.hasAccountUnified(profileInfo.name)) {
    registry.touchAccountUnified(profileInfo.name);
  } else {
    registry.touchProfile(profileInfo.name);
  }

  // Execute Claude with instance isolation.
  // Skip WebSearch hook — account profiles use native server-side WebSearch.
  // Skip Image Analyzer hook — account profiles have native vision support.
  const envVars: NodeJS.ProcessEnv = {
    CLAUDE_CONFIG_DIR: instancePath,
    CCS_PROFILE_TYPE: 'account',
    CCS_WEBSEARCH_SKIP: '1',
    CCS_IMAGE_ANALYSIS_SKIP: '1',
  };
  await maybeWarnAboutResumeLaneMismatch(profileInfo.name, instancePath, nativeClaudeRemainingArgs);

  // One-time pool onboarding hint: fires when >= 2 native Claude profiles exist
  // and pool routing is not yet enabled.  Print-only, TTY-gated, never blocks spawn.
  // Gated on hasUnifiedConfig() so legacy profiles.json-only installs receive the
  // hint from ccs doctor only (where dismissal semantics are preserved).
  if (hasUnifiedConfig()) {
    maybeShowPoolOnboardingHint();
  }

  const launchArgs = resolveNativeClaudeLaunchArgs(
    nativeClaudeRemainingArgs,
    'account',
    instancePath
  );
  execClaude(claudeCli, launchArgs, envVars);
}
