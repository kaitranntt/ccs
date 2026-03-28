import * as fs from 'fs';
import * as childProcess from 'child_process';
import { expandPath } from '../utils/helpers';
import { escapeShellArg } from '../utils/shell-executor';
import type { TargetBinaryInfo } from './target-adapter';

const CODEX_CONFIG_OVERRIDE_FEATURE = 'config-overrides';

function runCodexProbe(codexPath: string, args: string[]): string | undefined {
  const isWindows = process.platform === 'win32';
  const isPowerShellScript = isWindows && /\.ps1$/i.test(codexPath);
  const needsShell = isWindows && /\.(cmd|bat)$/i.test(codexPath);

  try {
    if (isPowerShellScript) {
      return childProcess.execFileSync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', codexPath, ...args],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 5000,
          windowsHide: true,
        }
      );
    }

    if (needsShell) {
      const cmdString = [codexPath, ...args].map(escapeShellArg).join(' ');
      return childProcess.execFileSync('cmd.exe', ['/d', '/s', '/c', cmdString], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5000,
        windowsHide: true,
      });
    }

    return childProcess.execFileSync(codexPath, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    });
  } catch {
    return undefined;
  }
}

function readCodexVersion(codexPath: string): string | undefined {
  return runCodexProbe(codexPath, ['--version'])?.trim();
}

function detectCodexFeatures(codexPath: string): readonly string[] {
  const helpText = runCodexProbe(codexPath, ['--help']);
  return helpText?.includes('--config <key=value>') ? [CODEX_CONFIG_OVERRIDE_FEATURE] : [];
}

export function detectCodexCli(): string | null {
  if (process.env.CCS_CODEX_PATH) {
    const customPath = expandPath(process.env.CCS_CODEX_PATH);
    try {
      if (fs.statSync(customPath).isFile()) {
        return customPath;
      }
      console.warn('[!] CCS_CODEX_PATH points to a directory, not a file:', customPath);
      console.warn('    Refusing PATH fallback while CCS_CODEX_PATH is explicitly set.');
      return null;
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') {
        console.warn('[!] Warning: CCS_CODEX_PATH is set but file not found:', customPath);
      } else {
        console.warn(
          `[!] Warning: CCS_CODEX_PATH is not accessible (${error.code || 'unknown error'}):`,
          customPath
        );
      }
      console.warn('    Refusing PATH fallback while CCS_CODEX_PATH is explicitly set.');
      return null;
    }
  }

  const isWindows = process.platform === 'win32';
  try {
    const cmd = isWindows ? 'where.exe codex' : 'which codex';
    const result = childProcess
      .execSync(cmd, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5000,
      })
      .trim();

    const matches = result
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean);

    const candidates = isWindows
      ? [
          ...matches.filter((entry) => /\.(exe|cmd|bat|ps1)$/i.test(entry)),
          ...matches.filter((entry) => !/\.(exe|cmd|bat|ps1)$/i.test(entry)),
        ]
      : matches;

    for (const candidate of candidates) {
      try {
        if (fs.statSync(candidate).isFile()) {
          return candidate;
        }
      } catch {
        // Ignore disappearing PATH candidates.
      }
    }
  } catch {
    // codex not in PATH
  }

  return null;
}

export function getCodexBinaryInfo(): TargetBinaryInfo | null {
  const codexPath = detectCodexCli();
  if (!codexPath) return null;

  const isWindows = process.platform === 'win32';
  return {
    path: codexPath,
    needsShell: isWindows && /\.(cmd|bat|ps1)$/i.test(codexPath),
    version: readCodexVersion(codexPath),
    features: detectCodexFeatures(codexPath),
  };
}

export function codexBinarySupportsConfigOverrides(
  binaryInfo: TargetBinaryInfo | null | undefined
): boolean {
  return Boolean(binaryInfo?.features?.includes(CODEX_CONFIG_OVERRIDE_FEATURE));
}
