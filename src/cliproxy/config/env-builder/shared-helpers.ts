/**
 * Shared Env Builder Helpers & Provider Default Env Builders
 */

import type { CLIProxyProvider, ProviderModelMapping } from '../../types';
import { getModelMappingFromConfig, getEnvVarsFromConfig } from '../base-config-loader';
import { getEffectiveApiKey } from '../../auth/auth-token-manager';
import {
  validatePort,
  validateRemotePort,
  getRemoteDefaultPort,
  normalizeProtocol,
  CLIPROXY_DEFAULT_PORT,
} from '../port-manager';
import { normalizeModelEnvVarsForProvider } from '../../ai-providers/model-id-normalizer';
import { getGlobalEnvConfig, getOutputLimitsEnv } from '../../../config/config-loader-facade';
import { buildCliproxyProviderPath, buildLocalProviderBaseUrl } from '../provider-route';
import { findModel } from '../../model-catalog';
import { hasExtendedContextSuffix } from '../../../shared/extended-context-utils';

/** Settings file structure for user overrides */
export interface ProviderSettings {
  env: NodeJS.ProcessEnv;
  presets?: Array<Record<string, unknown>>;
}

/** Remote proxy configuration for URL rewriting */
export interface RemoteProxyRewriteConfig {
  host: string;
  port?: number;
  protocol: 'http' | 'https';
  authToken?: string;
}

/** Remote config for composite variant (passed from env-resolver) */
export interface CompositeRemoteConfig {
  host: string;
  port: number;
  protocol: 'http' | 'https';
  authToken?: string;
}

export const PRESET_MODEL_KEYS = ['default', 'opus', 'sonnet', 'haiku'] as const;
export const REQUIRED_PROVIDER_ENV_KEYS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
] as const;

export const REQUIRED_CLAUDE_ENV_KEYS = ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN'] as const;
export const CURSOR_LEGACY_ENV_OVERRIDE_KEYS = new Set([
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
]);

const CLAUDE_AUTO_COMPACT_WINDOW_ENV = 'CLAUDE_CODE_AUTO_COMPACT_WINDOW';
const LOCALHOST_NAMES = new Set(['127.0.0.1', 'localhost', '0.0.0.0']);

export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Add Claude Code's auto-compact window for a known effective model.
 * Existing env keys win by presence, including an explicit empty value.
 */
export function applyClaudeAutoCompactWindow(
  envVars: NodeJS.ProcessEnv,
  provider: CLIProxyProvider
): NodeJS.ProcessEnv {
  if (Object.prototype.hasOwnProperty.call(envVars, CLAUDE_AUTO_COMPACT_WINDOW_ENV)) {
    return envVars;
  }

  const modelId = envVars.ANTHROPIC_MODEL;
  if (typeof modelId !== 'string' || modelId.trim().length === 0) return envVars;

  const model = findModel(provider, modelId);
  if (!model) return envVars;

  let contextWindow = model.contextWindow;
  if (model.extendedContext && !hasExtendedContextSuffix(modelId)) {
    contextWindow = 200_000;
  }

  if (typeof contextWindow !== 'number' || !Number.isInteger(contextWindow) || contextWindow <= 0) {
    return envVars;
  }

  return {
    ...envVars,
    [CLAUDE_AUTO_COMPACT_WINDOW_ENV]: String(contextWindow),
  };
}

export function getModelMapping(provider: CLIProxyProvider): ProviderModelMapping {
  return getModelMappingFromConfig(provider);
}

export function getClaudeEnvVars(
  provider: CLIProxyProvider,
  port: number = CLIPROXY_DEFAULT_PORT
): NodeJS.ProcessEnv {
  const baseEnvVars = getEnvVarsFromConfig(provider);

  const {
    ANTHROPIC_BASE_URL: _baseUrl,
    ANTHROPIC_AUTH_TOKEN: _authToken,
    ANTHROPIC_MODEL: _model,
    ANTHROPIC_DEFAULT_OPUS_MODEL: _opusModel,
    ANTHROPIC_DEFAULT_SONNET_MODEL: _sonnetModel,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: _haikuModel,
    ...additionalEnvVars
  } = baseEnvVars;

  const coreEnvVars: NodeJS.ProcessEnv = {
    ANTHROPIC_BASE_URL: buildLocalProviderBaseUrl(provider, port),
    ANTHROPIC_AUTH_TOKEN: getEffectiveApiKey(),
  };

  if (provider !== 'claude') {
    const models = getModelMapping(provider);
    coreEnvVars.ANTHROPIC_MODEL = models.claudeModel;
    coreEnvVars.ANTHROPIC_DEFAULT_OPUS_MODEL = models.opusModel || models.claudeModel;
    coreEnvVars.ANTHROPIC_DEFAULT_SONNET_MODEL = models.sonnetModel || models.claudeModel;
    coreEnvVars.ANTHROPIC_DEFAULT_HAIKU_MODEL = models.haikuModel || models.claudeModel;
  }

  const mergedEnv = {
    ...coreEnvVars,
    ...additionalEnvVars,
  };

  return normalizeModelEnvVarsForProvider(mergedEnv, provider);
}

