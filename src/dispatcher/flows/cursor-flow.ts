/**
 * Cursor dispatch flow — local Cursor daemon profile.
 *
 * Extracted from src/ccs.ts main() profileInfo.type === 'cursor' branch.
 */

import { fail, info } from '../../utils/ui';
import { ensureWebSearchMcpForLaunch } from '../../utils/websearch-manager';
import { ensureProfileHooks as ensureImageAnalyzerHooks } from '../../utils/hooks/image-analyzer-profile-hook-injector';
import { installImageAnalyzerHook } from '../../utils/hooks';
import type { ProfileDispatchContext } from '../dispatcher-context';

export async function runCursorFlow(ctx: ProfileDispatchContext): Promise<void> {
  const {
    profileInfo,
    resolvedTarget,
    claudeCli,
    remainingArgs,
    resolveProfileContinuityInheritance,
  } = ctx;

  ensureWebSearchMcpForLaunch();
  installImageAnalyzerHook();
  ensureImageAnalyzerHooks({
    profileName: profileInfo.name,
    profileType: profileInfo.type,
  });

  const { executeCursorProfile } = await import('../../cursor');
  const cursorConfig = profileInfo.cursorConfig;
  if (!cursorConfig) {
    console.error(fail('Cursor configuration not found'));
    process.exit(1);
  }
  const continuityInheritance = await resolveProfileContinuityInheritance({
    profileName: profileInfo.name,
    profileType: profileInfo.type,
    target: resolvedTarget,
  });
  if (continuityInheritance.sourceAccount && process.env.CCS_DEBUG) {
    console.error(
      info(
        `Continuity inheritance active: profile "${profileInfo.name}" -> account "${continuityInheritance.sourceAccount}"`
      )
    );
  }
  const exitCode = await executeCursorProfile(
    cursorConfig,
    remainingArgs,
    continuityInheritance.claudeConfigDir,
    claudeCli
  );
  process.exit(exitCode);
}
