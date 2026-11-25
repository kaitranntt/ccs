/**
 * Settings Routes - Settings and preset management
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { deduplicateCcsHooks } from '../../utils/websearch/hook-utils';
import { removeCcsImageAnalyzerHooks } from '../../utils/hooks/image-analyzer-hook-utils';
import { resolveCliproxyBridgeMetadata } from '../../api/services';
import type { Settings } from '../../types/config';
import { getCcsDir } from '../../config/config-loader-facade';
import { createRouteErrorHelpers } from './route-helpers';
import {
  canResolveSensitiveRuntimeStatus,
  requireExistingSettingsPathWithinCcs,
  requireSensitiveLocalAccess,
  requireWritableSettingsPathWithinCcs,
  resolveSettingsPath,
  withSettingsFileLock,
  writeSettingsTextAtomically,
} from './settings-path-resolver';
import {
  canonicalizeProfileSettings,
  checkRequiredEnvVars,
  loadCanonicalProfileSettingsWithStat,
  maskApiKeys,
  resolveImageAnalysisStatusForProfile,
  resolvePreviewImageAnalysisStatus,
  validateProfileSettingsModelDenylist,
} from './settings-canonicalizer';
import { registerSettingsPresetsRoutes } from './settings-presets-routes';
import { registerSettingsAuthRoutes } from './settings-auth-routes';

const router = Router();
const { respondInternalError } = createRouteErrorHelpers('settings-routes');

/** GET /api/settings/:profile - Get settings with masked API keys */
router.get('/:profile', async (req: Request, res: Response): Promise<void> => {
  try {
    const { profile } = req.params;
    const settingsPath = resolveSettingsPath(profile);

    if (!requireExistingSettingsPathWithinCcs(settingsPath)) {
      res.status(404).json({ error: 'Settings not found' });
      return;
    }

    const { settings, stat } = loadCanonicalProfileSettingsWithStat(profile, settingsPath);
    const masked = maskApiKeys(settings);

    const imageAnalysisStatus = canResolveSensitiveRuntimeStatus(req)
      ? await resolveImageAnalysisStatusForProfile(profile, settings, settingsPath)
      : null;

    res.json({
      profile,
      settings: masked,
      mtime: stat.mtime.getTime(),
      path: settingsPath,
      cliproxyBridge: resolveCliproxyBridgeMetadata(settings),
      imageAnalysisStatus,
    });
  } catch (error) {
    respondInternalError(res, error, 'Internal server error.');
  }
});

/** GET /api/settings/:profile/raw - Get full settings (for editing) */
router.get('/:profile/raw', async (req: Request, res: Response): Promise<void> => {
  if (!requireSensitiveLocalAccess(req, res)) return;

  try {
    const { profile } = req.params;
    const settingsPath = resolveSettingsPath(profile);

    if (!requireExistingSettingsPathWithinCcs(settingsPath)) {
      res.status(404).json({ error: 'Settings not found' });
      return;
    }

    const { settings, stat } = loadCanonicalProfileSettingsWithStat(profile, settingsPath);

    res.json({
      profile,
      settings,
      mtime: stat.mtime.getTime(),
      path: settingsPath,
      cliproxyBridge: resolveCliproxyBridgeMetadata(settings),
      imageAnalysisStatus: await resolveImageAnalysisStatusForProfile(
        profile,
        settings,
        settingsPath
      ),
    });
  } catch (error) {
    respondInternalError(res, error, 'Internal server error.');
  }
});

/** POST /api/settings/:profile/image-analysis-status - Preview image analysis status from editor JSON */
router.post(
  '/:profile/image-analysis-status',
  async (req: Request, res: Response): Promise<void> => {
    if (!requireSensitiveLocalAccess(req, res)) return;

    try {
      const { profile } = req.params;
      const { settings } = req.body;

      if (!settings || typeof settings !== 'object') {
        res.status(400).json({ error: 'settings object is required in request body' });
        return;
      }

      res.json({
        imageAnalysisStatus: await resolvePreviewImageAnalysisStatus(profile, settings as Settings),
      });
    } catch (error) {
      respondInternalError(res, error, 'Internal server error.');
    }
  }
);

/** PUT /api/settings/:profile - Update settings with conflict detection and backup */
router.put('/:profile', (req: Request, res: Response): void => {
  if (!requireSensitiveLocalAccess(req, res)) return;

  try {
    const { profile } = req.params;
    const { settings, expectedMtime } = req.body;

    if (!settings || typeof settings !== 'object') {
      res.status(400).json({ error: 'settings object is required in request body' });
      return;
    }

    const deniedModelReason = validateProfileSettingsModelDenylist(profile, settings as Settings);
    if (deniedModelReason) {
      res.status(400).json({ error: deniedModelReason });
      return;
    }

    const normalizedSettings = canonicalizeProfileSettings(profile, settings as Settings);

    // Deduplicate CCS hooks to prevent accumulation (fixes #450)
    deduplicateCcsHooks(normalizedSettings as Record<string, unknown>);
    removeCcsImageAnalyzerHooks(normalizedSettings as Record<string, unknown>);

    const ccsDir = getCcsDir();
    const missingFields = checkRequiredEnvVars(normalizedSettings);
    const settingsPath = resolveSettingsPath(profile);

    let backupPath: string | undefined;
    let created = false;
    let newMtime = 0;

    withSettingsFileLock(settingsPath, () => {
      const fileExists = fs.existsSync(settingsPath);

      if (fileExists && expectedMtime) {
        const stat = fs.statSync(settingsPath);
        if (stat.mtime.getTime() !== expectedMtime) {
          res.status(409).json({
            error: 'File modified externally',
            currentMtime: stat.mtime.getTime(),
          });
          return;
        }
      }

      const newContent = JSON.stringify(normalizedSettings, null, 2) + '\n';
      if (fileExists) {
        const existingContent = fs.readFileSync(settingsPath, 'utf8');
        if (existingContent !== newContent) {
          const backupDir = path.join(ccsDir, 'backups');
          requireWritableSettingsPathWithinCcs(path.join(backupDir, '.settings-backup-probe'));
          if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
          }
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          backupPath = path.join(backupDir, `${profile}.${timestamp}.settings.json`);
          requireWritableSettingsPathWithinCcs(backupPath);
          fs.copyFileSync(settingsPath, backupPath);
        }
      } else {
        created = true;
        fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      }

      writeSettingsTextAtomically(settingsPath, newContent);
      newMtime = fs.statSync(settingsPath).mtime.getTime();
    });

    if (res.headersSent) {
      return;
    }

    res.json({
      profile,
      mtime: newMtime,
      backupPath,
      created,
      ...(missingFields.length > 0 && {
        warning: `Missing fields will use defaults: ${missingFields.join(', ')}`,
        missingFields,
      }),
    });
  } catch (error) {
    respondInternalError(res, error, 'Internal server error.');
  }
});

registerSettingsPresetsRoutes(router);
registerSettingsAuthRoutes(router);

export default router;
