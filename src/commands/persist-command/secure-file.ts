/**
 * Persist Command - Secure File I/O & Locking
 *
 * Hardened filesystem helpers for reading/writing ~/.claude/settings.json.
 * Refuses to follow symlinks (TOCTOU mitigations), uses O_NOFOLLOW where
 * available, writes via atomic temp-file + rename, and serializes concurrent
 * persist operations via a proper-lockfile on the settings directory.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as lockfile from 'proper-lockfile';
import { getClaudeConfigDir, getClaudeSettingsPath } from '../../utils/claude-config-path';
import {
  PERSIST_LOCK_RETRIES,
  PERSIST_LOCK_RETRY_MAX_MS,
  PERSIST_LOCK_RETRY_MIN_MS,
  PERSIST_LOCK_STALE_MS,
} from './types';

export function formatDisplayPath(filePath: string): string {
  const defaultClaudeDir = path.join(os.homedir(), '.claude');
  const claudeDir = getClaudeConfigDir();

  // Keep real path when user overrides Claude directory.
  if (path.resolve(claudeDir) !== path.resolve(defaultClaudeDir)) {
    return filePath;
  }

  if (filePath === claudeDir) {
    return '~/.claude';
  }

  const claudePrefix = `${claudeDir}${path.sep}`;
  if (filePath.startsWith(claudePrefix)) {
    return filePath.replace(claudePrefix, '~/.claude/');
  }

  return filePath;
}

export function getClaudeSettingsDisplayPath(): string {
  return formatDisplayPath(getClaudeSettingsPath());
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function isSymlinkAsync(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.promises.lstat(filePath);
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}

export function getNoFollowFlag(): number {
  const candidate = (fs.constants as Record<string, number>)['O_NOFOLLOW'];
  if (process.platform !== 'win32' && typeof candidate === 'number') {
    return candidate;
  }
  return 0;
}

function createSymlinkReadError(filePath: string): NodeJS.ErrnoException {
  const error = new Error(
    `Refusing to read symlinked file for security: ${formatDisplayPath(filePath)}`
  ) as NodeJS.ErrnoException;
  error.code = 'ELOOP';
  return error;
}

export async function readFileUtf8NoFollow(filePath: string): Promise<string> {
  if (await isSymlinkAsync(filePath)) {
    throw createSymlinkReadError(filePath);
  }

  const noFollowFlag = getNoFollowFlag();
  const flags = fs.constants.O_RDONLY | noFollowFlag;
  const handle = await fs.promises.open(filePath, flags);
  try {
    // Best-effort fallback for platforms without O_NOFOLLOW (notably Windows).
    // Re-check symlink status after open to reduce check-then-use windows.
    if (noFollowFlag === 0 && (await isSymlinkAsync(filePath))) {
      throw createSymlinkReadError(filePath);
    }

    const stats = await handle.stat();
    if (!stats.isFile()) {
      throw new Error('Path is not a regular file');
    }

    if (noFollowFlag === 0) {
      const latestStats = await fs.promises.stat(filePath);
      if (latestStats.dev !== stats.dev || latestStats.ino !== stats.ino) {
        throw new Error('Path changed during secure read');
      }
    }

    return await handle.readFile({ encoding: 'utf8' });
  } finally {
    await handle.close();
  }
}

export function parseSettingsObject(content: string, sourceLabel: string): Record<string, unknown> {
  if (!content.trim()) {
    return {};
  }
  const parsed: unknown = JSON.parse(content);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${sourceLabel} must contain a JSON object, not an array or primitive`);
  }
  return parsed as Record<string, unknown>;
}

export async function withPersistSettingsLock<T>(operation: () => Promise<T>): Promise<T> {
  const settingsPath = getClaudeSettingsPath();
  const settingsDir = path.dirname(settingsPath);
  await fs.promises.mkdir(settingsDir, { recursive: true });

  let release: (() => Promise<void>) | undefined;
  try {
    release = await lockfile.lock(settingsDir, {
      stale: PERSIST_LOCK_STALE_MS,
      retries: {
        retries: PERSIST_LOCK_RETRIES,
        minTimeout: PERSIST_LOCK_RETRY_MIN_MS,
        maxTimeout: PERSIST_LOCK_RETRY_MAX_MS,
      },
      realpath: false,
    });
  } catch (error) {
    throw new Error(
      `Failed to lock Claude settings directory (${formatDisplayPath(settingsDir)}): ${(error as Error).message}`
    );
  }

  try {
    return await operation();
  } finally {
    if (release) {
      try {
        await release();
      } catch {
        // Best-effort release.
      }
    }
  }
}

/** Read existing Claude settings.json with validation */
export async function readClaudeSettings(): Promise<Record<string, unknown>> {
  const settingsPath = getClaudeSettingsPath();
  try {
    const content = await readFileUtf8NoFollow(settingsPath);
    return parseSettingsObject(content, 'settings.json');
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return {};
    }
    if (nodeError.code === 'ELOOP') {
      throw new Error('settings.json is a symlink - refusing to read for security');
    }
    throw new Error(`Failed to parse settings.json: ${(error as Error).message}`);
  }
}

/** Write settings back to settings.json with atomic replace semantics. */
export async function writeClaudeSettings(settings: Record<string, unknown>): Promise<void> {
  const settingsPath = getClaudeSettingsPath();
  if (await isSymlinkAsync(settingsPath)) {
    throw new Error('settings.json is a symlink - refusing to write for security');
  }

  const settingsDir = path.dirname(settingsPath);
  await fs.promises.mkdir(settingsDir, { recursive: true });

  const nonce = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const tmpPath = path.join(settingsDir, `settings.json.tmp-${nonce}`);
  const flags =
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | getNoFollowFlag();

  let handle: fs.promises.FileHandle | undefined;
  try {
    handle = await fs.promises.open(tmpPath, flags, 0o600);
    await handle.writeFile(JSON.stringify(settings, null, 2) + '\n', { encoding: 'utf8' });
    await handle.sync();
  } finally {
    if (handle) {
      await handle.close();
    }
  }

  try {
    await fs.promises.rename(tmpPath, settingsPath);
  } catch (error) {
    try {
      await fs.promises.unlink(tmpPath);
    } catch {
      // Best-effort cleanup.
    }
    throw error;
  }

  try {
    await fs.promises.chmod(settingsPath, 0o600);
  } catch {
    // Best-effort permission hardening.
  }
}
