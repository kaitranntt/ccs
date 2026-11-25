/**
 * Profile settings canonicalization, model denylist checks, masking, and image-analysis status.
 */

import * as fs from 'fs';
import { isSensitiveKey, maskSensitiveValue } from '../../utils/sensitive-keys';
import { listVariants } from '../../cliproxy/services/variant-service';
import { resolveCliproxyBridgeMetadata } from '../../api/services';
import type { Settings } from '../../types/config';
import {
  canonicalizeModelIdForProvider,
  getDeniedModelIdReasonForProvider,
} from '../../cliproxy/ai-providers/model-id-normalizer';
import { createRouteErrorHelpers } from './route-helpers';
import {
  getImageAnalysisProfileSettingsPath,
  hasImageAnalysisProfileHook,
} from '../../utils/hooks/image-analyzer-profile-hook-injector';
import { hasImageAnalyzerHook } from '../../utils/hooks/image-analyzer-hook-installer';
import { resolveImageAnalysisRuntimeStatus } from '../../utils/hooks';
import { ConfigError } from '../../errors/error-types';
import { getImageAnalysisConfig, loadSettings } from '../../config/config-loader-facade';
import {
  requireExistingSettingsPathWithinCcs,
  resolveProviderForProfile,
  resolveProviderForSettings,
  resolveSettingsPath,
  withSettingsFileLock,
  writeSettingsAtomically,
} from './settings-path-resolver';

const MODEL_ENV_KEYS = [
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_FABLE_MODEL',
] as const;
const PRESET_MODEL_KEYS = ['default', 'opus', 'sonnet', 'haiku'] as const;
const REQUIRED_ENV_KEYS = ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN'] as const;

const { logRouteError } = createRouteErrorHelpers('settings-routes');

export function canonicalizeProfileModelId(
  profileOrVariant: string,
  modelId: string,
  settings?: Settings
): string {
  const provider = resolveProviderForSettings(profileOrVariant, settings);
  if (!provider) return modelId;
  return canonicalizeModelIdForProvider(modelId, provider);
}

export function findDeniedProfileModel(
  profileOrVariant: string,
  modelId: string,
  settings?: Settings
): string | null {
  const provider = resolveProviderForSettings(profileOrVariant, settings);
  if (!provider) return null;
  return getDeniedModelIdReasonForProvider(modelId, provider);
}

export function validateProfileSettingsModelDenylist(
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

export function canonicalizeProfileSettings(
  profileOrVariant: string,
  settings: Settings
): Settings {
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

export async function resolveImageAnalysisStatusForProfile(
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

export async function resolvePreviewImageAnalysisStatus(
  profileOrVariant: string,
  settings: Settings
) {
  const normalizedSettings = canonicalizeProfileSettings(profileOrVariant, settings);
  const settingsPath = resolveSettingsPath(profileOrVariant);

  return resolveImageAnalysisStatusForProfile(profileOrVariant, normalizedSettings, settingsPath);
}

export function loadCanonicalProfileSettings(
  profileOrVariant: string,
  settingsPath: string,
  persist = false,
  strictPersist = false
): Settings {
  if (!requireExistingSettingsPathWithinCcs(settingsPath)) {
    throw new ConfigError('Settings not found', settingsPath);
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

export function loadCanonicalProfileSettingsWithStat(
  profile: string,
  settingsPath: string
): { settings: Settings; stat: fs.Stats } {
  return withSettingsFileLock(settingsPath, () => {
    const loaded = loadCanonicalProfileSettings(profile, settingsPath, true);
    return { settings: loaded, stat: fs.statSync(settingsPath) };
  });
}

/** Mask API keys in settings. */
export function maskApiKeys(settings: Settings): Settings {
  if (!settings.env) return settings;

  const masked = { ...settings, env: { ...settings.env } };

  for (const key of Object.keys(masked.env)) {
    if (isSensitiveKey(key)) {
      masked.env[key] = maskSensitiveValue(masked.env[key]);
    }
  }

  return masked;
}

/** Check if settings have required fields (returns missing list for warnings). */
export function checkRequiredEnvVars(settings: Settings): string[] {
  const env = settings?.env || {};
  if (env.ANTHROPIC_API_KEY?.trim() && !env.ANTHROPIC_BASE_URL?.trim()) {
    return [];
  }
  return REQUIRED_ENV_KEYS.filter((key) => !env[key]?.trim());
}
