/**
 * CLI argument parsing and normalization utilities.
 *
 * Extracted from src/ccs.ts (lines 129-244, 246-296, 371-392).
 * Pure functions — no side effects except console.error and process.exit.
 *
 * Also contains bootstrapAndParseEarlyCli() — the Phase A bootstrap extracted
 * from main() (lines 128-232 of the original). Handles: adapter registration,
 * UI init, --config-dir flag, cloud-sync warnings, completion short-circuit,
 * normalizeLegacyCursorArgs, resolveBrowserLaunchFlagResolution, codex passthrough.
 */

import * as fs from 'fs';
import { fail, warn, info } from '../utils/ui';
import { LEGACY_CURSOR_PROFILE_NAME } from '../cursor/constants';
import { resolveTargetType, stripTargetFlag } from '../targets/target-resolver';
import { resolveDroidReasoningRuntime } from '../targets/droid-reasoning-runtime';
import type { ProfileDetectionResult } from '../auth/profile-detector';
import { setGlobalConfigDir, detectCloudSyncPath } from '../utils/config-manager';
import { resolveBrowserLaunchFlagResolution } from '../utils/browser';
import type { BrowserLaunchOverride } from '../utils/browser';

// ========== Bootstrap Result ==========

/**
 * Result of the early CLI bootstrap pass.
 * All fields are consumed by main() to decide how to continue.
 */
export interface DispatcherBootstrap {
  /** Normalized/mutated args after pre-parse (--config-dir stripped, browser flags stripped, legacy cursor normalized) */
  args: string[];
  isCompletionCommand: boolean;
  browserLaunchOverride: BrowserLaunchOverride | undefined;
  /** true when the caller should return immediately (completion handled, codex passthrough triggered, process.exit called) */
  exitNow: boolean;
}

/**
 * Phase A bootstrap: runs everything that must happen before config loading and profile detection.
 *
 * Side-effects preserved from original main():
 * - Dynamic import of initUI
 * - setGlobalConfigDir (--config-dir flag)
 * - Cloud-sync warnings
 * - Completion short-circuit via tryHandleRootCommand
 * - Codex native passthrough via execNativeCodexCommand
 *
 * Adapter registration (registerTarget calls) stays in main() because it is
 * singleton wiring with no dependency on the parsed args.
 */
export async function bootstrapAndParseEarlyCli(rawArgs: string[]): Promise<DispatcherBootstrap> {
  let args = rawArgs;
  const isCompletionCommand = args[0] === '__complete';

  // Initialize UI colors early to ensure consistent colored output
  // Must happen before any status messages (ok, info, fail, etc.)
  if (!isCompletionCommand && process.stdout.isTTY && !process.env['CI']) {
    const { initUI } = await import('../utils/ui');
    await initUI();
  }

  // Parse --config-dir flag (must happen before any config loading)
  const configDirIdx = args.findIndex((a) => a === '--config-dir' || a.startsWith('--config-dir='));
  if (configDirIdx !== -1) {
    const arg = args[configDirIdx];
    let configDirValue: string | undefined;
    let spliceCount = 1;

    if (arg.startsWith('--config-dir=')) {
      configDirValue = arg.split('=').slice(1).join('=');
    } else {
      configDirValue = args[configDirIdx + 1];
      spliceCount = 2;
    }

    if (!configDirValue || configDirValue.startsWith('-')) {
      console.error(fail('--config-dir requires a path argument'));
      process.exit(1);
    }

    try {
      const stat = fs.statSync(configDirValue);
      if (!stat.isDirectory()) {
        console.error(fail(`Not a directory: ${configDirValue}`));
        process.exit(1);
      }
    } catch {
      console.error(fail(`Config directory not found: ${configDirValue}`));
      console.error(info('Create the directory first, then copy your config files into it.'));
      process.exit(1);
    }

    setGlobalConfigDir(configDirValue);

    // Security warning: cloud sync paths expose OAuth tokens
    const cloudService = detectCloudSyncPath(configDirValue);
    if (!isCompletionCommand && cloudService) {
      console.error(warn(`CCS directory is under ${cloudService}.`));
      console.error('    OAuth tokens in cliproxy/auth/ will be synced to cloud.');
      console.error('    Consider: CCS_DIR=/path/outside/cloud ccs ...');
    }

    // Remove consumed args so they don't leak to Claude CLI
    // Clone the array before splicing so the original rawArgs is unaffected
    args = [...args];
    args.splice(configDirIdx, spliceCount);
  } else if (process.env.CCS_DIR) {
    // Also warn for CCS_DIR env var pointing to cloud sync
    const cloudService = detectCloudSyncPath(process.env.CCS_DIR);
    if (!isCompletionCommand && cloudService) {
      console.error(warn(`CCS directory is under ${cloudService}.`));
      console.error('    OAuth tokens in cliproxy/auth/ will be synced to cloud.');
      console.error('    Consider: CCS_DIR=/path/outside/cloud ccs ...');
    }
  } else if (process.env.CCS_HOME) {
    // Also warn for CCS_HOME env var pointing to cloud sync
    const cloudService = detectCloudSyncPath(process.env.CCS_HOME);
    if (!isCompletionCommand && cloudService) {
      console.error(warn(`CCS directory is under ${cloudService}.`));
      console.error('    OAuth tokens in cliproxy/auth/ will be synced to cloud.');
      console.error('    Consider: CCS_DIR=/path/outside/cloud ccs ...');
    }
  }

  if (isCompletionCommand) {
    const { tryHandleRootCommand } = await import('../commands/root-command-router');
    await tryHandleRootCommand(args);
    return { args, isCompletionCommand, browserLaunchOverride: undefined, exitNow: true };
  }

  args = normalizeLegacyCursorArgs(args);
  let browserLaunchOverride: BrowserLaunchOverride | undefined;
  try {
    const browserLaunchFlags = resolveBrowserLaunchFlagResolution(args);
    browserLaunchOverride = browserLaunchFlags.override;
    args = browserLaunchFlags.argsWithoutFlags;
  } catch (error) {
    console.error(fail((error as Error).message));
    process.exit(1);
    // process.exit never returns but TypeScript needs the unreachable return
    return { args, isCompletionCommand, browserLaunchOverride: undefined, exitNow: true };
  }

  if (shouldPassthroughNativeCodexCommand(args)) {
    const { execNativeCodexCommand } = await import('./target-executor');
    execNativeCodexCommand(args);
    return { args, isCompletionCommand, browserLaunchOverride: undefined, exitNow: true };
  }

  return { args, isCompletionCommand, browserLaunchOverride, exitNow: false };
}

