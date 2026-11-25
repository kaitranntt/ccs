/**
 * Misc Routes - Generic file API and global environment variables
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

import { expandPath } from '../../utils/helpers';
import { withConfigWriteLock } from '../../config/loader/io-locks';

import type { ThinkingConfig } from '../../config/unified-config-types';
import {
  THINKING_BUDGET_MIN,
  THINKING_BUDGET_MAX,
  VALID_THINKING_LEVELS,
  VALID_THINKING_TIERS,
  THINKING_OFF_VALUES,
} from '../../cliproxy';
import {
  createRouteErrorHelpers,
  validateFilePath,
  withPathLock,
  writeTextFileAtomically,
} from './route-helpers';
import { requireLocalAccessWhenAuthDisabled } from '../middleware/auth-middleware';
import {
  getCcsDir,
  getConfigYamlPath,
  getGlobalEnvConfig,
  getThinkingConfig,
  mutateConfig,
} from '../../config/config-loader-facade';

const router = Router();
const { respondInternalError } = createRouteErrorHelpers('misc-routes');

router.use((req: Request, res: Response, next) => {
  if (
    requireLocalAccessWhenAuthDisabled(
      req,
      res,
      'Local configuration endpoints require localhost access when dashboard auth is disabled.'
    )
  ) {
    next();
  }
});

export function resolveThinkingProviderOverridesForSave(
  currentProviderOverrides: ThinkingConfig['provider_overrides'] | undefined,
  updatesProviderOverrides: Record<string, Partial<ThinkingConfig['tier_defaults']>> | undefined,
  shouldClearProviderOverrides: boolean
): ThinkingConfig['provider_overrides'] | undefined {
  if (shouldClearProviderOverrides) {
    return undefined;
  }
  if (updatesProviderOverrides !== undefined) {
    return updatesProviderOverrides;
  }
  return currentProviderOverrides;
}

// ==================== Generic File API ====================

/**
 * GET /api/file - Read a file with path validation
 * Query params: path (required)
 * Returns: { content: string, mtime: number, readonly: boolean, path: string }
 */
