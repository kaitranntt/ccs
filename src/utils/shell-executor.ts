/**
 * Shell Executor Utilities
 *
 * Cross-platform shell execution utilities for CCS.
 */

import { spawn, spawnSync, ChildProcess, type SpawnOptions } from 'child_process';
import { ErrorManager } from './error-manager';
import { getWebSearchHookEnv } from './websearch-manager';
import { wireChildProcessSignals } from './signal-forwarder';

import SharedManager from '../management/shared-manager';
import { loadOrCreateUnifiedConfig } from '../config/config-loader-facade';

/**
 * Strip ANTHROPIC_* env vars from an environment object.
 * Used for account/default profiles to prevent stale proxy config from
 * interfering with native Claude API routing.
 */
export function stripAnthropicEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const key of Object.keys(env)) {
    if (!key.startsWith('ANTHROPIC_')) {
      result[key] = env[key];
    }
  }
  return result;
}

const ANTHROPIC_ROUTING_ENV_KEYS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
];
const ANTHROPIC_ROUTING_ENV_KEY_SET = new Set(ANTHROPIC_ROUTING_ENV_KEYS);
const ANTHROPIC_MODEL_ENV_KEYS = [
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_SMALL_FAST_MODEL',
];
const TMUX_SYNC_ENV_KEYS = [
  'CLAUDE_CONFIG_DIR',
  'CCS_PROFILE_TYPE',
  'CCS_WEBSEARCH_SKIP',
  'CCS_STRIP_INHERITED_ANTHROPIC_ENV',
  'CLAUDE_CODE_MAX_OUTPUT_TOKENS',
  ...ANTHROPIC_MODEL_ENV_KEYS,
  ...ANTHROPIC_ROUTING_ENV_KEYS,
];

/**
 * Strip inherited Anthropic routing/auth env while preserving model intent.
 * Used for nested settings-profile Claude launches where `--settings` already
 * defines the provider transport and the parent process should only lend model
 * defaults or effort hints.
 *
 * `preserveFrom`: if provided, routing keys present in this source survive the
 * strip (with their values from `preserveFrom`). Settings-type profiles use
 * this to keep routing/auth supplied by their own `settings.env` while
 * dropping any routing leaked from the parent shell or `global.env`.
 */
export function stripAnthropicRoutingEnv(
  env: NodeJS.ProcessEnv,
  preserveFrom?: NodeJS.ProcessEnv
): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const key of Object.keys(env)) {
    if (!ANTHROPIC_ROUTING_ENV_KEY_SET.has(key.toUpperCase())) {
      result[key] = env[key];
    }
  }
  if (preserveFrom) {
    for (const key of ANTHROPIC_ROUTING_ENV_KEYS) {
      if (
        Object.prototype.hasOwnProperty.call(preserveFrom, key) &&
        preserveFrom[key] !== undefined
      ) {
        result[key] = preserveFrom[key];
      }
    }
  }
  return result;
}

function syncTmuxNestedSessionEnv(env: NodeJS.ProcessEnv, profileType: string | undefined): void {
  if (!process.env.TMUX) {
    return;
  }

  const nestedSessionEnv =
    profileType === 'account' || profileType === 'default'
      ? stripAnthropicEnv(env)
      : profileType === 'settings'
        ? stripAnthropicRoutingEnv(env)
        : env;

  for (const key of TMUX_SYNC_ENV_KEYS) {
    try {
      const value = nestedSessionEnv[key];
      if (value !== undefined) {
        spawnSync('tmux', ['setenv', key, value], { stdio: 'ignore' });
      } else {
        spawnSync('tmux', ['setenv', '-u', key], { stdio: 'ignore' });
      }
    } catch {
      // tmux setenv can fail if not in a tmux session; safe to ignore
    }
  }
}

/**
 * Strip inherited browser attach/runtime env vars from a process environment.
 *
 * Browser capability is opt-in and launch-scoped. Stale CCS_BROWSER_* values
 * from the parent process must never bleed into a browser-off child launch.
 */