// ========== Interfaces ==========

export interface DetectedProfile {
  profile: string;
  remainingArgs: string[];
}

export interface RuntimeReasoningResolution {
  argsWithoutReasoningFlags: string[];
  reasoningOverride: string | number | undefined;
  reasoningSource: 'flag' | 'env' | undefined;
  sourceDisplay: string | undefined;
}

// ========== Constants ==========

export const CODEX_RUNTIME_REASONING_LEVELS = new Set([
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
]);

export const CODEX_NATIVE_PASSTHROUGH_FLAGS = new Set(['--help', '-h', '--version', '-v']);
export const CODEX_NATIVE_PASSTHROUGH_SUBCOMMANDS = new Set([
  'a',
  'app',
  'app-server',
  'apply',
  'cloud',
  'completion',
  'debug',
  'e',
  'exec',
  'exec-server',
  'features',
  'fork',
  'help',
  'login',
  'logout',
  'mcp',
  'mcp-server',
  'plugin',
  'remote-control',
  'resume',
  'review',
  'sandbox',
]);

export const NATIVE_CLAUDE_EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

export const NATIVE_CLAUDE_EFFORT_LEVEL_SET = new Set<string>(NATIVE_CLAUDE_EFFORT_LEVELS);

// ========== Profile Detection ==========

/**
 * Smart profile detection — first non-flag arg is the profile name.
 */
export function detectProfile(args: string[]): DetectedProfile {
  if (args.length === 0 || args[0].startsWith('-')) {
    // No args or first arg is a flag → use default profile
    return { profile: 'default', remainingArgs: args };
  } else {
    // First arg doesn't start with '-' → treat as profile name
    return { profile: args[0], remainingArgs: args.slice(1) };
  }
}

export function normalizeLegacyCursorArgs(args: string[]): string[] {
  if (args[0] === 'legacy' && args[1] === 'cursor') {
    return [LEGACY_CURSOR_PROFILE_NAME, ...args.slice(2)];
  }

  return args;
}

export function printCursorLegacySubcommandDeprecation(subcommand: string): void {
  console.error(
    warn(`\`ccs cursor ${subcommand}\` is deprecated for the legacy Cursor IDE bridge.`)
  );
  console.error(
    warn(
      `Use \`ccs legacy cursor ${subcommand}\` for the old bridge, or \`ccs cursor --auth|--accounts|--config\` for the CLIProxy provider.`
    )
  );
  console.error('');
}

