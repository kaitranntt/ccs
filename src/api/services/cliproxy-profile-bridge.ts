import * as fs from 'fs';
import * as path from 'path';

import { buildProxyUrl, getProxyTarget } from '../../cliproxy/proxy/proxy-target-resolver';
import { buildCliproxyProviderPath } from '../../cliproxy/config/env-builder';
import { getEffectiveApiKey } from '../../cliproxy/auth/auth-token-manager';
import { getModelMappingFromConfig } from '../../cliproxy/config/base-config-loader';
import {
  CLIPROXY_PROVIDER_IDS,
  getProviderDescription,
  getProviderDisplayName,
  mapExternalProviderName,
} from '../../cliproxy/provider-capabilities';
import { extractProviderFromPathname } from '../../cliproxy/ai-providers/model-id-normalizer';

import type { TargetType } from '../../targets/target-adapter';
import type { Settings } from '../../types/config';
import type { CLIProxyProvider } from '../../cliproxy/types';
import type {
  CliproxyBridgeMetadata,
  CliproxyBridgeProviderInfo,
  ModelMapping,
  ResolvedCliproxyBridgeProfile,
} from './profile-types';
import {
  getCcsDir,
  isUnifiedMode,
  loadConfigSafe,
  loadOrCreateUnifiedConfig,
} from '../../config/config-loader-facade';

const DEFAULT_PROFILE_SUFFIX = '-api';

function normalizeBridgeUrl(value: string): string {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname === 'localhost' ? '127.0.0.1' : parsed.hostname;
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${parsed.protocol}//${hostname}:${parsed.port}${pathname}`;
  } catch {
    return value.trim().replace(/\/+$/, '');
  }
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

function hasConfiguredProfile(name: string): boolean {
  if (isUnifiedMode()) {
    const config = loadOrCreateUnifiedConfig();
    return name in config.profiles;
  }

  const config = loadConfigSafe();
  return name in config.profiles;
}

function hasSettingsFile(name: string): boolean {
  return fs.existsSync(path.join(getCcsDir(), `${name}.settings.json`));
}

export function getDefaultCliproxyBridgeName(provider: CLIProxyProvider): string {
  return `${provider}${DEFAULT_PROFILE_SUFFIX}`;
}

export function suggestCliproxyBridgeName(provider: CLIProxyProvider): string {
  const baseName = getDefaultCliproxyBridgeName(provider);
  if (!hasConfiguredProfile(baseName) && !hasSettingsFile(baseName)) {
    return baseName;
  }

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${baseName}-${index}`;
    if (!hasConfiguredProfile(candidate) && !hasSettingsFile(candidate)) {
      return candidate;
    }
  }

  return `${baseName}-${Date.now()}`;
}

function resolveBridgeModelMapping(provider: CLIProxyProvider): ModelMapping {
  // claude is model-neutral: model keys are absent from its base config so that
  // Claude Code's own /model selection is respected end-to-end.  Return empty
  // strings here; createSettingsFile skips writing empty model entries.
  if (provider === 'claude') {
    return { default: '', opus: '', sonnet: '', haiku: '' };
  }
  const mapping = getModelMappingFromConfig(provider);
  return {
    default: mapping.defaultModel,
    opus: mapping.opusModel || mapping.defaultModel,
    sonnet: mapping.sonnetModel || mapping.defaultModel,
    haiku: mapping.haikuModel || mapping.defaultModel,
  };
}

export function listCliproxyBridgeProviders(): CliproxyBridgeProviderInfo[] {
  return CLIPROXY_PROVIDER_IDS.map((provider) => {
    const providerPath = buildCliproxyProviderPath(provider);
    return {
      provider,
      displayName: getProviderDisplayName(provider),
      description: getProviderDescription(provider),
      defaultProfileName: getDefaultCliproxyBridgeName(provider),
      // claude uses root path (CLIProxyAPI registers /v1/messages at root);
      // all other providers use their scoped /api/provider/<x> route.
      routePath: providerPath === '' ? '/' : providerPath,
    };
  });
}

export function resolveCliproxyBridgeProfile(
  provider: CLIProxyProvider,
  options: {
    name?: string;
    target?: TargetType;
  } = {}
): ResolvedCliproxyBridgeProfile {
  const target = getProxyTarget();
  const profileName = options.name?.trim() || suggestCliproxyBridgeName(provider);
  // Use the shared path helper so the claude provider always resolves to the
  // CLIProxy root URL (same rule as buildLocalProviderBaseUrl in env-builder).
  const providerPath = buildCliproxyProviderPath(provider);
  const baseUrl = buildProxyUrl(target, providerPath);
  const apiKey = target.authToken ?? getEffectiveApiKey();
  // Expose the canonical route path: root for claude, scoped path for others.
  const routePath = providerPath === '' ? '/' : providerPath;

  return {
    name: profileName,
    provider,
    providerDisplayName: getProviderDisplayName(provider),
    baseUrl,
    apiKey,
    models: resolveBridgeModelMapping(provider),
    target: options.target || 'claude',
    routePath,
    source: target.isRemote ? 'remote' : 'local',
  };
}

export function resolveCliproxyBridgeMetadata(
  settings: Pick<Settings, 'env'> | null | undefined
): CliproxyBridgeMetadata | null {
  const provider = resolveProviderFromBaseUrl(settings?.env?.ANTHROPIC_BASE_URL);
  if (!provider) {
    return null;
  }

  const resolved = resolveCliproxyBridgeProfile(provider);
  const actualBaseUrl = settings?.env?.ANTHROPIC_BASE_URL?.trim() || '';
  const actualAuthToken = settings?.env?.ANTHROPIC_AUTH_TOKEN?.trim() || '';

  return {
    provider,
    providerDisplayName: resolved.providerDisplayName,
    routePath: resolved.routePath,
    currentBaseUrl: resolved.baseUrl,
    source: resolved.source,
    usesCurrentTarget: normalizeBridgeUrl(actualBaseUrl) === normalizeBridgeUrl(resolved.baseUrl),
    usesCurrentAuthToken: actualAuthToken.length > 0 && actualAuthToken === resolved.apiKey,
  };
}
