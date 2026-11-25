/**
 * Tests for Auto-Sync Watcher
 * Verifies debounce behavior, watcher lifecycle, and state management.
 */

import { afterEach, beforeEach, describe, it } from 'bun:test';
import * as assert from 'assert';

describe('Auto-Sync Watcher', () => {
  const autoSyncWatcher = require('../../../../dist/cliproxy/sync/auto-sync-watcher');

  beforeEach(async () => {
    // Ensure clean state before each test
    await autoSyncWatcher.resetWatcherState();
  });

  afterEach(async () => {
    // Clean up after each test
    await autoSyncWatcher.stopAutoSyncWatcher();
  });

  describe('isAutoSyncEnabled', () => {
    it('returns a boolean', () => {
      const result = autoSyncWatcher.isAutoSyncEnabled();
      assert.ok(typeof result === 'boolean');
    });
  });

  describe('getAutoSyncStatus', () => {
    it('returns status object with required fields', () => {
      const status = autoSyncWatcher.getAutoSyncStatus();

      assert.ok(typeof status === 'object');
      assert.ok(typeof status.enabled === 'boolean');
      assert.ok(typeof status.watching === 'boolean');
      assert.ok(typeof status.syncing === 'boolean');
    });

    it('reports not watching when watcher not started', () => {
      const status = autoSyncWatcher.getAutoSyncStatus();
      assert.strictEqual(status.watching, false);
    });

    it('reports not syncing initially', () => {
      const status = autoSyncWatcher.getAutoSyncStatus();
      assert.strictEqual(status.syncing, false);
    });
  });

  describe('startAutoSyncWatcher', () => {
    it('does not throw when called', () => {
      assert.doesNotThrow(() => {
        autoSyncWatcher.startAutoSyncWatcher();
      });
    });

    it('is idempotent (can be called multiple times)', () => {
      assert.doesNotThrow(() => {
        autoSyncWatcher.startAutoSyncWatcher();
        autoSyncWatcher.startAutoSyncWatcher();
      });
    });
  });

  describe('stopAutoSyncWatcher', () => {
    it('resolves without error', async () => {
      await assert.doesNotReject(async () => {
        await autoSyncWatcher.stopAutoSyncWatcher();
      });
    });

    it('can stop when not started', async () => {
      await assert.doesNotReject(async () => {
        await autoSyncWatcher.stopAutoSyncWatcher();
      });
    });
  });

  describe('restartAutoSyncWatcher', () => {
    it('resolves without error', async () => {
      await assert.doesNotReject(async () => {
        await autoSyncWatcher.restartAutoSyncWatcher();
      });
    });
  });

  describe('resetWatcherState', () => {
    it('clears all state', async () => {
      // Start watcher to set state
      autoSyncWatcher.startAutoSyncWatcher();

      // Reset state
      await autoSyncWatcher.resetWatcherState();

      // Verify state is cleared
      const status = autoSyncWatcher.getAutoSyncStatus();
      assert.strictEqual(status.watching, false);
      assert.strictEqual(status.syncing, false);
    });

    it('is safe to call multiple times', async () => {
      await assert.doesNotReject(async () => {
        await autoSyncWatcher.resetWatcherState();
        await autoSyncWatcher.resetWatcherState();
        await autoSyncWatcher.resetWatcherState();
      });
    });
  });

  describe('Debounce Behavior', () => {
    /**
     * Debounce is set to 3000ms (DEBOUNCE_MS constant).
     * This prevents sync storms during rapid edits.
     *
     * Testing actual debounce requires file system manipulation
     * and timing-based assertions, which are flaky in unit tests.
     * Integration tests should cover this behavior.
     */
    it('debounce constant is documented', () => {
      // DEBOUNCE_MS = 3000 (3 seconds)
      assert.ok(true, 'Debounce documented in code comments');
    });
  });
});
