/**
 * Native target execution — short-circuit dispatch for passthrough flag commands,
 * and top-level profile dispatcher (Phase E switch).
 *
 * Extracted from src/ccs.ts (lines 291-295, 394-426).
 * Handles direct execution of native Codex passthrough commands (--help, resume, etc.)
 * before the main profile dispatch loop runs.
 *
 * dispatchProfile() collapses the 6-branch switch in main() to a single call and
 * lazy-loads only the selected flow module.
 */

import { fail, info } from '../utils/ui';
import { CodexAdapter, getTarget, hasTarget, registerTarget } from '../targets';
import { getNativeCodexPassthroughArgs } from './cli-argument-parser';
import type { TargetCredentials } from '../targets';
import type { ProfileDispatchContext } from './dispatcher-context';

// ========== Interfaces ==========

export interface ProfileError extends Error {
  profileName?: string;
  availableProfiles?: string;
  suggestions?: string[];
}

// ========== Native Codex Command Executor ==========

export function execNativeCodexCommand(args: string[]): void {
  if (!hasTarget('codex')) {
    registerTarget(new CodexAdapter());
  }

  const adapter = getTarget('codex');
  if (!adapter) {
    console.error(fail('Target adapter not found for "codex"'));
    process.exit(1);
  }

  const binaryInfo = adapter.detectBinary();
  if (!binaryInfo) {
    console.error(fail('Codex CLI not found.'));
    console.error(info('Install a recent @openai/codex build, then retry.'));
    process.exit(1);
  }

  const targetArgs = getNativeCodexPassthroughArgs(args);
  if (!targetArgs) {
    console.error(fail('Native Codex passthrough args could not be resolved.'));
    process.exit(1);
  }
  const creds: TargetCredentials = {
    profile: 'default',
    baseUrl: '',
    apiKey: '',
  };

  const builtArgs = adapter.buildArgs('default', targetArgs, {
    creds,
    profileType: 'default',
    binaryInfo,
  });
  const targetEnv = adapter.buildEnv(creds, 'default');
  adapter.exec(builtArgs, targetEnv, { binaryInfo });
}

// ========== Profile Dispatcher ==========

/**
 * Dispatch to the correct per-profile-type flow.
 *
 * Collapses the 6-branch if/else-if switch that previously lived in main() into a
 * single call site. The headless -p delegation short-circuit is handled in main()
 * before this function is called.
 */
export async function dispatchProfile(ctx: ProfileDispatchContext): Promise<void> {
  const { profileInfo } = ctx;

  switch (profileInfo.type) {
    case 'cliproxy': {
      const { runCliproxyFlow } = await import('./flows/cliproxy-flow');
      return runCliproxyFlow(ctx);
    }
    case 'copilot': {
      const { runCopilotFlow } = await import('./flows/copilot-flow');
      return runCopilotFlow(ctx);
    }
    case 'cursor': {
      const { runCursorFlow } = await import('./flows/cursor-flow');
      return runCursorFlow(ctx);
    }
    case 'settings': {
      const { runSettingsFlow } = await import('./flows/settings-flow');
      return runSettingsFlow(ctx);
    }
    case 'account': {
      const { runAccountFlow } = await import('./flows/account-flow');
      return runAccountFlow(ctx);
    }
    default: {
      const { runDefaultFlow } = await import('./flows/default-flow');
      return runDefaultFlow(ctx);
    }
  }
}
