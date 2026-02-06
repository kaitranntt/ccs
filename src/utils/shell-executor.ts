/**
 * Shell Executor Utilities
 *
 * Cross-platform shell execution utilities for CCS.
 */

import { spawn, ChildProcess, execSync } from 'child_process';
import { ErrorManager } from './error-manager';
import { getWebSearchHookEnv } from './websearch-manager';

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
 * Execute Claude CLI with unified spawn logic
 */
export function execClaude(
  claudeCli: string,
  args: string[],
  envVars: NodeJS.ProcessEnv | null = null
): void {
  const isWindows = process.platform === 'win32';
  const needsShell = isWindows && /\.(cmd|bat|ps1)$/i.test(claudeCli);

  // Get WebSearch hook config env vars
  const webSearchEnv = getWebSearchHookEnv();

  // Prepare environment (merge with process.env if envVars provided)
  const env = envVars
    ? { ...process.env, ...envVars, ...webSearchEnv }
    : { ...process.env, ...webSearchEnv };

  // propagate key env vars to tmux session so agent team teammates
  // (spawned via tmux split-window) inherit the correct config dir
  if (process.env.TMUX && envVars) {
    const tmuxPropagateVars = ['CLAUDE_CONFIG_DIR', 'CCS_PROFILE_TYPE', 'CCS_WEBSEARCH_SKIP'];
    for (const key of tmuxPropagateVars) {
      if (envVars[key]) {
        try {
          execSync(`tmux setenv ${key} ${JSON.stringify(envVars[key])}`, { stdio: 'ignore' });
        } catch {
          // tmux setenv can fail if not in a tmux session; safe to ignore
        }
      }
    }
  }

  let child: ChildProcess;
  if (needsShell) {
    // When shell needed: concatenate into string to avoid DEP0190 warning
    const cmdString = [claudeCli, ...args].map(escapeShellArg).join(' ');
    child = spawn(cmdString, {
      stdio: 'inherit',
      windowsHide: true,
      shell: true,
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

  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal as NodeJS.Signals);
    else process.exit(code || 0);
  });

  child.on('error', async () => {
    await ErrorManager.showClaudeNotFound();
    process.exit(1);
  });
}
