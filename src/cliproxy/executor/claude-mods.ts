/**
 * Claude Code mods bundled with CCS (package folder `claude-mods/`).
 *
 * A mod is a Claude Code plugin whose hooks are a hooks module. CCS loads its
 * own mods into the sessions it launches with `--plugin-dir`, so a mod ships
 * and updates together with the CCS code it talks to, and nothing is written
 * to the user's Claude settings.
 *
 * `ccs-notices` reads the session notices file (see accounts/session-notices)
 * and shows quota alerts as a toast and a status line entry.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getCcsDir } from '../../utils/config-manager';
import { getClaudeCliVersion, isClaudeCliVersionAtLeast } from '../../utils/claude-detector';

export const SESSION_NOTICES_MOD = 'ccs-notices';

/**
 * Oldest Claude Code release whose changelog shows hooks-module plugins
 * loading. Older builds launch without the mod; notices still print on exit.
 */
export const MIN_CLAUDE_MODS_VERSION = '2.1.290';

const VERSION_CACHE_FILE = 'claude-cli-version.json';
const VERSION_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface ClaudeVersionCache {
  path: string;
  mtimeMs: number;
  size: number;
  version: string;
  checkedAt: number;
}

/** Package root: three levels up from src/cliproxy/executor or dist/cliproxy/executor. */
function getPackageRoot(): string {
  return path.join(__dirname, '..', '..', '..');
}

/** Folder of a bundled mod, or null when the package doesn't contain it. */
export function getBundledClaudeModDir(
  name: string,
  packageRoot = getPackageRoot()
): string | null {
  const dir = path.join(packageRoot, 'claude-mods', name);
  return fs.existsSync(path.join(dir, '.claude-plugin', 'plugin.json')) ? dir : null;
}

function statClaudeCli(claudeCli: string): { path: string; mtimeMs: number; size: number } | null {
  try {
    const resolved = fs.realpathSync(claudeCli);
    const stat = fs.statSync(resolved);
    return { path: resolved, mtimeMs: stat.mtimeMs, size: stat.size };
  } catch {
    return null;
  }
}

/**
 * Claude CLI version, cached per binary (path, mtime, size) for a day so a
 * launch doesn't pay for `claude --version` (~0.25s) every time.
 */
export function getCachedClaudeCliVersion(
  claudeCli: string,
  readVersion: () => string | null = getClaudeCliVersion,
  now = Date.now()
): string | null {
  const binary = statClaudeCli(claudeCli);
  const cacheFile = path.join(getCcsDir(), 'cache', VERSION_CACHE_FILE);

  if (binary) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as Partial<ClaudeVersionCache>;
      if (
        cached.path === binary.path &&
        cached.mtimeMs === binary.mtimeMs &&
        cached.size === binary.size &&
        typeof cached.version === 'string' &&
        typeof cached.checkedAt === 'number' &&
        now - cached.checkedAt < VERSION_CACHE_MAX_AGE_MS
      ) {
        return cached.version;
      }
    } catch {
      // no cache yet, or unreadable: fall through to a live check
    }
  }

  const version = readVersion();
  if (version && binary) {
    try {
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      const entry: ClaudeVersionCache = { ...binary, version, checkedAt: now };
      fs.writeFileSync(cacheFile, JSON.stringify(entry));
    } catch {
      // best effort: the next launch checks again
    }
  }
  return version;
}

/**
 * `--plugin-dir` args that load the ccs-notices mod, or [] when the package
 * lacks it or the Claude CLI is too old (or its version can't be read).
 */
export function buildSessionNoticesModArgs(
  claudeCli: string,
  options: { readVersion?: () => string | null; packageRoot?: string } = {}
): string[] {
  const modDir = getBundledClaudeModDir(SESSION_NOTICES_MOD, options.packageRoot);
  if (!modDir) return [];
  const version = getCachedClaudeCliVersion(claudeCli, options.readVersion);
  return isClaudeCliVersionAtLeast(version, MIN_CLAUDE_MODS_VERSION)
    ? ['--plugin-dir', modDir]
    : [];
}