// ========== Runtime Reasoning Flags ==========

export function resolveRuntimeReasoningFlags(
  args: string[],
  envThinkingValue: string | undefined
): RuntimeReasoningResolution {
  const runtime = resolveDroidReasoningRuntime(args, envThinkingValue);

  if (runtime.duplicateDisplays.length > 0) {
    console.error(
      warn(
        `[!] Multiple reasoning flags detected. Using first occurrence: ${runtime.sourceDisplay || '<first-flag>'}`
      )
    );
  }

  return {
    argsWithoutReasoningFlags: runtime.argsWithoutReasoningFlags,
    reasoningOverride: runtime.reasoningOverride,
    reasoningSource: runtime.sourceFlag
      ? 'flag'
      : runtime.reasoningOverride !== undefined
        ? 'env'
        : undefined,
    sourceDisplay: runtime.sourceDisplay,
  };
}

export function normalizeCodexRuntimeReasoningOverride(
  value: string | number | undefined
): string | undefined {
  return typeof value === 'string' && CODEX_RUNTIME_REASONING_LEVELS.has(value) ? value : undefined;
}

export function exitWithRuntimeReasoningFlagError(
  message: string,
  options: {
    codexAliasLevels: string;
    includeDroidExecExample?: boolean;
  }
): never {
  console.error(fail(message));
  console.error('    Examples: --thinking low, --thinking 8192, --thinking off');
  console.error(`    Codex alias: --effort ${options.codexAliasLevels}`);
  if (options.includeDroidExecExample) {
    console.error('    Droid exec: --reasoning-effort high');
  }
  process.exit(1);
}

// ========== Native Claude Effort Normalization ==========

export function normalizeNativeClaudeEffortArgs(args: string[]): string[] {
  const normalizedArgs: string[] = [];
  const allowedValues = NATIVE_CLAUDE_EFFORT_LEVELS.join(', ');

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--effort') {
      const rawValue = args[i + 1];
      if (!rawValue || rawValue.startsWith('-') || !rawValue.trim()) {
        throw new Error(`--effort requires a value: ${allowedValues}`);
      }
      const value = rawValue.toLowerCase();
      if (!NATIVE_CLAUDE_EFFORT_LEVEL_SET.has(value)) {
        throw new Error(`Invalid --effort value: ${rawValue}. Expected one of: ${allowedValues}.`);
      }
      normalizedArgs.push(arg, value);
      i++;
      continue;
    }

    if (arg.startsWith('--effort=')) {
      const rawValue = arg.slice('--effort='.length);
      if (!rawValue.trim()) {
        throw new Error(`--effort requires a value: ${allowedValues}`);
      }
      const value = rawValue.toLowerCase();
      if (!NATIVE_CLAUDE_EFFORT_LEVEL_SET.has(value)) {
        throw new Error(`Invalid --effort value: ${rawValue}. Expected one of: ${allowedValues}.`);
      }
      normalizedArgs.push(`--effort=${value}`);
      continue;
    }

    normalizedArgs.push(arg);
  }

  return normalizedArgs;
}

export function shouldNormalizeNativeClaudeEffort(
  profileType: ProfileDetectionResult['type']
): boolean {
  return profileType === 'default' || profileType === 'account' || profileType === 'settings';
}

// ========== Native Codex Passthrough ==========

export function shouldPassthroughNativeCodexCommand(args: string[]): boolean {
  return getNativeCodexPassthroughArgs(args) !== null;
}

export function getNativeCodexPassthroughArgs(args: string[]): string[] | null {
  const targetArgs = stripTargetFlag(args);
  if (resolveTargetType(args) !== 'codex' || targetArgs.length === 0) {
    return null;
  }

  const firstArg = targetArgs[0] || '';
  if (CODEX_NATIVE_PASSTHROUGH_FLAGS.has(firstArg)) {
    return targetArgs;
  }
  if (CODEX_NATIVE_PASSTHROUGH_SUBCOMMANDS.has(firstArg)) {
    return targetArgs;
  }

  const secondArg = targetArgs[1] || '';
  if (firstArg === 'codex' && CODEX_NATIVE_PASSTHROUGH_FLAGS.has(secondArg)) {
    return targetArgs.slice(1);
  }
  if (firstArg === 'codex' && CODEX_NATIVE_PASSTHROUGH_SUBCOMMANDS.has(secondArg)) {
    return targetArgs.slice(1);
  }

  return null;
}
