/**
 * Preset sub-routes for /api/settings/:profile/presets.
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { createRouteErrorHelpers } from './route-helpers';
import {
  requireExistingSettingsPathWithinCcs,
  requireSensitiveLocalAccess,
  resolveSettingsPath,
  withSettingsFileLock,
  writeSettingsAtomically,
} from './settings-path-resolver';
import {
  canonicalizeProfileModelId,
  canonicalizeProfileSettings,
  findDeniedProfileModel,
  loadCanonicalProfileSettings,
} from './settings-canonicalizer';

const { respondInternalError } = createRouteErrorHelpers('settings-routes');

export function registerSettingsPresetsRoutes(router: Router): void {
  /** GET /api/settings/:profile/presets - Get saved presets for a provider */
  router.get('/:profile/presets', (req: Request, res: Response): void => {
    try {
      const { profile } = req.params;
      const settingsPath = resolveSettingsPath(profile);

      if (!requireExistingSettingsPathWithinCcs(settingsPath)) {
        res.json({ presets: [] });
        return;
      }

      const settings = withSettingsFileLock(settingsPath, () =>
        loadCanonicalProfileSettings(profile, settingsPath, true)
      );
      res.json({ presets: settings.presets || [] });
    } catch (error) {
      respondInternalError(res, error, 'Internal server error.');
    }
  });

  /** POST /api/settings/:profile/presets - Create a new preset */
  router.post('/:profile/presets', (req: Request, res: Response): void => {
    if (!requireSensitiveLocalAccess(req, res)) return;

    try {
      const { profile } = req.params;
      const { name, default: defaultModel, opus, sonnet, haiku } = req.body;

      if (!name || !defaultModel) {
        res.status(400).json({ error: 'Missing required fields: name, default' });
        return;
      }

      const settingsPath = resolveSettingsPath(profile);

      let persistedPreset:
        | {
            name: string;
            default: string;
            opus: string;
            sonnet: string;
            haiku: string;
          }
        | undefined;

      withSettingsFileLock(settingsPath, () => {
        if (!fs.existsSync(settingsPath)) {
          fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
          fs.writeFileSync(settingsPath, JSON.stringify({ env: {}, presets: [] }, null, 2) + '\n');
        }

        const settings = loadCanonicalProfileSettings(profile, settingsPath, false);
        settings.presets = settings.presets || [];

        if (settings.presets.some((p) => p.name === name)) {
          res.status(409).json({ error: 'Preset with this name already exists' });
          return;
        }

        const normalizePresetModel = (modelId: string): string =>
          canonicalizeProfileModelId(profile, modelId, settings);

        for (const modelId of [
          defaultModel,
          opus || defaultModel,
          sonnet || defaultModel,
          haiku || defaultModel,
        ]) {
          const deniedReason = findDeniedProfileModel(profile, modelId, settings);
          if (deniedReason) {
            res.status(400).json({ error: deniedReason });
            return;
          }
        }

        const preset = {
          name,
          default: normalizePresetModel(defaultModel),
          opus: normalizePresetModel(opus || defaultModel),
          sonnet: normalizePresetModel(sonnet || defaultModel),
          haiku: normalizePresetModel(haiku || defaultModel),
        };

        settings.presets.push(preset);
        const canonicalizedSettings = canonicalizeProfileSettings(profile, settings);
        writeSettingsAtomically(settingsPath, canonicalizedSettings);
        persistedPreset =
          canonicalizedSettings.presets?.find((entry) => entry.name === name) || preset;
      });

      if (res.headersSent) {
        return;
      }

      res.status(201).json({ preset: persistedPreset });
    } catch (error) {
      respondInternalError(res, error, 'Internal server error.');
    }
  });

  /** DELETE /api/settings/:profile/presets/:name - Delete a preset */
  router.delete('/:profile/presets/:name', (req: Request, res: Response): void => {
    if (!requireSensitiveLocalAccess(req, res)) return;

    try {
      const { profile, name } = req.params;
      const settingsPath = resolveSettingsPath(profile);

      withSettingsFileLock(settingsPath, () => {
        if (!fs.existsSync(settingsPath)) {
          res.status(404).json({ error: 'Settings not found' });
          return;
        }

        const settings = loadCanonicalProfileSettings(profile, settingsPath, false);
        if (!settings.presets || !settings.presets.some((p) => p.name === name)) {
          res.status(404).json({ error: 'Preset not found' });
          return;
        }

        settings.presets = settings.presets.filter((p) => p.name !== name);
        const canonicalizedSettings = canonicalizeProfileSettings(profile, settings);
        writeSettingsAtomically(settingsPath, canonicalizedSettings);
      });

      if (res.headersSent) {
        return;
      }

      res.json({ success: true });
    } catch (error) {
      respondInternalError(res, error, 'Internal server error.');
    }
  });
}
