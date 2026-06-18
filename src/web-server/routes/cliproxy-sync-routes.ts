/**
 * CLIProxy Sync Routes - Local sync management for CLIProxy profiles
 */

import { Router, Request, Response } from 'express';

import {
  generateSyncPayload,
  generateSyncPreview,
  getAutoSyncStatus,
  restartAutoSyncWatcher,
  syncToLocalConfig,
  getLocalSyncStatus,
} from '../../cliproxy/sync';
import { mutateConfig } from '../../config/config-loader-facade';
import { createLogger } from '../../services/logging';

const router = Router();
const logger = createLogger('web-server:routes:cliproxy-sync');

/**
 * GET /api/cliproxy/sync/status - Get local sync status
 * Returns: { configExists, configPath, currentKeyCount, syncableProfileCount }
 */
router.get('/status', async (_req: Request, res: Response): Promise<void> => {
  try {
    const status = getLocalSyncStatus();
    res.json({
      configured: status.configExists,
      configPath: status.configPath,
      currentKeyCount: status.currentKeyCount,
      syncableProfileCount: status.syncableProfileCount,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/cliproxy/sync/preview - Get sync preview (dry run)
 * Returns: { profiles: SyncPreviewItem[], payload: ClaudeKey[] }
 */
router.get('/preview', async (_req: Request, res: Response): Promise<void> => {
  try {
    const preview = generateSyncPreview();
    const payload = generateSyncPayload();

    // Mask API keys in payload for preview
    const maskedPayload = payload.map((key) => ({
      ...key,
      'api-key': maskApiKey(key['api-key']),
    }));

    res.json({
      profiles: preview,
      payload: maskedPayload,
      count: payload.length,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/cliproxy/sync - Execute sync to local CLIProxy config
 * Returns: { success, syncedCount, configPath, error? }
 */
router.post('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = syncToLocalConfig();

    if (!result.success) {
      res.status(500).json({
        success: false,
        error: result.error,
        configPath: result.configPath,
      });
      return;
    }

    if (result.syncedCount === 0) {
      res.json({
        success: true,
        syncedCount: 0,
        message: 'No profiles to sync',
        configPath: result.configPath,
      });
      return;
    }

    const preview = generateSyncPreview();
    res.json({
      success: true,
      syncedCount: result.syncedCount,
      configPath: result.configPath,
      profiles: preview.map((p) => p.name),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// ==================== Auto-Sync ====================

/**
 * GET /api/cliproxy/sync/auto-sync - Get auto-sync status
 * Returns: { enabled, watching, syncing }
 */
router.get('/auto-sync', async (_req: Request, res: Response): Promise<void> => {
  try {
    const status = getAutoSyncStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * PUT /api/cliproxy/sync/auto-sync - Toggle auto-sync setting
 * Body: { enabled: boolean }
 * Returns: { success: true, enabled }
 */
router.put('/auto-sync', async (req: Request, res: Response): Promise<void> => {
  try {
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'Invalid field: enabled must be a boolean' });
      return;
    }

    try {
      mutateConfig((config) => {
        if (!config.cliproxy) {
          throw new Error('CLIProxy config not initialized');
        }
        config.cliproxy.auto_sync = enabled;
      });
    } catch (error) {
      res.status(500).json({ error: `Failed to save config: ${(error as Error).message}` });
      return;
    }

    // Restart watcher (separate operation)
    try {
      await restartAutoSyncWatcher();
    } catch (watcherError) {
      // Log but don't fail - config was saved successfully
      const e = watcherError as Error;
      logger.warn('auto_sync.watcher_restart_failed', 'Watcher restart failed after config save', {
        enabled,
        err: { name: e.name, message: e.message },
      });
    }

    res.json({ success: true, enabled });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Mask API key for display (show first 4 and last 4 chars).
 */
function maskApiKey(key: string): string {
  if (key.length <= 12) {
    return '***';
  }
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export default router;
