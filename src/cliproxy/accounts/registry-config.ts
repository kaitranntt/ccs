/** Lightweight registry config reads for config generation, without account-service imports. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getCliproxyDir } from '../config/path-resolver';
import { withSyncLockRetry } from '../../utils/sync-lock-retry';
import type { CLIProxyProvider } from '../types';
import type { DrainOrderConfig } from './types';

export function getAccountsRegistryPath(): string {
  return path.join(getCliproxyDir(), 'accounts.json');
}

export function withAccountsRegistryLock<T>(callback: () => T): T {
  const lockTarget = getCliproxyDir();

  if (!fs.existsSync(lockTarget)) {
    fs.mkdirSync(lockTarget, { recursive: true, mode: 0o700 });
  }

  return withSyncLockRetry(lockTarget, callback, {
    description: 'CLIProxy account registry lock',
    staleMs: 10000,
    retryDelayMs: 200,
    retryTimeoutMs: 10000,
  });
}

/**
 * Load persisted drain order configuration for a provider.
 * Returns undefined if none stored or unreadable (implies file order).
 */
export function loadDrainOrderConfig(provider: CLIProxyProvider): DrainOrderConfig | undefined {
  return withAccountsRegistryLock(() => {
    const registryPath = getAccountsRegistryPath();
    if (!fs.existsSync(registryPath)) {
      return undefined;
    }

    try {
      const data = JSON.parse(fs.readFileSync(registryPath, 'utf-8')) as {
        providers?: Partial<Record<CLIProxyProvider, { drainOrder?: DrainOrderConfig }>>;
      };
      return data?.providers?.[provider]?.drainOrder;
    } catch {
      return undefined;
    }
  });
}

/** Registry writes are atomic renames, so a read observes one complete config revision. */
export function isClaudeQuotaDrainOrderConfigured(): boolean {
  try {
    const registry = JSON.parse(fs.readFileSync(getAccountsRegistryPath(), 'utf8')) as {
      providers?: { claude?: { drainOrder?: { mode?: unknown } } };
    };
    return registry.providers?.claude?.drainOrder?.mode === 'quota';
  } catch {
    return false;
  }
}
