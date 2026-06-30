/**
 * WebSearch Status and Readiness
 *
 * Provides status checking and display functions for WebSearch.
 *
 * @module utils/websearch/status
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { ok, warn, fail, info } from '../ui';

import { getCcsDir } from '../config-manager';
import { getAgyCliStatus } from './agy';
import { getGeminiCliStatus, isGeminiAuthenticated } from './gemini-cli';
import { getGrokCliStatus } from './grok-cli';
import { getOpenCodeCliStatus } from './opencode-cli';
import { getWebSearchApiKeyStates } from './provider-secrets';
import { normalizeSearxngBaseUrl, type WebSearchCliInfo, type WebSearchStatus } from './types';
import { getWebSearchConfig } from '../../config/config-loader-facade';

const PROVIDER_STATE_FILE = 'websearch-provider-state.json';

type ProviderCooldown = {
  reason: string;
  until: number;
};

function hasEnvValue(name: string): boolean {
  return (process.env[name] || '').trim().length > 0;
}

function hasValidSearxngUrl(url: string | undefined): boolean {
  const normalized = normalizeSearxngBaseUrl(url);
  return normalized !== null && normalized !== '';
}

function getProviderStatePath(): string {
  return join(getCcsDir(), 'cache', PROVIDER_STATE_FILE);
}

function readProviderCooldowns(now = Date.now()): Record<string, ProviderCooldown> {
  try {
    const statePath = getProviderStatePath();
    if (!existsSync(statePath)) {
      return {};
    }

    const parsed = JSON.parse(readFileSync(statePath, 'utf8')) as {
      cooldowns?: Record<string, { reason?: unknown; until?: unknown }>;
    };
    const nextCooldowns: Record<string, ProviderCooldown> = {};

    for (const [providerId, entry] of Object.entries(parsed.cooldowns || {})) {
      const until = Number.parseInt(String(entry?.until || ''), 10);
      if (!Number.isFinite(until) || until <= now) {
        continue;
      }

      nextCooldowns[providerId] = {
        reason: typeof entry?.reason === 'string' ? entry.reason : 'rate_limited',
        until,
      };
    }

    return nextCooldowns;
  } catch {
    return {};
  }
}

function formatCooldownDuration(until: number, now = Date.now()): string {
  const remainingSec = Math.max(1, Math.ceil((until - now) / 1000));
  if (remainingSec >= 3600) {
    return `~${Math.ceil(remainingSec / 3600)}h`;
  }
  if (remainingSec >= 60) {
    return `~${Math.ceil(remainingSec / 60)}m`;
  }
  return `~${remainingSec}s`;
}

function formatCooldownReason(reason: string): string {
  switch (reason) {
    case 'quota_exhausted':
      return 'quota exhaustion';
    case 'rate_limited':
      return 'rate limiting';
    default:
      return 'a temporary provider error';
  }
}

function applyCooldownStatus(
  provider: WebSearchCliInfo,
  cooldowns: Record<string, ProviderCooldown>,
  now = Date.now()
): WebSearchCliInfo {
  if (!(provider.enabled && provider.available)) {
    return provider;
  }

  const cooldown = cooldowns[provider.id];
  if (!cooldown) {
    return provider;
  }

  return {
    ...provider,
    available: false,
    detail: `Cooling down ${formatCooldownDuration(cooldown.until, now)} after ${formatCooldownReason(cooldown.reason)}`,
  };
}

function getLegacyProviderStatuses(): WebSearchCliInfo[] {
  const wsConfig = getWebSearchConfig();
  const agyStatus = getAgyCliStatus();
  const geminiStatus = getGeminiCliStatus();
  const grokStatus = getGrokCliStatus();
  const opencodeStatus = getOpenCodeCliStatus();
  const geminiAuthed = geminiStatus.installed && isGeminiAuthenticated();

  return [
    {
      id: 'agy',
      kind: 'legacy-cli',
      name: 'Antigravity CLI',
      command: 'agy',
      enabled: wsConfig.providers?.agy?.enabled ?? false,
      available: agyStatus.installed,
      version: agyStatus.version ?? null,
      installCommand: 'curl -fsSL https://antigravity.google/cli/install.sh | bash',
      docsUrl: 'https://antigravity.google/cli',
      requiresApiKey: false,
      description: 'Recommended LLM CLI fallback with Google web search (Gemini CLI successor).',
      detail: agyStatus.installed
        ? agyStatus.version
          ? `Installed (${agyStatus.version})`
          : 'Installed'
        : 'Not installed',
    },
    {
      id: 'gemini',
      kind: 'legacy-cli',
      name: 'Gemini CLI',
      command: 'gemini',
      enabled: wsConfig.providers?.gemini?.enabled ?? false,
      available: geminiAuthed,
      version: geminiStatus.version ?? null,
      installCommand: 'curl -fsSL https://antigravity.google/cli/install.sh | bash',
      docsUrl: 'https://antigravity.google/cli',
      requiresApiKey: false,
      description:
        'Deprecated legacy fallback (Google retired the gemini CLI). Prefer Antigravity.',
      detail: geminiStatus.installed
        ? geminiAuthed
          ? 'Authenticated'
          : "Run 'gemini' to login"
        : 'Not installed (retired - use Antigravity)',
    },
    {
      id: 'opencode',
      kind: 'legacy-cli',
      name: 'OpenCode',
      command: 'opencode',
      enabled: wsConfig.providers?.opencode?.enabled ?? false,
      available: opencodeStatus.installed,
      version: opencodeStatus.version ?? null,
      installCommand: 'curl -fsSL https://opencode.ai/install | bash',
      docsUrl: 'https://github.com/sst/opencode',
      requiresApiKey: false,
      description: 'Optional legacy LLM fallback via OpenCode.',
      detail: opencodeStatus.installed ? 'Installed' : 'Not installed',
    },
    {
      id: 'grok',
      kind: 'legacy-cli',
      name: 'Grok CLI',
      command: 'grok',
      enabled: wsConfig.providers?.grok?.enabled ?? false,
      available: grokStatus.installed && hasEnvValue('GROK_API_KEY'),
      version: grokStatus.version ?? null,
      installCommand: 'npm install -g @vibe-kit/grok-cli',
      docsUrl: 'https://github.com/superagent-ai/grok-cli',
      requiresApiKey: true,
      apiKeyEnvVar: 'GROK_API_KEY',
      description: 'Optional legacy LLM fallback with xAI Grok.',
      detail: grokStatus.installed
        ? hasEnvValue('GROK_API_KEY')
          ? 'Ready'
          : 'Set GROK_API_KEY'
        : 'Not installed',
    },
  ];
}

/**
 * Get all WebSearch providers with their current status.
 */
