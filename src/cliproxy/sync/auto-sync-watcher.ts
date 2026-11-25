/**
 * Auto-Sync Watcher
 *
 * Watches for profile settings changes and automatically syncs to local CLIProxy config.
 * Uses debouncing to prevent sync storms during rapid edits.
 */

import * as chokidar from 'chokidar';
import * as path from 'path';

import { syncToLocalConfig } from './local-config-sync';
import { getCcsDir, loadOrCreateUnifiedConfig } from '../../config/config-loader-facade';
import { createLogger } from '../../services/logging';

const logger = createLogger('cliproxy:sync:auto-sync-watcher');

/** Debounce delay in milliseconds */
const DEBOUNCE_MS = 3000;

/** Singleton watcher instance */
let watcherInstance: chokidar.FSWatcher | null = null;
let syncTimeout: NodeJS.Timeout | null = null;
let isSyncing = false;

/**
 * Check if auto-sync is enabled in config.
 */
export function isAutoSyncEnabled(): boolean {
  try {
    const config = loadOrCreateUnifiedConfig();
    // For local sync, check cliproxy.auto_sync (simpler config location)
    return config.cliproxy?.auto_sync === true;
  } catch {
    return false;
  }
}

/**
 * Log auto-sync message.
 */
function log(message: string): void {
  logger.info('cliproxy.auto-sync', message);
}

/**
 * Execute sync to local CLIProxy config.
 */
async function triggerSync(): Promise<void> {
  if (isSyncing) {
    log('Sync already in progress, skipping');
    return;
  }

  if (!isAutoSyncEnabled()) {
    log('Auto-sync disabled, skipping');
    return;
  }

  isSyncing = true;

  try {
    const result = syncToLocalConfig();

    if (!result.success) {
      log(`Sync failed: ${result.error}`);
      return;
    }

    if (result.syncedCount === 0) {
      log('No profiles to sync');
      return;
    }

    log(`Success: ${result.syncedCount} profile(s) synced to ${result.configPath}`);
  } catch (error) {
    log(`Sync error: ${(error as Error).message}`);
  } finally {
    isSyncing = false;
  }
}

/**
 * Handle file change event with debouncing.
 */
function onFileChange(filePath: string): void {
  const fileName = path.basename(filePath);
  log(`Profile change detected: ${fileName}`);

  // Clear existing timeout
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }

  log(`Waiting ${DEBOUNCE_MS / 1000}s for additional changes...`);

  // Set new debounced timeout
  syncTimeout = setTimeout(() => {
    syncTimeout = null;
    triggerSync().catch((err) => {
      log(`Sync error: ${err.message}`);
    });
  }, DEBOUNCE_MS);
}

/**
 * Start the auto-sync watcher.
 * Watches ~/.ccs/*.settings.json for changes.
 */
export function startAutoSyncWatcher(): void {
  if (watcherInstance) {
    log('Watcher already running');
    return;
  }

  if (!isAutoSyncEnabled()) {
    // Don't start if disabled, but log nothing (called at startup)
    return;
  }

  const ccsDir = getCcsDir();
  const watchPattern = path.join(ccsDir, '*.settings.json');

  log(`Starting watcher on ${watchPattern}`);

  watcherInstance = chokidar.watch(watchPattern, {
    ignoreInitial: true, // Don't trigger on initial scan
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100,
    },
  });

  watcherInstance.on('change', onFileChange);
  watcherInstance.on('add', onFileChange);
  watcherInstance.on('unlink', onFileChange);

  watcherInstance.on('error', (error) => {
    log(`Watcher error: ${error.message}`);
  });

  log('Watcher started');
}

/**
 * Stop the auto-sync watcher.
 */
export async function stopAutoSyncWatcher(): Promise<void> {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }

  if (watcherInstance) {
    const closePromise = watcherInstance.close();
    const timeoutPromise = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('Close timeout')), 5000)
    );
    try {
      await Promise.race([closePromise, timeoutPromise]);
    } catch (err) {
      log(`Warning: ${(err as Error).message}, forcing cleanup`);
    }
    watcherInstance = null;
    log('Watcher stopped');
  }

  // Reset flag to prevent stale state
  isSyncing = false;
}

/**
 * Restart the watcher (after config change).
 */
export async function restartAutoSyncWatcher(): Promise<void> {
  // Wait for any active sync to complete (max 10s)
  const maxWait = 10000;
  const start = Date.now();
  while (isSyncing && Date.now() - start < maxWait) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (isSyncing) {
    log('Warning: Sync still in progress after 10s timeout, proceeding with restart');
  }

  await stopAutoSyncWatcher();
  startAutoSyncWatcher();
}

/**
 * Get watcher status.
 */
export function getAutoSyncStatus(): {
  enabled: boolean;
  watching: boolean;
  syncing: boolean;
} {
  return {
    enabled: isAutoSyncEnabled(),
    watching: watcherInstance !== null,
    syncing: isSyncing,
  };
}

/**
 * Reset watcher state for test cleanup.
 * Stops watcher and clears all singleton state.
 */
export async function resetWatcherState(): Promise<void> {
  await stopAutoSyncWatcher();
  watcherInstance = null;
  syncTimeout = null;
  isSyncing = false;
}