export function stripBrowserEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const key of Object.keys(env)) {
    if (!key.toUpperCase().startsWith('CCS_BROWSER_')) {
      result[key] = env[key];
    }
  }
  return result;
}

/**
 * Strip Claude Code nested-session guard env var from a process environment.
 *
 * Note: Windows env keys are case-insensitive, so remove case-insensitively
 * to avoid missing variants like `claudecode`.
 */
export function stripClaudeCodeEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const key of Object.keys(env)) {
    if (key.toUpperCase() !== 'CLAUDECODE') {
      result[key] = env[key];
    }
  }
  return result;
}

/**
 * Strip Codex session-scoped env vars before launching a nested Codex process.
 *
 * Keep real user config such as CODEX_HOME intact. Only remove the known
 * session/runtime metadata exported by the current Codex host process.
 */
export function stripCodexSessionEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const sessionKeys = new Set(['CODEX_CI', 'CODEX_MANAGED_BY_BUN', 'CODEX_THREAD_ID']);
  const result: NodeJS.ProcessEnv = {};
  for (const key of Object.keys(env)) {
    const upperKey = key.toUpperCase();
    if (sessionKeys.has(upperKey)) {
      continue;
    }
    result[key] = env[key];
  }
  return result;
}

/**
 * Resolve CCS-managed environment overrides for Claude launch.
 * - preferences.auto_update: false -> DISABLE_AUTOUPDATER=1
 */
export function getClaudeLaunchEnvOverrides(): NodeJS.ProcessEnv {
  try {
    const config = loadOrCreateUnifiedConfig();
    if (config.preferences?.auto_update === false) {
      return { DISABLE_AUTOUPDATER: '1' };
    }
  } catch {
    // Config read errors should never block Claude launch.
  }
  return {};
}

/**
 * Escape arguments for shell execution (cross-platform)
 *
 * IMPORTANT: On Windows, spawn({ shell: true }) uses cmd.exe by default,
 * NOT PowerShell. cmd.exe does NOT recognize single quotes as string delimiters.
 * We must use double quotes for cmd.exe compatibility.
 */
