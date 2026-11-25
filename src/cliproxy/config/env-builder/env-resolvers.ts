/**
 * Provider, Remote, and Composite Environment Variable Resolvers
 */

import * as fs from 'fs';
import type { CLIProxyProvider } from '../../types';
import { getEnvVarsFromConfig } from '../base-config-loader';
import { getEffectiveApiKey } from '../../auth/auth-token-manager';
import { expandPath } from '../../../utils/helpers';
import { warn } from '../../../utils/ui';
import type { CompositeTierConfig } from '../../../config/unified-config-types';
import { validatePort, CLIPROXY_DEFAULT_PORT } from '../port-manager';
import {
  normalizeModelEnvVarsForProvider,
  normalizeModelIdForProvider,
} from '../../ai-providers/model-id-normalizer';
import { ConfigError } from '../../../errors/error-types';
import {
  buildRemoteRootUrl,
  type CompositeRemoteConfig,
  ensureRequiredEnvVars,
  getClaudeEnvVars,
  getGlobalEnvVars,
  getModelMapping,
  type ProviderSettings,
  type RemoteProxyRewriteConfig,
  rewriteLocalhostUrls,
} from './shared-helpers';
import {
  claudeModelMigrationDone,
  filterClaudeStaleModelPins,
  migrateDeprecatedModelNames,
  migrateIFlowPlaceholderModel,
  resolveProviderSettingsPath,
} from './settings-migration';

function loadMigratedSettingsEnv(
  settingsPath: string,
  provider: CLIProxyProvider
): NodeJS.ProcessEnv | null {
  const content = fs.readFileSync(settingsPath, 'utf-8');
  const settings: ProviderSettings = JSON.parse(content);
  if (!settings.env || typeof settings.env !== 'object') {
    return null;
  }
  migrateDeprecatedModelNames(settingsPath, provider, settings);
  migrateIFlowPlaceholderModel(settingsPath, provider, settings);
  return settings.env;
}

export function getEffectiveEnvVars(
  provider: CLIProxyProvider,
  port: number = CLIPROXY_DEFAULT_PORT,
  customSettingsPath?: string,
  remoteRewriteConfig?: RemoteProxyRewriteConfig
): NodeJS.ProcessEnv {
  const globalEnv = getGlobalEnvVars();

  if (customSettingsPath) {
    const expandedPath = expandPath(customSettingsPath);
    if (fs.existsSync(expandedPath)) {
      try {
        const loadedEnv = loadMigratedSettingsEnv(expandedPath, provider);
        if (loadedEnv) {
          let envVars = ensureRequiredEnvVars({ ...globalEnv, ...loadedEnv }, provider, port);
          if (remoteRewriteConfig) {
            envVars = rewriteLocalhostUrls(envVars, remoteRewriteConfig);
          }
          return envVars;
        }
      } catch {
        console.warn(warn(`Invalid settings file: ${customSettingsPath}`));
      }
    } else {
      console.warn(warn(`Settings file not found: ${customSettingsPath}`));
    }
  }

  const settingsPath = resolveProviderSettingsPath(provider);
  if (fs.existsSync(settingsPath)) {
    try {
      const loadedEnv = loadMigratedSettingsEnv(settingsPath, provider);
      if (loadedEnv) {
        let envVars = ensureRequiredEnvVars({ ...globalEnv, ...loadedEnv }, provider, port);
        if (remoteRewriteConfig) {
          envVars = rewriteLocalhostUrls(envVars, remoteRewriteConfig);
        }
        return envVars;
      }
    } catch {
      // Invalid JSON or structure - fall through to defaults
    }
  }

  return { ...globalEnv, ...getClaudeEnvVars(provider, port) };
}

