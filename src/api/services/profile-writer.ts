/**
 * API Profile Writer Service - Create/remove operations for API profiles.
 * Supports both unified YAML config and legacy JSON config.
 */
import * as fs from 'fs';
import * as path from 'path';
import { getConfigPath } from '../../utils/config-manager';
import { expandPath } from '../../utils/helpers';
import { validateApiName } from './validation-service';

import { ensureWebSearchMcpOrThrow } from '../../utils/websearch-manager';
import { ensureImageAnalysisMcpOrThrow } from '../../utils/image-analysis';
import type { TargetType } from '../../targets/target-adapter';
import { resolveDroidProvider } from '../../targets/droid-provider';
import { isReservedName } from '../../config/reserved-names';
import { mapExternalProviderName } from '../../cliproxy/provider-capabilities';
import {
  extractProviderFromPathname,
  getDeniedModelIdReasonForProvider,
} from '../../cliproxy/ai-providers/model-id-normalizer';
import type { CLIProxyProvider } from '../../cliproxy/types';
import type {
  ModelMapping,
  CreateApiProfileResult,
  CreateCliproxyBridgeProfileResult,
  RemoveApiProfileResult,
  UpdateApiProfileTargetResult,
} from './profile-types';
import { apiProfileExists } from './profile-reader';
import {
  resolveCliproxyBridgeMetadata,
  resolveCliproxyBridgeProfile,
} from './cliproxy-profile-bridge';
import {
  getCcsDir,
  isUnifiedMode,
  loadConfigSafe,
  mutateConfig,
} from '../../config/config-loader-facade';
import { ProfileError } from '../../errors/error-types';

/** Check if URL is an OpenRouter endpoint */
function isOpenRouterUrl(baseUrl: string): boolean {
  return baseUrl.toLowerCase().includes('openrouter.ai');
}

/** Detect Anthropic direct API profile (native auth, no proxy) */
function isAnthropicDirect(baseUrl: string, apiKey: string): boolean {
  return apiKey.startsWith('sk-ant-') || baseUrl.includes('api.anthropic.com');
}

