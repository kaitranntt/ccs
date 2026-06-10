import * as fs from 'fs';
import * as path from 'path';
import * as lockfile from 'proper-lockfile';

const DEFAULT_LOCK_STALE_MS = 10000;
const DEFAULT_LOCK_RETRY_DELAY_MS = 200;
const DEFAULT_LOCK_RETRY_TIMEOUT_MS = 10000;

interface LockOptions {
  staleMs?: number;
  retryDelayMs?: number;
  retryTimeoutMs?: number;
}

export function withClaudeUserConfigLock<T>(
  configPath: string,
  callback: () => T,
  options: LockOptions = {}
): T {
  const configDir = path.dirname(configPath);
  const lockTarget = path.join(configDir, `${path.basename(configPath)}.ccs-lock`);
  const staleMs = options.staleMs ?? DEFAULT_LOCK_STALE_MS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_LOCK_RETRY_DELAY_MS;
  const retryTimeoutMs = options.retryTimeoutMs ?? DEFAULT_LOCK_RETRY_TIMEOUT_MS;
  let release: (() => void) | undefined;

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  }

  if (!fs.existsSync(lockTarget)) {
    fs.writeFileSync(lockTarget, '', { encoding: 'utf8', mode: 0o600 });
  }

  try {
    release = acquireClaudeUserConfigLock(
      lockTarget,
      configPath,
      staleMs,
      retryDelayMs,
      retryTimeoutMs
    );
    return callback();
  } finally {
    if (release) {
      try {
        release();
      } catch {}
    }
  }
}

export function isClaudeUserConfigLockUnavailableError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ELOCKED' || code === 'ENOTACQUIRED';
}

function acquireClaudeUserConfigLock(
  lockTarget: string,
  configPath: string,
  staleMs: number,
  retryDelayMs: number,
  retryTimeoutMs: number
): () => void {
  const startedAt = Date.now();
  let lastError: unknown;

  for (;;) {
    try {
      return lockfile.lockSync(lockTarget, { stale: staleMs }) as () => void;
    } catch (error) {
      if (!isClaudeUserConfigLockUnavailableError(error)) {
        throw error;
      }
      lastError = error;
      if (Date.now() - startedAt >= retryTimeoutMs) {
        throw buildLockTimeoutError(configPath, retryTimeoutMs, lastError);
      }
      sleepSync(retryDelayMs);
    }
  }
}

function sleepSync(ms: number): void {
  if (ms <= 0) {
    return;
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function buildLockTimeoutError(
  configPath: string,
  timeoutMs: number,
  cause: unknown
): NodeJS.ErrnoException {
  const causeCode = (cause as NodeJS.ErrnoException | undefined)?.code;
  const error = new Error(
    `Failed to acquire Claude user config lock for ${configPath} after ${timeoutMs}ms; another CCS process may be starting CLIProxy`
  ) as NodeJS.ErrnoException;
  error.code = causeCode === 'ENOTACQUIRED' ? 'ENOTACQUIRED' : 'ELOCKED';
  return error;
}