export function getRemoteEnvVars(
  provider: CLIProxyProvider,
  remoteConfig: { host: string; port?: number; protocol: 'http' | 'https'; authToken?: string },
  customSettingsPath?: string
): Record<string, string> {
  const baseUrl = buildRemoteRootUrl(remoteConfig);
  const globalEnv = getGlobalEnvVars();
  let userEnvVars: Record<string, string> = {};

  if (customSettingsPath) {
    const expandedPath = expandPath(customSettingsPath);
    if (fs.existsSync(expandedPath)) {
      try {
        const loadedEnv = loadMigratedSettingsEnv(expandedPath, provider);
        if (loadedEnv) {
          userEnvVars = loadedEnv as Record<string, string>;
        }
      } catch {
        console.warn(warn(`Invalid settings file: ${customSettingsPath}`));
      }
    }
  }

  if (Object.keys(userEnvVars).length === 0) {
    const settingsPath = resolveProviderSettingsPath(provider);
    if (fs.existsSync(settingsPath)) {
      try {
        const loadedEnv = loadMigratedSettingsEnv(settingsPath, provider);
        if (loadedEnv) {
          userEnvVars = loadedEnv as Record<string, string>;
          if (provider === 'claude' && !claudeModelMigrationDone()) {
            userEnvVars = filterClaudeStaleModelPins(userEnvVars);
          }
        }
      } catch {
        // Invalid JSON - fall through to base config
      }
    }
  }

  if (Object.keys(userEnvVars).length === 0) {
    const baseEnvVars = getEnvVarsFromConfig(provider);
    const {
      ANTHROPIC_BASE_URL: _baseUrl,
      ANTHROPIC_AUTH_TOKEN: _authToken,
      ...additionalEnvVars
    } = baseEnvVars;
    if (provider === 'claude') {
      userEnvVars = Object.fromEntries(
        Object.entries(additionalEnvVars).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string'
        )
      );
    } else {
      const models = getModelMapping(provider);
      userEnvVars = {
        ...additionalEnvVars,
        ANTHROPIC_MODEL: models.claudeModel,
        ANTHROPIC_DEFAULT_OPUS_MODEL: models.opusModel || models.claudeModel,
        ANTHROPIC_DEFAULT_SONNET_MODEL: models.sonnetModel || models.claudeModel,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: models.haikuModel || models.claudeModel,
      };
    }
  }

  const env: Record<string, string> = {
    ...globalEnv,
    ...userEnvVars,
    ANTHROPIC_BASE_URL: baseUrl,
    ANTHROPIC_AUTH_TOKEN: remoteConfig.authToken || getEffectiveApiKey(),
  };

  return normalizeModelEnvVarsForProvider(env, provider) as Record<string, string>;
}

export function getCompositeEnvVars(
  tiers: { opus: CompositeTierConfig; sonnet: CompositeTierConfig; haiku: CompositeTierConfig },
  defaultTier: 'opus' | 'sonnet' | 'haiku',
  port: number = CLIPROXY_DEFAULT_PORT,
  customSettingsPath?: string,
  remoteConfig?: CompositeRemoteConfig
): Record<string, string> {
  const globalEnv = getGlobalEnvVars();

  let additionalEnvVars: Record<string, string> = {};
  if (customSettingsPath) {
    const expandedPath = expandPath(customSettingsPath);
    if (fs.existsSync(expandedPath)) {
      try {
        const content = fs.readFileSync(expandedPath, 'utf-8');
        const settings: ProviderSettings = JSON.parse(content);
        if (settings.env && typeof settings.env === 'object') {
          const {
            ANTHROPIC_BASE_URL: _baseUrl,
            ANTHROPIC_AUTH_TOKEN: _authToken,
            ANTHROPIC_MODEL: _model,
            ANTHROPIC_DEFAULT_OPUS_MODEL: _opus,
            ANTHROPIC_DEFAULT_SONNET_MODEL: _sonnet,
            ANTHROPIC_DEFAULT_HAIKU_MODEL: _haiku,
            ...extra
          } = settings.env as Record<string, string>;
          additionalEnvVars = extra;
        }
      } catch {
        // Invalid JSON — ignore
      }
    }
  }

  const validPort = validatePort(port);

  const opusModel = tiers.opus?.model
    ? normalizeModelIdForProvider(tiers.opus.model, tiers.opus.provider)
    : undefined;
  const sonnetModel = tiers.sonnet?.model
    ? normalizeModelIdForProvider(tiers.sonnet.model, tiers.sonnet.provider)
    : undefined;
  const haikuModel = tiers.haiku?.model
    ? normalizeModelIdForProvider(tiers.haiku.model, tiers.haiku.provider)
    : undefined;
  const defaultTierModel = tiers[defaultTier];
  const defaultModel = defaultTierModel?.model
    ? normalizeModelIdForProvider(defaultTierModel.model, defaultTierModel.provider)
    : undefined;

  if (!defaultModel) {
    throw new ConfigError(`Missing model for default tier '${defaultTier}'`);
  }

  const baseUrl = remoteConfig ? buildRemoteRootUrl(remoteConfig) : `http://127.0.0.1:${validPort}`;

  const authToken = remoteConfig?.authToken ?? getEffectiveApiKey();

  const env: Record<string, string> = {
    ...globalEnv,
    ...additionalEnvVars,
    ANTHROPIC_BASE_URL: baseUrl,
    ANTHROPIC_AUTH_TOKEN: authToken,
    ANTHROPIC_MODEL: defaultModel,
  };

  if (opusModel) env.ANTHROPIC_DEFAULT_OPUS_MODEL = opusModel;
  if (sonnetModel) env.ANTHROPIC_DEFAULT_SONNET_MODEL = sonnetModel;
  if (haikuModel) env.ANTHROPIC_DEFAULT_HAIKU_MODEL = haikuModel;

  return env;
}
