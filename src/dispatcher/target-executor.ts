/**
 * Native target execution — short-circuit dispatch for passthrough flag commands,
 * and top-level profile dispatcher (Phase E switch).
 *
 * Extracted from src/ccs.ts (lines 291-295, 394-426).
 * Handles direct execution of native Codex passthrough commands (--help, resume, etc.)
 * before the main profile dispatch loop runs.
 *
 * dispatchProfile() collapses the 6-branch switch in main() to a single call.
 */

import { fail, info } from '../utils/ui';
import { getTarget } from '../targets';
import { getNativeCodexPassthroughArgs } from './cli-argument-parser';
import { runCliproxyFlow } from './flows/cliproxy-flow';
import { runCopilotFlow } from './flows/copilot-flow';
import { runCursorFlow } from './flows/cursor-flow';
import { runSettingsFlow } from './flows/settings-flow';
import { runAccountFlow } from './flows/account-flow';
import { runDefaultFlow } from './flows/default-flow';
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
    case 'cliproxy':
      return runCliproxyFlow(ctx);
    case 'copilot':
      return runCopilotFlow(ctx);
    case 'cursor':
      return runCursorFlow(ctx);
    case 'settings':
      return runSettingsFlow(ctx);
    case 'account':
      return runAccountFlow(ctx);
    default:
      return runDefaultFlow(ctx);
  }
}
