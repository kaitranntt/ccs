/**
 * Settings Routes - Settings and preset management
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as lockfile from 'proper-lockfile';

import { isSensitiveKey, maskSensitiveValue } from '../../utils/sensitive-keys';
import { listVariants } from '../../cliproxy/services/variant-service';
import {
  generateSecureToken,
  maskToken,
  getAuthSummary,
  setGlobalApiKey,
  setGlobalManagementSecret,
  resetAuthToDefaults,
} from '../../cliproxy';
import { regenerateConfig } from '../../cliproxy/config/config-generator';
import { deduplicateCcsHooks } from '../../utils/websearch/hook-utils';
import { removeCcsImageAnalyzerHooks } from '../../utils/hooks/image-analyzer-hook-utils';
import { resolveCliproxyBridgeMetadata } from '../../api/services';

import { requireLocalAccessWhenAuthDisabled } from '../middleware/auth-middleware';
import type { Settings } from '../../types/config';
import type { CLIProxyProvider } from '../../cliproxy/types';
import { mapExternalProviderName } from '../../cliproxy/provider-capabilities';
import { resolveProviderSettingsPath } from '../../cliproxy/config/env-builder';
import { expandPath } from '../../utils/helpers';
import {
  canonicalizeModelIdForProvider,
  extractProviderFromPathname,
  getDeniedModelIdReasonForProvider,
} from '../../cliproxy/ai-providers/model-id-normalizer';
import { createRouteErrorHelpers } from './route-helpers';
import {
  getImageAnalysisProfileSettingsPath,
  hasImageAnalysisProfileHook,
} from '../../utils/hooks/image-analyzer-profile-hook-injector';
import { hasImageAnalyzerHook } from '../../utils/hooks/image-analyzer-hook-installer';
import { resolveImageAnalysisRuntimeStatus } from '../../utils/hooks';
import {
  getCcsDir,
  getImageAnalysisConfig,
  loadConfigSafe,
  loadOrCreateUnifiedConfig,
  loadSettings,
  mutateConfig,
} from '../../config/config-loader-facade';

const router = Router();
const MODEL_ENV_KEYS = [
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
] as const;
const PRESET_MODEL_KEYS = ['default', 'opus', 'sonnet', 'haiku'] as const;
const SETTINGS_IDENTIFIER_PATTERN = /^[a-zA-Z][a-zA-Z0-9._-]*$/;

const { logRouteError, respondInternalError } = createRouteErrorHelpers('settings-routes');

function resolvePathWithin(basePath: string, targetPath: string): string {
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(
    path.isAbsolute(targetPath) ? targetPath : path.join(resolvedBase, targetPath)
  );
  if (!isPathWithin(resolvedBase, resolvedTarget)) {
    throw new Error('Invalid settings path');
  }
  return resolvedTarget;
}

function normalizePathForComparison(targetPath: string): string {
  const resolvedPath = path.resolve(targetPath);
  return process.platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath;
}

function isPathWithin(basePath: string, targetPath: string): boolean {
  const normalizedBase = normalizePathForComparison(basePath);
  const normalizedTarget = normalizePathForComparison(targetPath);
  const relative = path.relative(normalizedBase, normalizedTarget);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function safeRealPath(targetPath: string): string | null {
  try {
    return fs.realpathSync.native(targetPath);
  } catch {
    return null;
  }
}

function getRealCcsDir(): string {
  return safeRealPath(getCcsDir()) ?? path.resolve(getCcsDir());
}

function requirePathWithinRealCcsDir(targetPath: string): void {
  if (!isPathWithin(getRealCcsDir(), targetPath)) {
    throw new Error('Invalid settings path');
  }
}

function requireExistingSettingsPathWithinCcs(settingsPath: string): boolean {
  const realSettingsPath = safeRealPath(settingsPath);
  if (!realSettingsPath) {
    return false;
  }

  requirePathWithinRealCcsDir(realSettingsPath);
  return true;
}

function findExistingParentRealPath(targetPath: string): string | null {
  let currentPath = path.dirname(targetPath);

  while (true) {
    const realParentPath = safeRealPath(currentPath);
    if (realParentPath) {
      return realParentPath;
    }

    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return null;
    }
    currentPath = parentPath;
  }
}

function requireWritableSettingsPathWithinCcs(settingsPath: string): void {
  const realSettingsPath = safeRealPath(settingsPath);
  if (realSettingsPath) {
    requirePathWithinRealCcsDir(realSettingsPath);
    return;
  }

  const realParentPath = findExistingParentRealPath(settingsPath);
  if (!realParentPath) {
    throw new Error('Invalid settings path');
  }
  requirePathWithinRealCcsDir(realParentPath);
}

function resolveSettingsCandidatePath(ccsDir: string, settingsPath: string): string {
  return resolvePathWithin(ccsDir, expandPath(settingsPath));
}

function requireSensitiveLocalAccess(req: Request, res: Response): boolean {
  return requireLocalAccessWhenAuthDisabled(
    req,
    res,
    'Sensitive settings endpoints require localhost access when dashboard auth is disabled.'
  );
}

function classifyConfigSaveFailure(error: unknown): { statusCode: number; message: string } {
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (message.includes('failed to acquire config lock')) {
    return { statusCode: 409, message: 'Configuration is busy. Retry in a moment.' };
  }
  if (message.includes('eacces') || message.includes('eperm') || message.includes('permission')) {
    return { statusCode: 403, message: 'Insufficient permission to update configuration.' };
  }
  if (message.includes('enospc') || message.includes('no space left')) {
    return { statusCode: 507, message: 'Insufficient disk space to update configuration.' };
  }

  return { statusCode: 500, message: 'Failed to update Antigravity power user mode.' };
}

/**
 * Helper: Resolve settings path for profile or variant
 * Variants have settings paths in config, regular profiles use {name}.settings.json
 */
