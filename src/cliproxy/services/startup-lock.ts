/**
 * Startup Lock for CLIProxy
 *
 * File-based mutex to prevent race conditions when multiple
 * CCS processes try to start CLIProxy simultaneously.
 *
 * Uses a lock file with PID and timestamp to coordinate startup.
 * Lock is automatically released after timeout or process exit.
 *
 * Lock Timeout Rationale (10 seconds):
 * - CLIProxy startup typically takes 1-3s (binary spawn + port bind)
 * - HTTP health check takes ~1s timeout
 * - Session registration takes <100ms
 * - Total expected lock hold time: 2-5s
 * - 10s provides 2x safety margin for slow systems/disk I/O
 * - Too short: legitimate startups fail on slow systems
 * - Too long: dead processes block other terminals unnecessarily
 *
 * Why file-based instead of port-based:
 * - Works before port is bound (prevents duplicate spawn attempts)
 * - Survives process crashes (stale detection via PID check)
 * - Cross-platform (Windows, macOS, Linux)
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getCliproxyDir } from '../config/config-generator';
import { ProxyError } from '../../errors/error-types';
import { createLogger } from '../../services/logging';

/** Lock file structure */
interface LockData {
  pid: number;
  timestamp: number;
  hostname: string;
  token?: string;
}

/** Lock acquisition result */
export interface LockResult {
  acquired: boolean;
  lockPath: string;
  release: () => void;
}

/** Lock file name */
const LOCK_FILE = '.startup.lock';

/** Lock timeout in ms (stale lock auto-released) */
const LOCK_TIMEOUT_MS = 10000; // 10 seconds - see module docstring for rationale
const CLEANUP_GUARD_STALE_MS = 2000;
const NEW_EMPTY_LOCK_GRACE_MS = 1000;

/** Optional logger function for verbose output */
type LogFn = (msg: string) => void;

/** No-op logger for when verbose is disabled */
const noopLog: LogFn = () => {};
const logger = createLogger('cliproxy:startup-lock');

/**
 * Get path to startup lock file
 */
function getLockPath(): string {
  return path.join(getCliproxyDir(), LOCK_FILE);
}

