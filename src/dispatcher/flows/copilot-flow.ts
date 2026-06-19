/**
 * Copilot dispatch flow — GitHub Copilot subscription via copilot-api proxy.
 *
 * Extracted from src/ccs.ts main() profileInfo.type === 'copilot' branch.
 */

import { fail, info } from '../../utils/ui';
import { ensureWebSearchMcpForLaunch } from '../../utils/websearch-manager';
import { ensureImageAnalysisMcpOrThrow } from '../../utils/image-analysis';
import {
  ensureProfileHooks as ensureImageAnalyzerHooks,
  removeImageAnalysisProfileHook,
} from '../../utils/hooks/image-analyzer-profile-hook-injector';
import { prepareImageAnalysisFallbackHook } from '../../utils/hooks';
import type { ProfileDispatchContext } from '../dispatcher-context';

export async function runCopilotFlow(ctx: ProfileDispatchContext): Promise<void> {
  const {
    profileInfo,
    resolvedTarget,
    claudeCli,
    remainingArgs,
    resolveProfileContinuityInheritance,
  } = ctx;

  ensureWebSearchMcpForLaunch();
  const imageAnalysisMcpReady = ensureImageAnalysisMcpOrThrow();
  if (resolvedTarget === 'claude') {
    if (imageAnalysisMcpReady) {
      removeImageAnalysisProfileHook(profileInfo.name);
    } else {
      const imageAnalysisFallbackHookReady = prepareImageAnalysisFallbackHook();
      ensureImageAnalyzerHooks({
        profileName: profileInfo.name,
        profileType: profileInfo.type,
        sharedHookInstalled: imageAnalysisFallbackHookReady,
      });
    }
  }

  const { executeCopilotProfile } = await import('../../copilot');
  const copilotConfig = profileInfo.copilotConfig;
  if (!copilotConfig) {
    console.error(fail('Copilot configuration not found'));
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
  const exitCode = await executeCopilotProfile(
    copilotConfig,
    remainingArgs,
    continuityInheritance.claudeConfigDir,
    claudeCli
  );
  process.exit(exitCode);
}