function resolveSettingsPath(profileOrVariant: string): string {
  if (!SETTINGS_IDENTIFIER_PATTERN.test(profileOrVariant)) {
    throw new Error('Invalid profile name');
  }

  const ccsDir = getCcsDir();
  const resolvedCcsDir = path.resolve(ccsDir);

  const directProvider = mapExternalProviderName(profileOrVariant);
  if (directProvider) {
    if (profileOrVariant !== directProvider) {
      return resolvePathWithin(
        resolvedCcsDir,
        path.join(resolvedCcsDir, `${profileOrVariant}.settings.json`)
      );
    }
    return resolvePathWithin(resolvedCcsDir, resolveProviderSettingsPath(directProvider));
  }

  // Check if this is a variant
  const variants = listVariants();
  const variant = variants[profileOrVariant];
  if (variant?.settings) {
    return resolveSettingsCandidatePath(resolvedCcsDir, variant.settings);
  }

  let configuredSettingsPath: string | undefined;
  try {
    configuredSettingsPath = loadConfigSafe().profiles[profileOrVariant];
  } catch {
    // Fall back to the conventional ~/.ccs/<profile>.settings.json path below.
  }
  if (typeof configuredSettingsPath === 'string' && configuredSettingsPath.trim().length > 0) {
    return resolveSettingsCandidatePath(resolvedCcsDir, configuredSettingsPath);
  }

  // Regular profile settings
  return resolvePathWithin(
    resolvedCcsDir,
    path.join(resolvedCcsDir, `${profileOrVariant}.settings.json`)
  );
}

function resolveProviderForProfile(profileOrVariant: string): CLIProxyProvider | null {
  const directProvider = mapExternalProviderName(profileOrVariant);
  if (directProvider) {
    return directProvider;
  }

  const variants = listVariants();
  const variantProvider = variants[profileOrVariant]?.provider;
  if (typeof variantProvider === 'string') {
    return mapExternalProviderName(variantProvider);
  }

  return null;
}

function resolveProviderFromBaseUrl(baseUrl: unknown): CLIProxyProvider | null {
  if (typeof baseUrl !== 'string' || baseUrl.trim().length === 0) {
    return null;
  }

  try {
    const parsed = new URL(baseUrl);
    const extracted = extractProviderFromPathname(parsed.pathname);
    return extracted ? mapExternalProviderName(extracted) : null;
  } catch {
    const extracted = extractProviderFromPathname(baseUrl);
    return extracted ? mapExternalProviderName(extracted) : null;
  }
}