function getCleanupGuardPath(lockPath: string): string {
  return `${lockPath}.cleanup`;
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a lock is stale (old or from dead process)
 */
function isLockStale(lockData: LockData): boolean {
  // Check timestamp
  if (Date.now() - lockData.timestamp > LOCK_TIMEOUT_MS) {
    return true;
  }

  // Check if PID is still running
  return !processExists(lockData.pid);
}

function tryAcquireCleanupGuard(cleanupPath: string): string | null {
  const guardToken = crypto.randomUUID();
  const guardData = `${process.pid}\n${Date.now()}\n${guardToken}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(cleanupPath, guardData, { flag: 'wx', mode: 0o600 });
      return guardToken;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || attempt > 0) {
        return null;
      }

      try {
        const stat = fs.statSync(cleanupPath);
        const content = fs.readFileSync(cleanupPath, 'utf-8');
        const [pidStr, timestampStr] = content.trim().split('\n');
        const pid = Number.parseInt(pidStr, 10);
        const timestamp = Number.parseInt(timestampStr, 10);
        const hasLiveOwner = Number.isInteger(pid) && pid > 0 && processExists(pid);
        const isExpired =
          Date.now() - stat.mtimeMs > CLEANUP_GUARD_STALE_MS &&
          (!Number.isFinite(timestamp) || Date.now() - timestamp > CLEANUP_GUARD_STALE_MS);

        if (hasLiveOwner || !isExpired) {
          return null;
        }

        const verifyStat = fs.statSync(cleanupPath);
        const verifyContent = fs.readFileSync(cleanupPath, 'utf-8');
        if (verifyStat.ino === stat.ino && verifyContent === content) {
          fs.unlinkSync(cleanupPath);
        }
      } catch {
        return null;
      }
    }
  }

  return null;
}

function releaseCleanupGuard(cleanupPath: string, guardToken: string): void {
  try {
    const content = fs.readFileSync(cleanupPath, 'utf-8');
    const fileToken = content.trim().split('\n')[2];
    if (fileToken === guardToken) {
      fs.unlinkSync(cleanupPath);
    }
  } catch {
    // Ignore cleanup errors
  }
}

function sleepSync(ms: number): void {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      /* busy-wait */
    }
  }
}

function isObservedLockUnchanged(
  lockPath: string,
  expectedStat: fs.Stats,
  expectedContent: string
): boolean {
  try {
    const currentStat = fs.statSync(lockPath);
    const currentContent = fs.readFileSync(lockPath, 'utf-8');
    return (
      currentStat.ino === expectedStat.ino &&
      currentStat.mtimeMs === expectedStat.mtimeMs &&
      currentContent === expectedContent
    );
  } catch {
    return false;
  }
}

function buildReleaseFn(lockPath: string, lockToken: string, log: LogFn): () => void {
  return () => {
    const cleanupPath = getCleanupGuardPath(lockPath);
    let guardToken: string | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      guardToken = tryAcquireCleanupGuard(cleanupPath);
      if (guardToken) {
        break;
      }
      sleepSync(2);
    }

    try {
      // Only release if we still own the exact token (or legacy same-PID lock without token)
      const content = fs.readFileSync(lockPath, 'utf-8');
      const currentLock = JSON.parse(content) as LockData;
      const ownsToken =
        typeof currentLock.token === 'string'
          ? currentLock.token === lockToken
          : currentLock.pid === process.pid;
      if (ownsToken) {
        fs.unlinkSync(lockPath);
        log('Lock released');
      }
    } catch {
      // Ignore release errors
    } finally {
      if (guardToken) {
        releaseCleanupGuard(cleanupPath, guardToken);
      }
    }
  };
}

/**
 * Try to acquire the startup lock once.
 *
 * @param log Logger function for verbose output
 * @returns LockResult with acquired=true if lock obtained
 */
function tryAcquireLockOnce(log: LogFn): LockResult {
  const lockPath = getLockPath();
  const dir = path.dirname(lockPath);

  // Ensure directory exists
  if (!fs.existsSync(dir)) {
    log(`Creating lock directory: ${dir}`);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  const lockToken = crypto.randomUUID();
  const lockData: LockData = {
    pid: process.pid,
    timestamp: Date.now(),
    hostname: os.hostname(),
    token: lockToken,
  };
  const serializedLockData = JSON.stringify(lockData);

  // Fast path: exclusive creation
  try {
    fs.writeFileSync(lockPath, serializedLockData, { flag: 'wx', mode: 0o600 });
    log(`Lock acquired by PID ${process.pid}`);
    return {
      acquired: true,
      lockPath,
      release: buildReleaseFn(lockPath, lockToken, log),
    };
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }

  const cleanupPath = getCleanupGuardPath(lockPath);
  const guardToken = tryAcquireCleanupGuard(cleanupPath);
  if (!guardToken) {
    log('Lock cleanup guard held by another process');
    return {
      acquired: false,
      lockPath,
      release: () => {},
    };
  }

  try {
    let stat: fs.Stats;
    let content: string;
    try {
      stat = fs.statSync(lockPath);
      content = fs.readFileSync(lockPath, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        try {
          fs.writeFileSync(lockPath, serializedLockData, { flag: 'wx', mode: 0o600 });
          log(`Lock acquired by PID ${process.pid}`);
          return {
            acquired: true,
            lockPath,
            release: buildReleaseFn(lockPath, lockToken, log),
          };
        } catch (writeErr) {
          if ((writeErr as NodeJS.ErrnoException).code === 'EEXIST') {
            return { acquired: false, lockPath, release: () => {} };
          }
          throw writeErr;
        }
      }
      throw err;
    }

    if (!content.trim() && Date.now() - stat.mtimeMs < NEW_EMPTY_LOCK_GRACE_MS) {
      log('Lock file is newly created; waiting before stale evaluation');
      return { acquired: false, lockPath, release: () => {} };
    }

    let shouldRemove = false;
    try {
      const existingLock = JSON.parse(content) as LockData;
      if (!isLockStale(existingLock)) {
        log(`Lock held by PID ${existingLock.pid} (age: ${Date.now() - existingLock.timestamp}ms)`);
        return {
          acquired: false,
          lockPath,
          release: () => {},
        };
      }
      log(`Removing stale lock from PID ${existingLock.pid}`);
      shouldRemove = true;
    } catch {
      if (Date.now() - stat.mtimeMs < NEW_EMPTY_LOCK_GRACE_MS) {
        log('Lock file parse failed within grace window; waiting');
        return { acquired: false, lockPath, release: () => {} };
      }
      log('Removing invalid lock file');
      shouldRemove = true;
    }

    if (!shouldRemove || !isObservedLockUnchanged(lockPath, stat, content)) {
      return { acquired: false, lockPath, release: () => {} };
    }

    fs.unlinkSync(lockPath);
    fs.writeFileSync(lockPath, serializedLockData, { flag: 'wx', mode: 0o600 });
    log(`Lock acquired by PID ${process.pid}`);
    return {
      acquired: true,
      lockPath,
      release: buildReleaseFn(lockPath, lockToken, log),
    };
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'EEXIST') {
      log('Lock acquisition race - another process won');
      return {
        acquired: false,
        lockPath,
        release: () => {},
      };
    }
    throw error;
  } finally {
    releaseCleanupGuard(cleanupPath, guardToken);
  }
}

/**
 * Acquire the startup lock with retries.
 *
 * @param options.retries Number of retry attempts (default: 20)
 * @param options.retryInterval Ms between retries (default: 250)
 * @param options.verbose Enable verbose logging (default: false)
 * @returns LockResult
 * @throws Error if lock cannot be acquired after all retries
 */
export async function acquireStartupLock(options?: {
  retries?: number;
  retryInterval?: number;
  verbose?: boolean;
}): Promise<LockResult> {
  const retries = options?.retries ?? 20;
  const retryInterval = options?.retryInterval ?? 250;
  const log: LogFn = options?.verbose
    ? (msg) => logger.debug('lock.verbose', msg, { retries, retryInterval })
    : noopLog;

  log(`Attempting to acquire startup lock (max ${retries} retries, ${retryInterval}ms interval)`);

  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = tryAcquireLockOnce(log);
    if (result.acquired) {
      return result;
    }

    if (attempt < retries) {
      log(`Retry ${attempt + 1}/${retries} in ${retryInterval}ms...`);
      await new Promise((r) => setTimeout(r, retryInterval));
    }
  }

  log(`Failed to acquire lock after ${retries} attempts`);
  throw new ProxyError(
    `Failed to acquire startup lock after ${retries} attempts. ` +
      `Another CCS process may be starting CLIProxy.`
  );
}

/**
 * Execute a function while holding the startup lock.
 * Lock is automatically released after function completes or throws.
 *
 * @param fn Function to execute
 * @param options Lock acquisition options (retries, retryInterval, verbose)
 * @returns Result of fn
 */
export async function withStartupLock<T>(
  fn: () => Promise<T>,
  options?: { retries?: number; retryInterval?: number; verbose?: boolean }
): Promise<T> {
  const lock = await acquireStartupLock(options);
  try {
    return await fn();
  } finally {
    lock.release();
  }
}
