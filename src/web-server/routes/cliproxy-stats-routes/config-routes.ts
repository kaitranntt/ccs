/**
 * CLIProxy config + auth-files + model-update routes.
 *
 * - GET/PUT /config.yaml
 * - GET /auth-files, GET /auth-files/download
 * - PUT /models/:provider
 *
 * All require fs + path; extracted from the original god file to keep each
 * submodule focused and well under the LOC budget.
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import {
  getCliproxyWritablePath,
  getCliproxyConfigPath,
  getAuthDir,
} from '../../../cliproxy/config/config-generator';
import {
  MODEL_ENV_VAR_KEYS,
  canonicalizeModelIdForProvider,
  getDeniedModelIdReasonForProvider,
} from '../../../cliproxy/ai-providers/model-id-normalizer';
import { logger } from './shared';

/**
 * Registers config, auth-files, and model-update routes on the given router.
 */
export function registerConfigRoutes(router: Router): void {
  // ==================== Config File ====================

  router.get('/config.yaml', async (_req: Request, res: Response): Promise<void> => {
    try {
      const configPath = getCliproxyConfigPath();
      if (!fs.existsSync(configPath)) {
        res.status(404).json({ error: 'Config file not found' });
        return;
      }

      const content = fs.readFileSync(configPath, 'utf8');
      res.type('text/yaml').send(content);
    } catch (error) {
      logger.error('stats.route.error', 'CLIProxy stats route failed to handle request', {
        err:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : { message: String(error) },
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.put('/config.yaml', async (req: Request, res: Response): Promise<void> => {
    try {
      const { content } = req.body;

      if (typeof content !== 'string') {
        res.status(400).json({ error: 'Missing required field: content' });
        return;
      }

      const configPath = getCliproxyConfigPath();
      const configDir = path.dirname(configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      const tempPath = configPath + '.tmp';
      fs.writeFileSync(tempPath, content);
      fs.renameSync(tempPath, configPath);

      res.json({ success: true, path: configPath });
    } catch (error) {
      logger.error('stats.route.error', 'CLIProxy stats route failed to handle request', {
        err:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : { message: String(error) },
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ==================== Auth Files ====================

  router.get('/auth-files', async (_req: Request, res: Response): Promise<void> => {
    try {
      const authDir = getAuthDir();

      if (!fs.existsSync(authDir)) {
        res.json({ files: [] });
        return;
      }

      const entries = fs.readdirSync(authDir, { withFileTypes: true });
      const files = entries
        .filter((entry) => entry.isFile())
        .map((entry) => {
          const filePath = path.join(authDir, entry.name);
          const stat = fs.statSync(filePath);
          return {
            name: entry.name,
            size: stat.size,
            mtime: stat.mtime.getTime(),
          };
        });

      res.json({ files, directory: authDir });
    } catch (error) {
      logger.error('stats.route.error', 'CLIProxy stats route failed to handle request', {
        err:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : { message: String(error) },
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/auth-files/download', async (req: Request, res: Response): Promise<void> => {
    try {
      const { name } = req.query;

      if (!name || typeof name !== 'string') {
        res.status(400).json({ error: 'Missing required query parameter: name' });
        return;
      }

      if (name.includes('..') || name.includes('/') || name.includes('\\')) {
        res.status(400).json({ error: 'Invalid filename' });
        return;
      }

      const authDir = getAuthDir();
      const filePath = path.join(authDir, name);

      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'Auth file not found' });
        return;
      }

      const content = fs.readFileSync(filePath);
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      res.type('application/octet-stream').send(content);
    } catch (error) {
      logger.error('stats.route.error', 'CLIProxy stats route failed to handle request', {
        err:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : { message: String(error) },
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ==================== Model Updates ====================

  router.put('/models/:provider', async (req: Request, res: Response): Promise<void> => {
    try {
      const { provider } = req.params;

      if (!provider || provider.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(provider)) {
        res.status(400).json({ error: 'Invalid provider name' });
        return;
      }

      const { model } = req.body;

      if (!model || typeof model !== 'string') {
        res.status(400).json({ error: 'Missing required field: model' });
        return;
      }

      if (model.length > 256) {
        res.status(400).json({ error: 'Model ID exceeds maximum length (256 characters)' });
        return;
      }

      const deniedReason = getDeniedModelIdReasonForProvider(model, provider);
      if (deniedReason) {
        res.status(400).json({ error: deniedReason });
        return;
      }

      const ccsDir = getCliproxyWritablePath();
      const settingsPath = path.join(ccsDir, `${provider}.settings.json`);

      if (!fs.existsSync(settingsPath)) {
        res.status(404).json({ error: `Settings file not found for provider: ${provider}` });
        return;
      }

      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
        env?: Record<string, unknown>;
        [key: string]: unknown;
      };
      const canonicalModel = canonicalizeModelIdForProvider(model, provider);
      const env =
        settings.env && typeof settings.env === 'object' && !Array.isArray(settings.env)
          ? settings.env
          : {};

      const previousDefault =
        typeof env.ANTHROPIC_MODEL === 'string' ? env.ANTHROPIC_MODEL : canonicalModel;
      const previousCanonicalDefault = canonicalizeModelIdForProvider(previousDefault, provider);

      for (const key of MODEL_ENV_VAR_KEYS) {
        if (key === 'ANTHROPIC_MODEL') {
          env[key] = canonicalModel;
          continue;
        }

        const current = env[key];
        if (typeof current !== 'string') {
          env[key] = canonicalModel;
          continue;
        }

        const canonicalCurrent = canonicalizeModelIdForProvider(current, provider);
        env[key] =
          canonicalCurrent === previousCanonicalDefault ? canonicalModel : canonicalCurrent;
      }
      settings.env = env;

      const tempPath = settingsPath + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(settings, null, 2) + '\n');
      fs.renameSync(tempPath, settingsPath);

      res.json({ success: true, provider, model: canonicalModel });
    } catch (error) {
      logger.error('stats.route.error', 'CLIProxy stats route failed to handle request', {
        err:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : { message: String(error) },
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