function resolveProviderFromBaseUrl(baseUrl: string): CLIProxyProvider | null {
  if (baseUrl.trim().length === 0) {
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

function getDeniedModelReason(baseUrl: string, models: ModelMapping): string | null {
  const provider = resolveProviderFromBaseUrl(baseUrl);
  if (!provider) return null;

  for (const modelId of [models.default, models.opus, models.sonnet, models.haiku]) {
    if (modelId.trim().length === 0) continue;
    const deniedReason = getDeniedModelIdReasonForProvider(modelId, provider);
    if (deniedReason) return deniedReason;
  }

  return null;
}

function rollbackSettingsFile(
  filePath: string,
  previousContent: string | null,
  existedBefore: boolean
): void {
  if (existedBefore && previousContent !== null) {
    fs.writeFileSync(filePath, previousContent, 'utf8');
    return;
  }

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/** Create settings.json file for API profile (legacy format) */
function createSettingsFile(
  name: string,
  baseUrl: string,
  apiKey: string,
  models: ModelMapping,
  provider?: string,
  extraModels?: string[]
): string {
  const ccsDir = getCcsDir();
  const settingsPath = path.join(ccsDir, `${name}.settings.json`);
  const droidProvider = resolveDroidProvider({
    provider,
    baseUrl,
    model: models.default,
  });

  const isNative = isAnthropicDirect(baseUrl, apiKey);
  // Model-neutral providers (e.g. claude built-in) pass empty strings to signal
  // "omit this key".  Filter them out so the written settings file does not
  // contain ANTHROPIC_MODEL:'' which could be treated as an unintended override.
  const modelEnv = {
    ...(models.default.trim() ? { ANTHROPIC_MODEL: models.default } : {}),
    ...(models.opus.trim() ? { ANTHROPIC_DEFAULT_OPUS_MODEL: models.opus } : {}),
    ...(models.sonnet.trim() ? { ANTHROPIC_DEFAULT_SONNET_MODEL: models.sonnet } : {}),
    ...(models.haiku.trim() ? { ANTHROPIC_DEFAULT_HAIKU_MODEL: models.haiku } : {}),
  };
  const settings = {
    env: {
      // Native mode: ANTHROPIC_API_KEY only, no BASE_URL/AUTH_TOKEN
      // Proxy mode: ANTHROPIC_BASE_URL + AUTH_TOKEN (existing behavior)
      ...(isNative
        ? { ANTHROPIC_API_KEY: apiKey }
        : {
            ANTHROPIC_BASE_URL: baseUrl,
            ANTHROPIC_AUTH_TOKEN: apiKey,
            ...(isOpenRouterUrl(baseUrl) && { ANTHROPIC_API_KEY: '' }),
          }),
      ...modelEnv,
      ...(extraModels && extraModels.length > 0
        ? { ANTHROPIC_EXTRA_MODELS: extraModels.join(',') }
        : {}),
      CCS_DROID_PROVIDER: droidProvider,
    },
  };

  const settingsExisted = fs.existsSync(settingsPath);
  const previousSettingsContent = settingsExisted ? fs.readFileSync(settingsPath, 'utf8') : null;
  fs.mkdirSync(ccsDir, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');

  try {
    ensureWebSearchMcpOrThrow();
    ensureImageAnalysisMcpOrThrow();
  } catch (error) {
    rollbackSettingsFile(settingsPath, previousSettingsContent, settingsExisted);
    throw error;
  }

  return settingsPath;
}

/** Update config.json with new API profile (legacy format) */
function updateLegacyConfig(name: string, target: TargetType = 'claude'): void {
  const configPath = getConfigPath();
  const ccsDir = getCcsDir();

  let config: {
    profiles: Record<string, string>;
    cliproxy?: Record<string, unknown>;
    profile_targets?: Record<string, TargetType>;
  };
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    config = { profiles: {} };
  }

  const relativePath = `~/.ccs/${name}.settings.json`;
  config.profiles[name] = relativePath;
  config.profile_targets = config.profile_targets || {};
  if (target === 'claude') {
    delete config.profile_targets[name];
  } else {
    config.profile_targets[name] = target;
  }

  if (!fs.existsSync(ccsDir)) {
    fs.mkdirSync(ccsDir, { recursive: true });
  }

  // Write config atomically
  const tempPath = configPath + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  fs.renameSync(tempPath, configPath);
}

/** Create API profile in unified config */
function createApiProfileUnified(
  name: string,
  baseUrl: string,
  apiKey: string,
  models: ModelMapping,
  target: TargetType = 'claude',
  provider?: string,
  extraModels?: string[]
): void {
  const ccsDir = getCcsDir();
  const settingsFile = `${name}.settings.json`;
  const settingsPath = path.join(ccsDir, settingsFile);
  const droidProvider = resolveDroidProvider({
    provider,
    baseUrl,
    model: models.default,
  });

  const isNative = isAnthropicDirect(baseUrl, apiKey);
  // Model-neutral providers pass empty strings; omit those keys.
  const modelEnvUnified = {
    ...(models.default.trim() ? { ANTHROPIC_MODEL: models.default } : {}),
    ...(models.opus.trim() ? { ANTHROPIC_DEFAULT_OPUS_MODEL: models.opus } : {}),
    ...(models.sonnet.trim() ? { ANTHROPIC_DEFAULT_SONNET_MODEL: models.sonnet } : {}),
    ...(models.haiku.trim() ? { ANTHROPIC_DEFAULT_HAIKU_MODEL: models.haiku } : {}),
  };
  const settings = {
    env: {
      ...(isNative
        ? { ANTHROPIC_API_KEY: apiKey }
        : {
            ANTHROPIC_BASE_URL: baseUrl,
            ANTHROPIC_AUTH_TOKEN: apiKey,
            ...(isOpenRouterUrl(baseUrl) && { ANTHROPIC_API_KEY: '' }),
          }),
      ...modelEnvUnified,
      ...(extraModels && extraModels.length > 0
        ? { ANTHROPIC_EXTRA_MODELS: extraModels.join(',') }
        : {}),
      CCS_DROID_PROVIDER: droidProvider,
    },
  };

  if (!fs.existsSync(ccsDir)) {
    fs.mkdirSync(ccsDir, { recursive: true });
  }

  const settingsExisted = fs.existsSync(settingsPath);
  const previousSettingsContent = settingsExisted ? fs.readFileSync(settingsPath, 'utf8') : null;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');

  try {
    ensureWebSearchMcpOrThrow();
    ensureImageAnalysisMcpOrThrow();
  } catch (error) {
    rollbackSettingsFile(settingsPath, previousSettingsContent, settingsExisted);
    throw error;
  }

  mutateConfig((config) => {
    config.profiles[name] = {
      type: 'api',
      settings: `~/.ccs/${settingsFile}`,
      ...(target !== 'claude' && { target }),
    };
  });
}

/** Create a new API profile */
export function createApiProfile(
  name: string,
  baseUrl: string,
  apiKey: string,
  models: ModelMapping,
  target: TargetType = 'claude',
  provider?: string,
  extraModels?: string[]
): CreateApiProfileResult {
  try {
    const deniedReason = getDeniedModelReason(baseUrl, models);
    if (deniedReason) {
      return { success: false, settingsFile: '', error: deniedReason };
    }

    const settingsFile = `~/.ccs/${name}.settings.json`;

    if (isUnifiedMode()) {
      createApiProfileUnified(name, baseUrl, apiKey, models, target, provider, extraModels);
    } else {
      createSettingsFile(name, baseUrl, apiKey, models, provider, extraModels);
      updateLegacyConfig(name, target);
    }

    return { success: true, settingsFile };
  } catch (error) {
    return {
      success: false,
      settingsFile: '',
      error: (error as Error).message,
    };
  }
}

export function createCliproxyBridgeProfile(
  provider: CLIProxyProvider,
  options: {
    name?: string;
    force?: boolean;
    target?: TargetType;
  } = {}
): CreateCliproxyBridgeProfileResult {
  const providedName = options.name?.trim();
  if (providedName) {
    const nameError = validateApiName(providedName);
    if (nameError) {
      return { success: false, settingsFile: '', error: nameError };
    }
    if (isReservedName(providedName)) {
      return {
        success: false,
        settingsFile: '',
        error: `Profile name '${providedName}' is reserved`,
      };
    }
  }

  const resolved = resolveCliproxyBridgeProfile(provider, options);
  const settingsPath = path.join(getCcsDir(), `${resolved.name}.settings.json`);
  if (!options.force && (apiProfileExists(resolved.name) || fs.existsSync(settingsPath))) {
    return {
      success: false,
      settingsFile: '',
      error: `Profile already exists: ${resolved.name}`,
    };
  }

  const result = createApiProfile(
    resolved.name,
    resolved.baseUrl,
    resolved.apiKey,
    resolved.models,
    resolved.target,
    provider
  );
  const detectedBridge = resolveCliproxyBridgeMetadata({
    env: {
      ANTHROPIC_BASE_URL: resolved.baseUrl,
      ANTHROPIC_AUTH_TOKEN: resolved.apiKey,
    },
  });

  return {
    ...result,
    name: resolved.name,
    provider,
    target: resolved.target,
    cliproxyBridge: detectedBridge ?? {
      provider,
      providerDisplayName: resolved.providerDisplayName,
      routePath: resolved.routePath,
      currentBaseUrl: resolved.baseUrl,
      source: resolved.source,
      usesCurrentTarget: true,
      usesCurrentAuthToken: true,
    },
  };
}

/**
 * Update API profile target (claude/droid).
 * Persists to config.yaml in unified mode and config.json profile_targets in legacy mode.
 */
export function updateApiProfileTarget(
  name: string,
  target: TargetType
): UpdateApiProfileTargetResult {
  try {
    if (isUnifiedMode()) {
      mutateConfig((config) => {
        if (!config.profiles[name]) {
          throw new ProfileError(`API profile not found: ${name}`, name);
        }

        if (target === 'claude') {
          delete config.profiles[name].target;
        } else {
          config.profiles[name].target = target;
        }
      });
      return { success: true, target };
    }

    const configPath = getConfigPath();
    let config: {
      profiles: Record<string, string>;
      cliproxy?: Record<string, unknown>;
      profile_targets?: Record<string, TargetType>;
    };
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
      config = { profiles: {} };
    }

    if (!config.profiles[name]) {
      return { success: false, error: `API profile not found: ${name}` };
    }

    config.profile_targets = config.profile_targets || {};
    if (target === 'claude') {
      delete config.profile_targets[name];
    } else {
      config.profile_targets[name] = target;
    }

    const tempPath = configPath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    fs.renameSync(tempPath, configPath);

    return { success: true, target };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/** Remove API profile from unified config */
function removeApiProfileUnified(name: string): void {
  mutateConfig((config) => {
    const profile = config.profiles[name];

    if (!profile) {
      throw new ProfileError(`API profile not found: ${name}`, name);
    }

    if (profile.settings) {
      const settingsPath = expandPath(profile.settings);
      if (fs.existsSync(settingsPath)) {
        fs.unlinkSync(settingsPath);
      }
    }

    delete config.profiles[name];

    if (config.default === name) {
      config.default = undefined;
    }
  });
}

/** Remove API profile from legacy config */
function removeApiProfileLegacy(name: string): void {
  const config = loadConfigSafe();
  delete config.profiles[name];
  if (config.profile_targets) {
    delete config.profile_targets[name];
    if (Object.keys(config.profile_targets).length === 0) {
      delete config.profile_targets;
    }
  }

  const configPath = getConfigPath();
  const tempPath = configPath + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  fs.renameSync(tempPath, configPath);

  // Remove settings file if it exists
  const expandedPath = path.join(getCcsDir(), `${name}.settings.json`);
  if (fs.existsSync(expandedPath)) {
    fs.unlinkSync(expandedPath);
  }
}

/** Remove an API profile */
export function removeApiProfile(name: string): RemoveApiProfileResult {
  try {
    if (isUnifiedMode()) {
      removeApiProfileUnified(name);
    } else {
      removeApiProfileLegacy(name);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}
