/** Lightweight registry config reads for config generation, without account-service imports. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getCliproxyDir } from '../config/path-resolver';

export function getAccountsRegistryPath(): string {
  return path.join(getCliproxyDir(), 'accounts.json');
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