function resolveProviderForSettings(
  profileOrVariant: string,
  settings?: Pick<Settings, 'env'>
): CLIProxyProvider | null {
  const providerFromProfile = resolveProviderForProfile(profileOrVariant);
  if (providerFromProfile) {
    return providerFromProfile;
  }

  const baseUrl =
    settings?.env && typeof settings.env === 'object' ? settings.env.ANTHROPIC_BASE_URL : undefined;
  return resolveProviderFromBaseUrl(baseUrl);
}

function canonicalizeProfileModelId(
  profileOrVariant: string,
  modelId: string,
  settings?: Settings
): string {
  const provider = resolveProviderForSettings(profileOrVariant, settings);
  if (!provider) return modelId;
  return canonicalizeModelIdForProvider(modelId, provider);
}

function findDeniedProfileModel(
  profileOrVariant: string,
  modelId: string,
  settings?: Settings
): string | null {
  const provider = resolveProviderForSettings(profileOrVariant, settings);
  if (!provider) return null;
  return getDeniedModelIdReasonForProvider(modelId, provider);
}

function validateProfileSettingsModelDenylist(
  profileOrVariant: string,
  settings: Settings
): string | null {
  if (settings.env && typeof settings.env === 'object') {
    for (const key of MODEL_ENV_KEYS) {
      const value = settings.env[key];
      if (typeof value !== 'string') continue;
      const deniedReason = findDeniedProfileModel(profileOrVariant, value, settings);
      if (deniedReason) {
        return `${key}: ${deniedReason}`;
      }
    }
  }

  if (!Array.isArray(settings.presets)) return null;

  for (const preset of settings.presets) {
    for (const key of PRESET_MODEL_KEYS) {
      const value = preset[key];
      if (typeof value !== 'string') continue;
      const deniedReason = findDeniedProfileModel(profileOrVariant, value, settings);
      if (deniedReason) {
        const presetName = typeof preset.name === 'string' ? preset.name : 'unnamed';
        return `Preset '${presetName}' (${key}): ${deniedReason}`;
      }
    }
  }

  return null;
}

function canonicalizeProfileSettings(profileOrVariant: string, settings: Settings): Settings {
  const provider = resolveProviderForSettings(profileOrVariant, settings);
  if (!provider) return settings;

  let changed = false;
  const next: Settings = { ...settings };

  if (settings.env && typeof settings.env === 'object') {
    const env = { ...settings.env };
    for (const key of MODEL_ENV_KEYS) {
      const value = env[key];
      if (typeof value !== 'string') continue;
      const canonical = canonicalizeModelIdForProvider(value, provider);
      if (canonical !== value) {
        env[key] = canonical;
        changed = true;
      }
    }
    next.env = env;
  }

  if (Array.isArray(settings.presets)) {
    const normalizedPresets = settings.presets.flatMap((preset) => {
      const normalizedPreset = { ...preset };
      let presetChanged = false;

      for (const key of PRESET_MODEL_KEYS) {
        const value = normalizedPreset[key];
        if (typeof value !== 'string') continue;
        const deniedReason = getDeniedModelIdReasonForProvider(value, provider);
        if (deniedReason) {
          changed = true;
          return [];
        }
        const canonical = canonicalizeModelIdForProvider(value, provider);
        if (canonical !== value) {
          normalizedPreset[key] = canonical;
          presetChanged = true;
        }
      }

      if (presetChanged) changed = true;
      return normalizedPreset;
    });
    next.presets = normalizedPresets;
  }

  return changed ? next : settings;
}

async function resolveImageAnalysisStatusForProfile(
  profileOrVariant: string,
  settings: Settings,
  settingsPath: string
): Promise<Awaited<ReturnType<typeof resolveImageAnalysisRuntimeStatus>>> {
  const variants = listVariants();
  const variant = variants[profileOrVariant];
  const cliproxyProvider = resolveProviderForProfile(profileOrVariant);
  const cliproxyBridge = resolveCliproxyBridgeMetadata(settings);
  const status = await resolveImageAnalysisRuntimeStatus(
    {
      profileName: profileOrVariant,
      profileType: cliproxyProvider ? 'cliproxy' : 'settings',
      cliproxyProvider,
      isComposite: Boolean(
        variant && 'type' in variant && (variant as { type?: string }).type === 'composite'
      ),
      settingsPath,
      settings,
      cliproxyBridge,
      hookInstalled: hasImageAnalysisProfileHook(profileOrVariant, settingsPath),
      sharedHookInstalled: hasImageAnalyzerHook(),
    },
    getImageAnalysisConfig()
  );

  return {
    ...status,
    persistencePath: status.shouldPersistHook
      ? getImageAnalysisProfileSettingsPath(profileOrVariant, settingsPath)
      : null,
  };
}