export function getWebSearchCliProviders(): WebSearchCliInfo[] {
  const wsConfig = getWebSearchConfig();
  const apiKeyStates = getWebSearchApiKeyStates();
  const cooldowns = readProviderCooldowns();
  const providers: WebSearchCliInfo[] = [
    {
      id: 'exa',
      kind: 'backend',
      name: 'Exa',
      enabled: wsConfig.providers?.exa?.enabled ?? false,
      available: (wsConfig.providers?.exa?.enabled ?? false) && apiKeyStates.exa.available,
      version: null,
      docsUrl: 'https://docs.exa.ai/reference/search',
      requiresApiKey: true,
      apiKeyEnvVar: 'EXA_API_KEY',
      description: 'API-backed search with strong relevance and content extraction.',
      detail: apiKeyStates.exa.available
        ? `API key detected (${wsConfig.providers?.exa?.max_results ?? 5} results)`
        : apiKeyStates.exa.configured
          ? 'Stored in dashboard, but Global Env is disabled'
          : 'Set EXA_API_KEY',
    },
    {
      id: 'tavily',
      kind: 'backend',
      name: 'Tavily',
      enabled: wsConfig.providers?.tavily?.enabled ?? false,
      available: (wsConfig.providers?.tavily?.enabled ?? false) && apiKeyStates.tavily.available,
      version: null,
      docsUrl: 'https://docs.tavily.com/documentation/api-reference/endpoint/search',
      requiresApiKey: true,
      apiKeyEnvVar: 'TAVILY_API_KEY',
      description: 'Search API optimized for agent workflows and concise web result synthesis.',
      detail: apiKeyStates.tavily.available
        ? `API key detected (${wsConfig.providers?.tavily?.max_results ?? 5} results)`
        : apiKeyStates.tavily.configured
          ? 'Stored in dashboard, but Global Env is disabled'
          : 'Set TAVILY_API_KEY',
    },
    {
      id: 'brave',
      kind: 'backend',
      name: 'Brave Search',
      enabled: wsConfig.providers?.brave?.enabled ?? false,
      available: (wsConfig.providers?.brave?.enabled ?? false) && apiKeyStates.brave.available,
      version: null,
      docsUrl: 'https://brave.com/search/api/',
      requiresApiKey: true,
      apiKeyEnvVar: 'BRAVE_API_KEY',
      description: 'API-backed web search with cleaner result metadata.',
      detail: apiKeyStates.brave.available
        ? `API key detected (${wsConfig.providers?.brave?.max_results ?? 5} results)`
        : apiKeyStates.brave.configured
          ? 'Stored in dashboard, but Global Env is disabled'
          : 'Set BRAVE_API_KEY',
    },
    {
      id: 'searxng',
      kind: 'backend',
      name: 'SearXNG',
      enabled: wsConfig.providers?.searxng?.enabled ?? false,
      available:
        (wsConfig.providers?.searxng?.enabled ?? false) &&
        hasValidSearxngUrl(wsConfig.providers?.searxng?.url),
      version: null,
      docsUrl: 'https://docs.searxng.org/dev/search_api.html',
      requiresApiKey: false,
      description: 'Configurable SearXNG JSON backend for self-hosted or public instances.',
      detail: hasValidSearxngUrl(wsConfig.providers?.searxng?.url)
        ? `Configured (${wsConfig.providers?.searxng?.max_results ?? 5} results)`
        : 'Set a valid SearXNG base URL',
    },
    {
      id: 'duckduckgo',
      kind: 'backend',
      name: 'DuckDuckGo',
      enabled: wsConfig.providers?.duckduckgo?.enabled ?? true,
      available: wsConfig.providers?.duckduckgo?.enabled ?? true,
      version: null,
      docsUrl: 'https://duckduckgo.com',
      requiresApiKey: false,
      description: 'Default built-in HTML search backend. Zero setup.',
      detail: `Built-in (${wsConfig.providers?.duckduckgo?.max_results ?? 5} results)`,
    },
  ];

  return [...providers, ...getLegacyProviderStatuses()].map((provider) =>
    applyCooldownStatus(provider, cooldowns)
  );
}

