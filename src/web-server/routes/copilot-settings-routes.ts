/**
 * Copilot Settings Routes - Settings editor and raw settings for GitHub Copilot
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import {
  normalizeCopilotConfigWithWarnings,
  normalizeCopilotSettingsWithWarnings,
} from '../../copilot/copilot-model-normalizer';
import { DEFAULT_COPILOT_CONFIG, type CopilotConfig } from '../../config/unified-config-types';
import {
  getCcsDir,
  loadOrCreateUnifiedConfig,
  mutateConfig,
} from '../../config/config-loader-facade';
import { ConfigError } from '../../errors/error-types';

const router = Router();

function serializeSettings(settings: Record<string, unknown>): string {
  return JSON.stringify(settings, null, 2) + '\n';
}

function writeSettingsFile(
  settingsPath: string,
  settings: Record<string, unknown>,
  previousContent?: string
): void {
  const nextContent = serializeSettings(settings);
  if (previousContent === nextContent) return;
  const tempPath = `${settingsPath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tempPath, nextContent);
  fs.renameSync(tempPath, settingsPath);
}

function restoreSettingsFile(
  settingsPath: string,
  previousContent: string | undefined,
  existedBefore: boolean
): void {
  if (!existedBefore) {
    if (fs.existsSync(settingsPath)) {
      fs.unlinkSync(settingsPath);
    }
    return;
  }

  const tempPath = `${settingsPath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.restore.tmp`;
  fs.writeFileSync(tempPath, previousContent ?? '');
  fs.renameSync(tempPath, settingsPath);
}

function buildDefaultSettings(copilotConfig: CopilotConfig) {
  return {
    env: {
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${copilotConfig.port}`,
      ANTHROPIC_AUTH_TOKEN: 'copilot-managed',
      ANTHROPIC_MODEL: copilotConfig.model,
      ANTHROPIC_DEFAULT_OPUS_MODEL: copilotConfig.opus_model || copilotConfig.model,
      ANTHROPIC_DEFAULT_SONNET_MODEL: copilotConfig.sonnet_model || copilotConfig.model,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: copilotConfig.haiku_model || copilotConfig.model,
      ANTHROPIC_SMALL_FAST_MODEL: copilotConfig.haiku_model || copilotConfig.model,
    },
  };
}

/**
 * GET /api/copilot/settings/raw - Get raw copilot.settings.json
 * Returns the raw JSON content for editing in the code editor
 */
router.get('/raw', (_req: Request, res: Response): void => {
  try {
    const settingsPath = path.join(getCcsDir(), 'copilot.settings.json');
    const config = loadOrCreateUnifiedConfig();
    const configResult = normalizeCopilotConfigWithWarnings(
      config.copilot ?? DEFAULT_COPILOT_CONFIG
    );

    if (!fs.existsSync(settingsPath)) {
      const defaultSettings = normalizeCopilotSettingsWithWarnings(
        buildDefaultSettings(configResult.config),
        configResult.config
      );

      res.json({
        settings: defaultSettings.settings,
        effectiveSettings: defaultSettings.settings,
        mtime: Date.now(),
        path: `~/.ccs/copilot.settings.json`,
        exists: false,
        warnings: defaultSettings.warnings,
      });
      return;
    }

    const content = fs.readFileSync(settingsPath, 'utf-8');
    const rawSettings = JSON.parse(content) as Record<string, unknown>;
    const settingsResult = normalizeCopilotSettingsWithWarnings(rawSettings, configResult.config);
    const stat = fs.statSync(settingsPath);

    res.json({
      settings: rawSettings,
      effectiveSettings: settingsResult.settings,
      mtime: stat.mtimeMs,
      path: `~/.ccs/copilot.settings.json`,
      exists: true,
      warnings: settingsResult.warnings,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * PUT /api/copilot/settings/raw - Save raw copilot.settings.json
 * Saves the raw JSON content from the code editor
 */
router.put('/raw', (req: Request, res: Response): void => {
  try {
    const { settings, expectedMtime } = req.body;
    const settingsPath = path.join(getCcsDir(), 'copilot.settings.json');

    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      res.status(400).json({ error: 'settings must be a JSON object' });
      return;
    }

    const currentConfig = loadOrCreateUnifiedConfig();
    const configResult = normalizeCopilotConfigWithWarnings(
      currentConfig.copilot ?? DEFAULT_COPILOT_CONFIG
    );

    // Check for conflict if file exists and expectedMtime provided
    if (fs.existsSync(settingsPath) && expectedMtime) {
      const stat = fs.statSync(settingsPath);
      if (Math.abs(stat.mtimeMs - expectedMtime) > 1000) {
        res.status(409).json({ error: 'File modified externally', mtime: stat.mtimeMs });
        return;
      }
    }

    const settingsResult = normalizeCopilotSettingsWithWarnings(
      settings as Record<string, unknown>,
      configResult.config
    );
    const existedBefore = fs.existsSync(settingsPath);
    const previousContent = existedBefore ? fs.readFileSync(settingsPath, 'utf-8') : undefined;
    writeSettingsFile(
      settingsPath,
      settingsResult.settings as Record<string, unknown>,
      previousContent
    );

    try {
      mutateConfig((config) => {
        config.copilot = settingsResult.effectiveConfig;
      });
    } catch (error) {
      try {
        restoreSettingsFile(settingsPath, previousContent, existedBefore);
      } catch (rollbackError) {
        throw new ConfigError(
          `Failed to sync unified config after writing Copilot settings: ${(error as Error).message}. Rollback also failed: ${(rollbackError as Error).message}`,
          settingsPath
        );
      }
      throw error;
    }

    const stat = fs.statSync(settingsPath);
    res.json({
      success: true,
      mtime: stat.mtimeMs,
      settings: settingsResult.settings,
      warnings: settingsResult.warnings,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