export function escapeShellArg(arg: string): string {
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    // cmd.exe: Use double quotes, escape inner double quotes by doubling them
    // cmd.exe interprets "" as escaped double quote inside quoted string
    // Strip newlines/tabs that can break cmd.exe parsing
    return (
      '"' +
      String(arg)
        .replace(/[\r\n\t]/g, ' ') // Replace newlines/tabs with space
        .replace(/%/g, '%%') // Escape percent signs
        .replace(/\^/g, '^^') // Escape carets
        .replace(/!/g, '^^!') // Escape exclamation marks (delayed expansion)
        .replace(/"/g, '""') + // Escape quotes
      '"'
    );
  } else {
    // Unix/macOS: Double quotes with escaped inner quotes
    return '"' + String(arg).replace(/"/g, '\\"') + '"';
  }
}

/**
 * Return the shell that matches escapeShellArg() quoting semantics.
 *
 * On Windows, prefer ComSpec over a bare `cmd.exe` so escaped wrapper launches
 * keep the same shell contract without depending on PATH lookup.
 */
export function getWindowsEscapedCommandShell(): SpawnOptions['shell'] {
  if (process.platform !== 'win32') {
    return true;
  }

  return process.env.ComSpec || process.env.COMSPEC || 'cmd.exe';
}

/**
 * Execute Claude CLI with unified spawn logic
 */
export function execClaude(
  claudeCli: string,
  args: string[],
  envVars: NodeJS.ProcessEnv | null = null,
  onExitCleanup?: () => void
): void {
  const isWindows = process.platform === 'win32';
  const isPowerShellScript = isWindows && /\.ps1$/i.test(claudeCli);
  const needsShell = isWindows && /\.(cmd|bat)$/i.test(claudeCli);

  // Get WebSearch hook config env vars
  const webSearchEnv = getWebSearchHookEnv();
  const claudeLaunchEnv = getClaudeLaunchEnvOverrides();

  // Strip inherited ANTHROPIC_* when the launch should not reuse parent routing.
  // Account/default profiles need full isolation from prior proxy sessions.
  // Settings profiles can selectively strip only routing/auth when `--settings`
  // already carries the provider source of truth but the parent model intent
  // should still flow into nested Team/subagent launches.
  const profileType = envVars?.CCS_PROFILE_TYPE;
  const stripInheritedAnthropicEnv = profileType === 'account' || profileType === 'default';
  const stripInheritedAnthropicRoutingEnv = envVars?.CCS_STRIP_INHERITED_ANTHROPIC_ENV === '1';
  const inheritedEnv = stripInheritedAnthropicEnv
    ? stripAnthropicEnv(process.env)
    : stripInheritedAnthropicRoutingEnv
      ? stripAnthropicRoutingEnv(process.env)
      : process.env;
  const baseEnv = stripBrowserEnv(inheritedEnv);

  // Prepare environment (merge with base env if envVars provided)
  const mergedEnv = envVars
    ? { ...baseEnv, ...claudeLaunchEnv, ...envVars, ...webSearchEnv }
    : { ...baseEnv, ...claudeLaunchEnv, ...webSearchEnv };
  const effectiveMergedEnv = stripInheritedAnthropicRoutingEnv
    ? stripAnthropicRoutingEnv(mergedEnv, envVars ?? undefined)
    : mergedEnv;

  // Strip Claude Code nested session guard env var to allow CCS delegation
  // (Claude Code v2.1.39+ sets CLAUDECODE to detect nested sessions)
  const env = stripClaudeCodeEnv(effectiveMergedEnv);

  if (profileType !== 'account') {
    try {
      new SharedManager().normalizeSharedPluginMetadataPathsLocked(env.CLAUDE_CONFIG_DIR);
    } catch {
      // Best-effort normalization should never block Claude launch.
    }
  }

  // Keep tmux teammate panes aligned with the nested-safe Claude runtime env
  // rather than the tmux server's original shell environment.
  syncTmuxNestedSessionEnv(env, profileType);

  let child: ChildProcess;
  if (isPowerShellScript) {
    child = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', claudeCli, ...args],
      {
        stdio: 'inherit',
        windowsHide: true,
        env,
      }
    );
  } else if (needsShell) {
    // When shell needed: concatenate into string to avoid DEP0190 warning
    const cmdString = [claudeCli, ...args].map(escapeShellArg).join(' ');
    child = spawn(cmdString, {
      stdio: 'inherit',
      windowsHide: true,
      shell: getWindowsEscapedCommandShell(),
      env,
    });
  } else {
    // When no shell needed: use array form (faster, no shell overhead)
    child = spawn(claudeCli, args, {
      stdio: 'inherit',
      windowsHide: true,
      env,
    });
  }

  let cleanedUp = false;
  const runExitCleanup = (): void => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    onExitCleanup?.();
  };
  child.once('exit', runExitCleanup);
  child.once('error', runExitCleanup);

  wireChildProcessSignals(child, async (err: NodeJS.ErrnoException) => {
    if (err.code === 'EACCES') {
      console.error(`[X] Claude CLI is not executable: ${claudeCli}`);
      console.error('    Check file permissions and executable bit.');
    } else if (err.code === 'ENOENT') {
      if (isPowerShellScript) {
        console.error('[X] PowerShell executable not found (required for .ps1 wrapper launch).');
        console.error('    Ensure powershell.exe is available in PATH.');
      } else if (needsShell) {
        console.error('[X] Windows command shell not found for Claude wrapper launch.');
        console.error('    Ensure cmd.exe is available and accessible.');
      } else {
        await ErrorManager.showClaudeNotFound();
      }
    } else {
      console.error(`[X] Failed to start Claude CLI (${claudeCli}): ${err.message}`);
    }
    process.exit(1);
  });
}