export function getGlobalEnvVars(): Record<string, string> {
  const outputLimitsEnv = getOutputLimitsEnv();
  const globalEnvConfig = getGlobalEnvConfig();
  if (!globalEnvConfig.enabled) {
    return { ...outputLimitsEnv };
  }
  return { ...globalEnvConfig.env, ...outputLimitsEnv };
}

export function normalizeLocalProviderBaseUrl(
  baseUrl: string,
  provider: CLIProxyProvider,
  port: number
): string {
  try {
    const parsed = new URL(baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return baseUrl;
    if (!LOCALHOST_NAMES.has(parsed.hostname.toLowerCase())) return baseUrl;

    const effectivePort = parsed.port
      ? Number.parseInt(parsed.port, 10)
      : parsed.protocol === 'https:'
        ? 443
        : 80;
    if (!Number.isFinite(effectivePort) || effectivePort !== port) return baseUrl;

    const expectedPath = buildCliproxyProviderPath(provider);
    if (expectedPath === '') {
      return parsed.origin;
    }

    if (parsed.pathname === expectedPath && !parsed.search && !parsed.hash) return baseUrl;

    parsed.pathname = expectedPath;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return baseUrl;
  }
}

export function ensureRequiredEnvVars(
  envVars: NodeJS.ProcessEnv,
  provider: CLIProxyProvider,
  port: number
): NodeJS.ProcessEnv {
  const validPort = validatePort(port);
  const result = { ...envVars };
  const defaults = getClaudeEnvVars(provider, validPort);

  if (!result.ANTHROPIC_BASE_URL?.trim()) {
    result.ANTHROPIC_BASE_URL = defaults.ANTHROPIC_BASE_URL;
  }
  if (!result.ANTHROPIC_AUTH_TOKEN?.trim()) {
    result.ANTHROPIC_AUTH_TOKEN = defaults.ANTHROPIC_AUTH_TOKEN;
  }

  if (result.ANTHROPIC_BASE_URL?.trim()) {
    result.ANTHROPIC_BASE_URL = normalizeLocalProviderBaseUrl(
      result.ANTHROPIC_BASE_URL,
      provider,
      validPort
    );
  }

  return normalizeModelEnvVarsForProvider(result, provider);
}

export function buildRemoteRootUrl(remoteConfig: {
  host: string;
  port?: number;
  protocol: 'http' | 'https';
}): string {
  const normalizedProtocol = normalizeProtocol(remoteConfig.protocol);
  const validatedPort = validateRemotePort(remoteConfig.port);
  const effectivePort = validatedPort ?? getRemoteDefaultPort(normalizedProtocol);
  const standardWebPort = normalizedProtocol === 'https' ? 443 : 80;
  const portSuffix = effectivePort === standardWebPort ? '' : `:${effectivePort}`;
  return `${normalizedProtocol}://${remoteConfig.host}${portSuffix}`;
}

export function rewriteLocalhostUrls(
  envVars: NodeJS.ProcessEnv,
  remoteConfig: RemoteProxyRewriteConfig
): NodeJS.ProcessEnv {
  const result = { ...envVars };
  const baseUrl = result.ANTHROPIC_BASE_URL;

  if (!baseUrl) return result;

  const localhostPattern = /^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0)(:\d+)?/i;
  if (!localhostPattern.test(baseUrl)) return result;

  result.ANTHROPIC_BASE_URL = buildRemoteRootUrl(remoteConfig);

  if (remoteConfig.authToken) {
    result.ANTHROPIC_AUTH_TOKEN = remoteConfig.authToken;
  }

  return result;
}