async function resolvePreviewImageAnalysisStatus(profileOrVariant: string, settings: Settings) {
  const normalizedSettings = canonicalizeProfileSettings(profileOrVariant, settings);
  const settingsPath = resolveSettingsPath(profileOrVariant);

  return resolveImageAnalysisStatusForProfile(profileOrVariant, normalizedSettings, settingsPath);
}

function writeSettingsAtomically(settingsPath: string, settings: Settings): void {
  requireWritableSettingsPathWithinCcs(settingsPath);
  const tempPath = `${settingsPath}.tmp.${process.pid}`;
  requireWritableSettingsPathWithinCcs(tempPath);
  fs.writeFileSync(tempPath, JSON.stringify(settings, null, 2) + '\n', { flag: 'wx' });
  fs.renameSync(tempPath, settingsPath);
}

function withSettingsFileLock<T>(settingsPath: string, callback: () => T): T {
  requireWritableSettingsPathWithinCcs(settingsPath);
  const lockTarget = safeRealPath(settingsPath)
    ? settingsPath
    : findExistingParentRealPath(settingsPath);
  if (!lockTarget) {
    throw new Error('Invalid settings path');
  }
  let release: (() => void) | undefined;

  try {
    release = lockfile.lockSync(lockTarget, { stale: 10000 }) as () => void;
    return callback();
  } finally {
    if (release) {
      try {
        release();
      } catch {
        // Best-effort release
      }
    }
  }
}

function loadCanonicalProfileSettings(
  profileOrVariant: string,
  settingsPath: string,
  persist = false,
  strictPersist = false
): Settings {
  if (!requireExistingSettingsPathWithinCcs(settingsPath)) {
    throw new Error('Settings not found');
  }

  const loaded = loadSettings(settingsPath);
  const canonicalized = canonicalizeProfileSettings(profileOrVariant, loaded);

  if (persist && canonicalized !== loaded) {
    try {
      writeSettingsAtomically(settingsPath, canonicalized);
    } catch (error) {
      if (strictPersist) {
        throw error;
      }
      logRouteError(`Failed to persist canonicalized settings for ${profileOrVariant}`, error);
    }
  }

  return canonicalized;
}

/**
 * Helper: Mask API keys in settings
 */
function maskApiKeys(settings: Settings): Settings {
  if (!settings.env) return settings;

  const masked = { ...settings, env: { ...settings.env } };

  for (const key of Object.keys(masked.env)) {
    if (isSensitiveKey(key)) {
      masked.env[key] = maskSensitiveValue(masked.env[key]);
    }
  }

  return masked;
}

/**
 * GET /api/settings/:profile - Get settings with masked API keys
 */
