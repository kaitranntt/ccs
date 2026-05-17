/**
 * Shell detection for codex-auth use command.
 * Determines current shell to emit correct eval-safe export syntax.
 */

import * as childProcess from 'child_process';

export type Shell = 'bash' | 'zsh' | 'fish' | 'pwsh' | 'cmd';

/**
 * Detect current shell from environment.
 * On Windows: inspect explicit shell executable hints, else default to cmd.
 * On Unix: inspect $SHELL suffix.
 */
export function detectShell(
  env: NodeJS.ProcessEnv = process.env,
  platform: string = process.platform,
  parentProcessName?: string
): Shell {
  if (platform === 'win32') {
    return (
      shellFromExecutable(env.SHELL) ??
      shellFromExecutable(parentProcessName ?? detectParentProcessName(platform)) ??
      shellFromExecutable(env.ComSpec ?? env.COMSPEC) ??
      'cmd'
    );
  }
  const sh = (env.SHELL ?? '').toLowerCase();
  if (sh.endsWith('/fish')) return 'fish';
  if (sh.endsWith('/zsh')) return 'zsh';
  return 'bash'; // default for bash, sh, dash, ksh
}

function detectParentProcessName(platform: string): string | undefined {
  if (platform !== 'win32' || !Number.isInteger(process.ppid) || process.ppid <= 0) {
    return undefined;
  }

  const result = childProcess.spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `(Get-Process -Id ${process.ppid} -ErrorAction Stop).ProcessName`,
    ],
    { encoding: 'utf8', timeout: 1500, windowsHide: true }
  );

  if (result.status !== 0 || !result.stdout) return undefined;
  return result.stdout.trim().split(/\r?\n/).pop()?.trim();
}

function shellFromExecutable(value: string | undefined): Shell | null {
  if (!value) return null;
  const base = value
    .replace(/^["']|["']$/g, '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    ?.toLowerCase()
    .replace(/\.(exe|cmd|ps1|bat)$/i, '');

  switch (base) {
    case 'fish':
    case 'zsh':
    case 'bash':
    case 'cmd':
      return base;
    case 'pwsh':
    case 'powershell':
      return 'pwsh';
    default:
      return null;
  }
}

/**
 * Single-quote escape for POSIX shells (bash/zsh/fish).
 * Closes the single-quote, inserts escaped quote, reopens.
 */
function posixSingleQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

/**
 * Double-quote escape for PowerShell.
 * Wraps in double quotes; escapes the PowerShell escape char first, doubles
 * internal double quotes, and backtick-escapes $ to prevent interpolation.
 */
function pwshDoubleQuote(value: string): string {
  return '"' + value.replace(/`/g, '``').replace(/"/g, '""').replace(/\$/g, '`$') + '"';
}

/**
 * Quote a cmd.exe SET assignment. `set "KEY=value"` keeps command separators
 * like &, |, <, and > inside the assignment instead of executing them.
 */
function cmdSetQuote(value: string): string {
  return value.replace(/\^/g, '^^').replace(/%/g, '%%').replace(/"/g, '^"').replace(/!/g, '^^!');
}

/**
 * Format a single env var export statement for the target shell.
 * Used by use-command to emit eval-safe lines.
 */
export function formatExport(shell: Shell, key: string, value: string): string {
  switch (shell) {
    case 'fish':
      return `set -gx ${key} ${posixSingleQuote(value)};`;
    case 'pwsh':
      return `$env:${key} = ${pwshDoubleQuote(value)}`;
    case 'cmd':
      return `set "${key}=${cmdSetQuote(value)}"`;
    default:
      // bash / zsh
      return `export ${key}=${posixSingleQuote(value)}`;
  }
}