router.get('/file', (req: Request, res: Response): void => {
  const filePath = req.query.path as string;

  if (!filePath) {
    res.status(400).json({ error: 'Missing required query parameter: path' });
    return;
  }

  const validation = validateFilePath(filePath);
  if (!validation.valid) {
    res.status(403).json({ error: validation.error });
    return;
  }

  const expandedPath = expandPath(filePath);

  if (!fs.existsSync(expandedPath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  try {
    const stat = fs.statSync(expandedPath);
    const content = fs.readFileSync(expandedPath, 'utf8');

    res.json({
      content,
      mtime: stat.mtime.getTime(),
      readonly: validation.readonly,
      path: expandedPath,
    });
  } catch (error) {
    respondInternalError(res, error, 'Failed to read file.');
  }
});

/**
 * PUT /api/file - Write a file with conflict detection and backup
 * Query params: path (required)
 * Body: { content: string, expectedMtime?: number }
 * Returns: { success: true, mtime: number, backupPath?: string }
 */
router.put('/file', (req: Request, res: Response): void => {
  const filePath = req.query.path as string;
  const { content, expectedMtime } = req.body;

  if (!filePath) {
    res.status(400).json({ error: 'Missing required query parameter: path' });
    return;
  }

  if (typeof content !== 'string') {
    res.status(400).json({ error: 'Missing required field: content' });
    return;
  }

  const validation = validateFilePath(filePath);
  if (!validation.valid) {
    res.status(403).json({ error: validation.error });
    return;
  }

  if (validation.readonly) {
    res.status(403).json({ error: 'File is read-only' });
    return;
  }

  const expandedPath = expandPath(filePath);
  const ccsDir = getCcsDir();
  const isUnifiedConfigYaml = path.resolve(expandedPath) === path.resolve(getConfigYamlPath());

  const runWrite = ():
    | { conflict: true; currentMtime: number }
    | { conflict: false; mtime: number; backupPath?: string } => {
    // Conflict detection (if file exists and expectedMtime provided)
    if (fs.existsSync(expandedPath) && expectedMtime !== undefined) {
      const stat = fs.statSync(expandedPath);
      if (stat.mtime.getTime() !== expectedMtime) {
        return { conflict: true, currentMtime: stat.mtime.getTime() };
      }
    }

    // Create backup if file exists
    let backupPath: string | undefined;
    if (fs.existsSync(expandedPath)) {
      const backupDir = path.join(ccsDir, 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      const filename = path.basename(expandedPath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      backupPath = path.join(backupDir, `${filename}.${timestamp}.bak`);
      fs.copyFileSync(expandedPath, backupPath);
    }

    // Write atomically with unique temp suffix
    writeTextFileAtomically(expandedPath, content);

    const newStat = fs.statSync(expandedPath);
    return {
      conflict: false,
      mtime: newStat.mtime.getTime(),
      backupPath,
    };
  };

  try {
    const result = isUnifiedConfigYaml
      ? withConfigWriteLock(runWrite)
      : withPathLock(expandedPath, 'file write lock', runWrite);

    if (result.conflict) {
      res.status(409).json({
        error: 'File modified externally',
        currentMtime: result.currentMtime,
      });
      return;
    }

    res.json({
      success: true,
      mtime: result.mtime,
      backupPath: result.backupPath,
    });
  } catch (error) {
    respondInternalError(res, error, 'Failed to write file.');
  }
});

/**
 * GET /api/files - List editable files in ~/.ccs/
 * Returns: { files: Array<{ name: string, path: string, mtime: number }> }
 */
router.get('/files', (_req: Request, res: Response): void => {
  const ccsDir = getCcsDir();

  if (!fs.existsSync(ccsDir)) {
    res.json({ files: [] });
    return;
  }

  try {
    const entries = fs.readdirSync(ccsDir, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => {
        const filePath = path.join(ccsDir, entry.name);
        const stat = fs.statSync(filePath);
        return {
          name: entry.name,
          path: `~/.ccs/${entry.name}`,
          mtime: stat.mtime.getTime(),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ files });
  } catch (error) {
    respondInternalError(res, error, 'Failed to list files.');
  }
});

// ==================== Global Environment Variables ====================

/**
 * GET /api/global-env - Get global environment variables configuration
 * Returns the global_env section from config.yaml
 */
router.get('/global-env', (_req: Request, res: Response): void => {
  try {
    const config = getGlobalEnvConfig();
    res.json(config);
  } catch (error) {
    respondInternalError(res, error, 'Failed to load global environment configuration.');
  }
});

/**
 * PUT /api/global-env - Update global environment variables configuration
 * Updates the global_env section in config.yaml
 */
router.put('/global-env', (req: Request, res: Response): void => {
  const { enabled, env } = req.body;

  // Validate env values before acquiring write lock
  if (env !== undefined && typeof env === 'object' && env !== null) {
    for (const [key, value] of Object.entries(env)) {
      if (typeof value !== 'string') {
        res.status(400).json({ error: `Invalid value for ${key}: must be a string` });
        return;
      }
    }
  }

  try {
    // Atomic read-modify-write — avoids race between load and save
    const updated = mutateConfig((config) => {
      config.global_env = {
        enabled: enabled ?? config.global_env?.enabled ?? true,
        env: env ?? config.global_env?.env ?? {},
      };
    });
    res.json({ success: true, config: updated.global_env });
  } catch (error) {
    respondInternalError(res, error, 'Failed to update global environment configuration.');
  }
});

// ==================== Thinking Configuration ====================

/**
 * GET /api/thinking - Get thinking budget configuration
 * Returns the thinking section from config.yaml with mtime for optimistic locking
 */
router.get('/thinking', (_req: Request, res: Response): void => {
  try {
    const config = getThinkingConfig();
    // W4: Include mtime for optimistic locking
    let lastModified: number | undefined;
    try {
      const stats = fs.statSync(getConfigYamlPath());
      lastModified = stats.mtimeMs;
    } catch {
      // File may not exist yet
    }
    res.json({ config, lastModified });
  } catch (error) {
    respondInternalError(res, error, 'Failed to load thinking configuration.');
  }
});

/**
 * PUT /api/thinking - Update thinking budget configuration
 * Updates the thinking section in config.yaml
 * Supports optimistic locking via lastModified field
 */
router.put('/thinking', (req: Request, res: Response): void => {
  try {
    const {
      lastModified,
      clear_override: clearOverrideFlag,
      clear_provider_overrides: clearProviderOverridesFlag,
      ...updates
    } = req.body as Omit<Partial<ThinkingConfig>, 'override' | 'provider_overrides'> & {
      lastModified?: number;
      override?: string | number | null;
      provider_overrides?: Record<string, Partial<ThinkingConfig['tier_defaults']>> | null;
      clear_override?: boolean;
      clear_provider_overrides?: boolean;
    };

    // W4: Optimistic locking - check if file was modified since last read
    if (lastModified !== undefined) {
      try {
        const stats = fs.statSync(getConfigYamlPath());
        if (stats.mtimeMs > lastModified) {
          res.status(409).json({
            error: 'Config was modified by another process. Please refresh and try again.',
            currentMtime: stats.mtimeMs,
          });
          return;
        }
      } catch {
        // File may not exist yet, allow creation
      }
    }

    const shouldClearOverride = clearOverrideFlag === true || updates.override === null;
    const shouldClearProviderOverrides =
      clearProviderOverridesFlag === true || updates.provider_overrides === null;
    let normalizedOverride: string | number | undefined;
    let normalizedProviderOverrides:
      | Record<string, Partial<ThinkingConfig['tier_defaults']>>
      | undefined;

    // Validate mode if provided
    if (updates.mode !== undefined) {
      const validModes = ['auto', 'off', 'manual'];
      const normalizedMode = updates.mode.toLowerCase().trim();
      if (!validModes.includes(normalizedMode)) {
        res.status(400).json({ error: `Invalid mode: must be one of ${validModes.join(', ')}` });
        return;
      }
      updates.mode = normalizedMode as ThinkingConfig['mode'];
    }

    // Validate override if provided (budget or level)
    if (updates.override !== undefined && updates.override !== null) {
      // C3: Reject objects/arrays - only number or string allowed
      if (typeof updates.override !== 'number' && typeof updates.override !== 'string') {
        res.status(400).json({
          error: 'Invalid override: must be a number or string, not object/array',
        });
        return;
      }

      if (typeof updates.override === 'number') {
        if (
          !Number.isFinite(updates.override) ||
          updates.override < THINKING_BUDGET_MIN ||
          updates.override > THINKING_BUDGET_MAX
        ) {
          res.status(400).json({
            error: `Invalid override: must be between ${THINKING_BUDGET_MIN} and ${THINKING_BUDGET_MAX}`,
          });
          return;
        }
        normalizedOverride = updates.override;
      } else if (typeof updates.override === 'string') {
        const normalizedValue = updates.override.toLowerCase().trim();
        const validValues = [...VALID_THINKING_LEVELS, ...THINKING_OFF_VALUES] as readonly string[];
        if (!validValues.includes(normalizedValue)) {
          res.status(400).json({
            error: `Invalid override: must be a level name (${VALID_THINKING_LEVELS.join(', ')}) or a number`,
          });
          return;
        }
        normalizedOverride = normalizedValue === '0' ? 'off' : normalizedValue;
      }
    }

    // Validate tier_defaults if provided
    if (updates.tier_defaults !== undefined) {
      if (
        typeof updates.tier_defaults !== 'object' ||
        updates.tier_defaults === null ||
        Array.isArray(updates.tier_defaults)
      ) {
        res.status(400).json({ error: 'Invalid tier_defaults: must be an object' });
        return;
      }
      const validLevels = [...VALID_THINKING_LEVELS] as string[];
      for (const [tier, level] of Object.entries(updates.tier_defaults)) {
        if (!(VALID_THINKING_TIERS as readonly string[]).includes(tier)) {
          res.status(400).json({ error: `Invalid tier: ${tier}` });
          return;
        }
        if (!validLevels.includes(level)) {
          res.status(400).json({
            error: `Invalid level for ${tier}: must be one of ${validLevels.join(', ')}`,
          });
          return;
        }
      }
    }

    // C4: Validate provider_overrides if provided (nested structure: Record<string, Partial<ThinkingTierDefaults>>)
    if (updates.provider_overrides !== undefined && updates.provider_overrides !== null) {
      if (
        typeof updates.provider_overrides !== 'object' ||
        updates.provider_overrides === null ||
        Array.isArray(updates.provider_overrides)
      ) {
        res.status(400).json({ error: 'Invalid provider_overrides: must be an object' });
        return;
      }
      const validLevels = [...VALID_THINKING_LEVELS] as string[];
      const validTiers = [...VALID_THINKING_TIERS] as string[];
      const sanitizedOverrides: Record<string, Partial<ThinkingConfig['tier_defaults']>> = {};
      for (const [provider, tierOverrides] of Object.entries(updates.provider_overrides)) {
        if (typeof provider !== 'string' || provider.trim() === '') {
          res
            .status(400)
            .json({ error: 'Invalid provider_overrides: keys must be non-empty strings' });
          return;
        }
        // tierOverrides should be Partial<ThinkingTierDefaults>
        if (typeof tierOverrides !== 'object' || tierOverrides === null) {
          res.status(400).json({
            error: `Invalid provider_overrides for ${provider}: must be an object with tier→level mapping`,
          });
          return;
        }
        for (const [tier, level] of Object.entries(tierOverrides)) {
          if (!validTiers.includes(tier)) {
            res.status(400).json({
              error: `Invalid tier '${tier}' in provider_overrides.${provider}: must be one of ${validTiers.join(', ')}`,
            });
            return;
          }
          if (typeof level !== 'string' || !validLevels.includes(level.toLowerCase().trim())) {
            res.status(400).json({
              error: `Invalid level for provider_overrides.${provider}.${tier}: must be one of ${validLevels.join(', ')}`,
            });
            return;
          }
          const normalizedProvider = provider.trim().toLowerCase();
          const normalizedTier = tier.trim().toLowerCase() as keyof ThinkingConfig['tier_defaults'];
          const normalizedLevel = level.toLowerCase().trim();
          sanitizedOverrides[normalizedProvider] = sanitizedOverrides[normalizedProvider] ?? {};
          sanitizedOverrides[normalizedProvider][normalizedTier] = normalizedLevel;
        }
      }
      normalizedProviderOverrides =
        Object.keys(sanitizedOverrides).length > 0 ? sanitizedOverrides : undefined;
    }

    const config = mutateConfig((currentConfig) => {
      currentConfig.thinking = {
        mode: updates.mode ?? currentConfig.thinking?.mode ?? 'auto',
        override: shouldClearOverride
          ? undefined
          : updates.override !== undefined
            ? normalizedOverride
            : currentConfig.thinking?.override,
        tier_defaults: {
          opus:
            updates.tier_defaults?.opus ?? currentConfig.thinking?.tier_defaults?.opus ?? 'high',
          sonnet:
            updates.tier_defaults?.sonnet ??
            currentConfig.thinking?.tier_defaults?.sonnet ??
            'medium',
          haiku:
            updates.tier_defaults?.haiku ?? currentConfig.thinking?.tier_defaults?.haiku ?? 'low',
        },
        provider_overrides: resolveThinkingProviderOverridesForSave(
          currentConfig.thinking?.provider_overrides,
          updates.provider_overrides !== undefined ? normalizedProviderOverrides : undefined,
          shouldClearProviderOverrides
        ),
        show_warnings: updates.show_warnings ?? currentConfig.thinking?.show_warnings ?? true,
      };
    });

    // W4: Return new mtime for subsequent requests
    let newMtime: number | undefined;
    try {
      const stats = fs.statSync(getConfigYamlPath());
      newMtime = stats.mtimeMs;
    } catch {
      // Ignore
    }

    res.json({ success: true, config: config.thinking, lastModified: newMtime });
  } catch (error) {
    respondInternalError(res, error, 'Failed to update thinking configuration.');
  }
});

export default router;