router.get('/:profile', async (req: Request, res: Response): Promise<void> => {
  try {
    const { profile } = req.params;
    const settingsPath = resolveSettingsPath(profile);

    if (!requireExistingSettingsPathWithinCcs(settingsPath)) {
      res.status(404).json({ error: 'Settings not found' });
      return;
    }

    const settings = loadCanonicalProfileSettings(profile, settingsPath, true);
    const stat = fs.statSync(settingsPath);
    const masked = maskApiKeys(settings);

    res.json({
      profile,
      settings: masked,
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

/**
 * GET /api/settings/:profile/raw - Get full settings (for editing)
 */
router.get('/:profile/raw', async (req: Request, res: Response): Promise<void> => {
  if (!requireSensitiveLocalAccess(req, res)) return;

  try {
    const { profile } = req.params;
    const settingsPath = resolveSettingsPath(profile);

    if (!requireExistingSettingsPathWithinCcs(settingsPath)) {
      res.status(404).json({ error: 'Settings not found' });
      return;
    }

    const settings = loadCanonicalProfileSettings(profile, settingsPath, true);
    const stat = fs.statSync(settingsPath);

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

/**
 * POST /api/settings/:profile/image-analysis-status - Preview image analysis status from editor JSON
 */
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

/** Required env vars for CLIProxy providers to function */
const REQUIRED_ENV_KEYS = ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN'] as const;

/** Check if settings have required fields (returns missing list for warnings) */
function checkRequiredEnvVars(settings: Settings): string[] {
  const env = settings?.env || {};
  if (env.ANTHROPIC_API_KEY?.trim() && !env.ANTHROPIC_BASE_URL?.trim()) {
    return [];
  }
  return REQUIRED_ENV_KEYS.filter((key) => !env[key]?.trim());
}

/**
 * PUT /api/settings/:profile - Update settings with conflict detection and backup
 */
router.put('/:profile', (req: Request, res: Response): void => {
  if (!requireSensitiveLocalAccess(req, res)) return;

  try {
    const { profile } = req.params;
    const { settings, expectedMtime } = req.body;

    // Validate settings object exists
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
    // This handles cases where duplicate hooks were added by previous versions
    deduplicateCcsHooks(normalizedSettings as Record<string, unknown>);
    removeCcsImageAnalyzerHooks(normalizedSettings as Record<string, unknown>);

    const ccsDir = getCcsDir();

    // Check for missing required fields (warning, not blocking - runtime fills defaults)
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

      const tempPath = `${settingsPath}.tmp.${process.pid}`;
      requireWritableSettingsPathWithinCcs(tempPath);
      fs.writeFileSync(tempPath, newContent, { flag: 'wx' });
      fs.renameSync(tempPath, settingsPath);
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
      // Include warning if fields missing (runtime will use defaults)
      ...(missingFields.length > 0 && {
        warning: `Missing fields will use defaults: ${missingFields.join(', ')}`,
        missingFields,
      }),
    });
  } catch (error) {
    respondInternalError(res, error, 'Internal server error.');
  }
});

// ==================== Presets ====================

/**
 * GET /api/settings/:profile/presets - Get saved presets for a provider
 */
router.get('/:profile/presets', (req: Request, res: Response): void => {
  try {
    const { profile } = req.params;
    const settingsPath = resolveSettingsPath(profile);

    if (!requireExistingSettingsPathWithinCcs(settingsPath)) {
      res.json({ presets: [] });
      return;
    }

    const settings = loadCanonicalProfileSettings(profile, settingsPath, true);
    res.json({ presets: settings.presets || [] });
  } catch (error) {
    respondInternalError(res, error, 'Internal server error.');
  }
});

/**
 * POST /api/settings/:profile/presets - Create a new preset
 */
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

/**
 * DELETE /api/settings/:profile/presets/:name - Delete a preset
 */
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

// ==================== Auth Tokens ====================

/**
 * GET /api/settings/auth/antigravity-risk - Get shared power user bypass setting
 */
router.get('/auth/antigravity-risk', (req: Request, res: Response): void => {
  if (!requireSensitiveLocalAccess(req, res)) return;

  try {
    const config = loadOrCreateUnifiedConfig();
    res.json({
      antigravityAckBypass: config.cliproxy?.safety?.antigravity_ack_bypass === true,
    });
  } catch (error) {
    respondInternalError(res, error, 'Failed to load power user mode.');
  }
});

/**
 * PUT /api/settings/auth/antigravity-risk - Update shared power user bypass setting
 */
router.put('/auth/antigravity-risk', (req: Request, res: Response): void => {
  if (!requireSensitiveLocalAccess(req, res)) return;

  try {
    const body = req.body as { antigravityAckBypass?: unknown } | null | undefined;
    const antigravityAckBypass =
      body && typeof body === 'object' ? body.antigravityAckBypass : undefined;

    if (typeof antigravityAckBypass !== 'boolean') {
      res.status(400).json({ error: 'antigravityAckBypass must be a boolean' });
      return;
    }

    const updatedConfig = mutateConfig((config) => {
      config.cliproxy.safety = {
        ...(config.cliproxy.safety ?? {}),
        antigravity_ack_bypass: antigravityAckBypass,
      };
    });

    res.json({
      success: true,
      antigravityAckBypass: updatedConfig.cliproxy?.safety?.antigravity_ack_bypass === true,
    });
  } catch (error) {
    const classified = classifyConfigSaveFailure(error);
    respondInternalError(res, error, classified.message, classified.statusCode);
  }
});

/**
 * GET /api/settings/auth/tokens - Get current auth token status (masked)
 */
router.get('/auth/tokens', (_req: Request, res: Response): void => {
  if (!requireSensitiveLocalAccess(_req, res)) return;

  try {
    const summary = getAuthSummary();

    res.json({
      apiKey: {
        value: maskToken(summary.apiKey.value),
        isCustom: summary.apiKey.isCustom,
      },
      managementSecret: {
        value: maskToken(summary.managementSecret.value),
        isCustom: summary.managementSecret.isCustom,
      },
    });
  } catch (error) {
    respondInternalError(res, error, 'Internal server error.');
  }
});

/**
 * GET /api/settings/auth/tokens/raw - Get current auth tokens unmasked
 * NOTE: Sensitive endpoint - no caching, localhost only
 */
router.get('/auth/tokens/raw', (req: Request, res: Response): void => {
  if (!requireSensitiveLocalAccess(req, res)) return;

  try {
    // Prevent caching of sensitive data
    res.setHeader('Cache-Control', 'no-store');

    const summary = getAuthSummary();

    res.json({
      apiKey: {
        value: summary.apiKey.value,
        isCustom: summary.apiKey.isCustom,
      },
      managementSecret: {
        value: summary.managementSecret.value,
        isCustom: summary.managementSecret.isCustom,
      },
    });
  } catch (error) {
    respondInternalError(res, error, 'Failed to load raw auth tokens.');
  }
});

/**
 * PUT /api/settings/auth/tokens - Update auth tokens
 */
router.put('/auth/tokens', (req: Request, res: Response): void => {
  if (!requireSensitiveLocalAccess(req, res)) return;

  try {
    const { apiKey, managementSecret } = req.body;

    if (apiKey !== undefined) {
      setGlobalApiKey(apiKey || undefined);
    }

    if (managementSecret !== undefined) {
      setGlobalManagementSecret(managementSecret || undefined);
    }

    // Regenerate CLIProxy config to apply changes
    regenerateConfig();

    const summary = getAuthSummary();
    res.json({
      success: true,
      apiKey: {
        value: maskToken(summary.apiKey.value),
        isCustom: summary.apiKey.isCustom,
      },
      managementSecret: {
        value: maskToken(summary.managementSecret.value),
        isCustom: summary.managementSecret.isCustom,
      },
      message: 'Restart CLIProxy to apply changes',
    });
  } catch (error) {
    respondInternalError(res, error, 'Internal server error.');
  }
});

/**
 * POST /api/settings/auth/tokens/regenerate-secret - Generate new management secret
 */
router.post('/auth/tokens/regenerate-secret', (_req: Request, res: Response): void => {
  if (!requireSensitiveLocalAccess(_req, res)) return;

  try {
    const newSecret = generateSecureToken(32);
    setGlobalManagementSecret(newSecret);

    // Regenerate CLIProxy config to apply changes
    regenerateConfig();

    res.json({
      success: true,
      managementSecret: {
        value: maskToken(newSecret),
        isCustom: true,
      },
      message: 'Restart CLIProxy to apply changes',
    });
  } catch (error) {
    respondInternalError(res, error, 'Internal server error.');
  }
});

/**
 * POST /api/settings/auth/tokens/reset - Reset auth tokens to defaults
 */
router.post('/auth/tokens/reset', (_req: Request, res: Response): void => {
  if (!requireSensitiveLocalAccess(_req, res)) return;

  try {
    resetAuthToDefaults();

    // Regenerate CLIProxy config to apply changes
    regenerateConfig();

    const summary = getAuthSummary();
    res.json({
      success: true,
      apiKey: {
        value: maskToken(summary.apiKey.value),
        isCustom: summary.apiKey.isCustom,
      },
      managementSecret: {
        value: maskToken(summary.managementSecret.value),
        isCustom: summary.managementSecret.isCustom,
      },
      message: 'Tokens reset to defaults. Restart CLIProxy to apply.',
    });
  } catch (error) {
    respondInternalError(res, error, 'Internal server error.');
  }
});

export default router;
