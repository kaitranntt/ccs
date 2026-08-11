import { AsyncLocalStorage } from 'async_hooks';
import * as fs from 'fs';
import * as path from 'path';
import * as lockfile from 'proper-lockfile';

const heldInstallLocks = new AsyncLocalStorage<Set<string>>();

export async function withInstallLifecycleLock<T>(
  lockTarget: string,
  operation: () => Promise<T>
): Promise<T> {
  const resolvedTarget = path.resolve(lockTarget);
  const held = heldInstallLocks.getStore();
  if (held?.has(resolvedTarget)) return operation();

  fs.mkdirSync(resolvedTarget, { recursive: true });
  const release = await lockfile.lock(resolvedTarget, {
    stale: 10 * 60 * 1000,
    retries: { retries: 60, factor: 1, minTimeout: 250, maxTimeout: 250 },
  });
  const nextHeld = new Set(held);
  nextHeld.add(resolvedTarget);
  let operationError: unknown;

  try {
    return await heldInstallLocks.run(nextHeld, operation);
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try {
      await release();
    } catch (error) {
      if (!operationError) throw error;
    }
  }
}