/**
 * Check if any WebSearch provider is currently ready.
 */
export function hasAnyWebSearchCli(): boolean {
  return getWebSearchCliProviders().some((provider) => provider.enabled && provider.available);
}

/**
 * Get setup hints when no providers are ready.
 */
export function getCliInstallHints(): string[] {
  if (hasAnyWebSearchCli()) {
    return [];
  }

  return [
    'WebSearch: no ready providers',
    '    Enable DuckDuckGo in Settings > WebSearch for zero-setup search',
    '    Or enable SearXNG and set a valid base URL (must support /search?format=json)',
    '    Or export EXA_API_KEY, TAVILY_API_KEY, or BRAVE_API_KEY for API-backed search',
    '    Optional LLM CLI fallback: curl -fsSL https://antigravity.google/cli/install.sh | bash',
  ];
}

export function buildWebSearchReadiness(
  enabled: boolean,
  providers: WebSearchCliInfo[]
): WebSearchStatus {
  if (!enabled) {
    return {
      readiness: 'unavailable',
      message: 'Disabled in config',
      providers,
    };
  }

  const enabledProviders = providers.filter((provider) => provider.enabled);
  const readyProviders = enabledProviders.filter((provider) => provider.available);

  if (readyProviders.length > 0) {
    return {
      readiness: 'ready',
      message: `Ready (${readyProviders.map((provider) => provider.name).join(' + ')})`,
      providers,
    };
  }

  if (enabledProviders.length > 0) {
    return {
      readiness: 'needs_setup',
      message: enabledProviders
        .map((provider) => `${provider.name}: ${provider.detail}`)
        .join(' | '),
      providers,
    };
  }

  return {
    readiness: 'unavailable',
    message: 'Enable at least one provider in Settings > WebSearch',
    providers,
  };
}

/**
 * Get WebSearch readiness status for display.
 */
export function getWebSearchReadiness(): WebSearchStatus {
  const wsConfig = getWebSearchConfig();
  const providers = getWebSearchCliProviders();
  return buildWebSearchReadiness(wsConfig.enabled, providers);
}

/**
 * Display WebSearch status (single line, equilibrium UX).
 */
export function displayWebSearchStatus(): void {
  const status = getWebSearchReadiness();

  switch (status.readiness) {
    case 'ready':
      console.error(ok(`WebSearch: ${status.message}`));
      break;
    case 'needs_setup':
      console.error(warn(`WebSearch: ${status.message}`));
      break;
    case 'unavailable':
      console.error(fail(`WebSearch: ${status.message}`));
      for (const [index, hint] of getCliInstallHints().entries()) {
        console.error(index === 0 ? info(hint) : hint);
      }
      break;
  }
}
