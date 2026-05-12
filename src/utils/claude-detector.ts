import * as fs from 'fs';
import { execFileSync, execSync } from 'child_process';
import { expandPath } from './helpers';
import type { ClaudeCliInfo } from '../types';
import {
  escapeShellArg,
  getWindowsEscapedCommandShell,
  stripAnthropicEnv,
  stripClaudeCodeEnv,
} from './shell-executor';

export interface ClaudeAuthStatus {
  loggedIn: boolean;
  authMethod?: string | null;
  apiProvider?: string | null;
  email?: string | null;
  orgId?: string | null;
  orgName?: string | null;
  subscriptionType?: string | null;
}

/**
 * Windows installation paths for Claude CLI
 * Checked as fallback when 'where.exe claude' fails
 *
 * Priority order:
 * 1. Native installer path (irm https://claude.ai/install.ps1 | iex)
 * 2. npm/bun global install locations
 */
const WINDOWS_NATIVE_PATHS = [
  // Native installer location (confirmed from Claude's install.ps1)
  // Source: https://github.com/anthropics/claude-code/issues/18183
  '%USERPROFILE%\\.local\\bin\\claude.exe',
  // npm/bun global install locations (already in PATH, but check as fallback)
  '%APPDATA%\\npm\\claude.cmd',
  '%USERPROFILE%\\.bun\\bin\\claude.exe',
];

/**
 * Check common Windows installation paths for Claude CLI
 * Returns the first valid path found, or null
 *
 * Note: Uses expandPath() from helpers which handles %VAR% expansion on Windows.
 * This function is only called when isWindows is true (see detectClaudeCli).
 */
function findClaudeInWindowsPaths(): string | null {
  for (const template of WINDOWS_NATIVE_PATHS) {
    const expanded = expandPath(template);
    if (fs.existsSync(expanded)) {
      return expanded;
    }
  }
  return null;
}

/**
 * Detect Claude CLI executable
 */
export function detectClaudeCli(): string | null {
  // Priority 1: CCS_CLAUDE_PATH environment variable (if user wants custom path)
  if (process.env.CCS_CLAUDE_PATH) {
    const ccsPath = expandPath(process.env.CCS_CLAUDE_PATH);
    // Basic validation: file exists
    if (fs.existsSync(ccsPath)) {
      return ccsPath;
    }
    // Invalid CCS_CLAUDE_PATH - show warning and fall back to PATH
    console.warn('[!] Warning: CCS_CLAUDE_PATH is set but file not found:', ccsPath);
    console.warn('    Falling back to system PATH lookup...');
  }

  // Priority 2: Resolve 'claude' from PATH using which/where.exe
  // This fixes Windows npm installation where spawn() can't resolve bare command names
  // SECURITY: Commands are hardcoded literals with no user input - safe from injection
  const isWindows = process.platform === 'win32';

  try {
    const cmd = isWindows ? 'where.exe claude' : 'which claude';
    const result = execSync(cmd, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000, // 5 second timeout to prevent hangs
    }).trim();

    // where.exe may return multiple lines (all matches in PATH order)
    const matches = result
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p);

    if (isWindows) {
      // On Windows, prefer executables with extensions (.exe, .cmd, .bat)
      // where.exe often returns file without extension first, then the actual .cmd wrapper
      const withExtension = matches.find((p) => /\.(exe|cmd|bat|ps1)$/i.test(p));
      const claudePath = withExtension || matches[0];

      if (claudePath && fs.existsSync(claudePath)) {
        return claudePath;
      }
    } else {
      // On Unix, first match is fine
      const claudePath = matches[0];

      if (claudePath && fs.existsSync(claudePath)) {
        return claudePath;
      }
    }
  } catch (_err) {
    // Command failed - claude not in PATH
    // Fall through to Windows fallback or return null
  }

  // Priority 3 (Windows only): Check common native installer locations
  // This helps users who installed via Windows MSI/EXE but haven't run 'claude install'
  if (isWindows) {
    const nativePath = findClaudeInWindowsPaths();
    if (nativePath) {
      return nativePath;
    }
  }

  // Priority 4: Claude not found
  return null;
}

/**
 * Get detailed Claude CLI information
 */
export function getClaudeCliInfo(): ClaudeCliInfo | null {
  const claudePath = detectClaudeCli();

  if (!claudePath) {
    return null;
  }

  const isWindows = process.platform === 'win32';
  const needsShell = isWindows && /\.(cmd|bat|ps1)$/i.test(claudePath);

  return {
    path: claudePath,
    isWindows,
    needsShell,
  };
}

function runClaudeCliCommand(args: string[], envOverrides?: NodeJS.ProcessEnv): string | null {
  const cliInfo = getClaudeCliInfo();
  if (!cliInfo) {
    return null;
  }

  const env = stripClaudeCodeEnv(stripAnthropicEnv({ ...process.env, ...envOverrides }));
  const { path: claudePath, needsShell } = cliInfo;
  const isWindows = process.platform === 'win32';
  const isPowerShellScript = isWindows && /\.ps1$/i.test(claudePath);

  try {
    if (isPowerShellScript) {
      return execFileSync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', claudePath, ...args],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 5000,
          env,
        }
      ).trim();
    }

    if (needsShell) {
      const shell = getWindowsEscapedCommandShell();
      return execSync([claudePath, ...args].map(escapeShellArg).join(' '), {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5000,
        shell: typeof shell === 'string' ? shell : undefined,
        env,
      }).trim();
    }

    return execFileSync(claudePath, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
      env,
    }).trim();
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'stdout' in error) {
      const stdout = (error as { stdout?: string | Buffer | null }).stdout;
      if (typeof stdout === 'string') {
        const trimmed = stdout.trim();
        return trimmed.length > 0 ? trimmed : null;
      }
      if (Buffer.isBuffer(stdout)) {
        const trimmed = stdout.toString('utf8').trim();
        return trimmed.length > 0 ? trimmed : null;
      }
    }

    return null;
  }
}

export function getClaudeCliVersion(): string | null {
  const output = runClaudeCliCommand(['--version']);
  const versionMatch = output?.match(/(\d+\.\d+\.\d+)/);
  return versionMatch ? versionMatch[1] : null;
}

export function compareClaudeCliVersions(left: string, right: string): number {
  const leftParts = left.split('.').map((value) => Number.parseInt(value, 10) || 0);
  const rightParts = right.split('.').map((value) => Number.parseInt(value, 10) || 0);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;

    if (leftValue !== rightValue) {
      return leftValue > rightValue ? 1 : -1;
    }
  }

  return 0;
}

export function isClaudeCliVersionAtLeast(
  currentVersion: string | null,
  minimumVersion: string
): boolean {
  return currentVersion !== null && compareClaudeCliVersions(currentVersion, minimumVersion) >= 0;
}

export function getClaudeAuthStatus(envOverrides?: NodeJS.ProcessEnv): ClaudeAuthStatus | null {
  const output = runClaudeCliCommand(['auth', 'status'], envOverrides);
  if (!output) {
    return null;
  }

  try {
    const parsed = JSON.parse(output) as Partial<ClaudeAuthStatus>;
    if (typeof parsed.loggedIn !== 'boolean') {
      return null;
    }

    return {
      loggedIn: parsed.loggedIn,
      authMethod: parsed.authMethod ?? null,
      apiProvider: parsed.apiProvider ?? null,
      email: parsed.email ?? null,
      orgId: parsed.orgId ?? null,
      orgName: parsed.orgName ?? null,
      subscriptionType: parsed.subscriptionType ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Show Claude not found error
 */
export function showClaudeNotFoundError(): never {
  console.error('ERROR: Claude CLI not found in PATH');
  console.error('Install from: https://docs.claude.com/en/docs/claude-code/installation');
  process.exit(1);
}
