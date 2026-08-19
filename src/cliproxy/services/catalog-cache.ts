import * as fs from 'fs';
import * as path from 'path';

import type { CLIProxyProvider } from '../types';
import type { ModelEntry, ProviderCatalog, ThinkingSupport } from '../model-catalog';
import { MODEL_CATALOG } from '../model-catalog';
import type {
  GetModelDefinitionsResponse,
  RemoteModelInfo,
  RemoteThinkingSupport,
} from '../management/management-api-types';
import { getDeniedModelIdReasonForProvider } from '../ai-providers/model-id-normalizer';
import {
  buildManagementHeaders,
  buildProxyUrl,
  getProxyTarget,
} from '../proxy/proxy-target-resolver';
import { getCcsDir } from '../../config/config-loader-facade';

const CACHE_FILE_NAME = 'model-catalog-cache.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const LIVE_FETCH_TIMEOUT_MS = 3000;

/** Cache structure stored on disk */
interface CatalogCacheData {
  providers: Record<string, RemoteModelInfo[]>;
  fetchedAt: number;
}

/** Channel name → CCS provider mapping */
const CHANNEL_TO_PROVIDER: Record<string, CLIProxyProvider> = {
  antigravity: 'agy',
  claude: 'claude',
  gemini: 'gemini',
  codex: 'codex',
  xai: 'xai',
  qwen: 'qwen',
  iflow: 'iflow',
  kimi: 'kimi',
  kiro: 'kiro',
  'github-copilot': 'ghcp',
  qoder: 'qoder',
};

/** CCS provider → channel name mapping (reverse) */
export const PROVIDER_TO_CHANNEL: Record<string, string> = Object.fromEntries(
  Object.entries(CHANNEL_TO_PROVIDER).map(([k, v]) => [v, k])
);

/** Providers to sync from CLIProxyAPI */
export const SYNCABLE_PROVIDERS: CLIProxyProvider[] = [
  ...new Set(Object.values(CHANNEL_TO_PROVIDER)),
] as CLIProxyProvider[];

export type CatalogSource = 'live' | 'cache' | 'static';

export interface ResolvedCatalogSnapshot {
  catalogs: Partial<Record<CLIProxyProvider, ProviderCatalog>>;
  source: CatalogSource;
  cacheAge: string | null;
}

function getCacheFilePath(): string {
  return path.join(getCcsDir(), CACHE_FILE_NAME);
}

/** Read cached catalog data, null if expired or missing */
export function getCachedCatalog(): CatalogCacheData | null {
  try {
    const filePath = getCacheFilePath();
    if (!fs.existsSync(filePath)) return null;
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as CatalogCacheData;
    if (Date.now() - data.fetchedAt > CACHE_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

/** Save catalog data to cache */
export function setCachedCatalog(providers: Record<string, RemoteModelInfo[]>): void {
  try {
    const filePath = getCacheFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ providers, fetchedAt: Date.now() }));
  } catch {
    // Ignore cache write errors
  }
}

/** Delete cache file */
export function clearCatalogCache(): boolean {
  try {
    const filePath = getCacheFilePath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Get cache age in human-readable format, or null if no cache */
export function getCacheAge(): string | null {
  try {
    const filePath = getCacheFilePath();
    if (!fs.existsSync(filePath)) return null;
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as CatalogCacheData;
    const ageMs = Date.now() - data.fetchedAt;
    const hours = Math.floor(ageMs / (60 * 60 * 1000));
    const minutes = Math.floor((ageMs % (60 * 60 * 1000)) / (60 * 1000));
    if (hours > 0) return `${hours}h ${minutes}m ago`;
    return `${minutes}m ago`;
  } catch {
    return null;
  }
}

async function fetchProviderCatalog(
  provider: CLIProxyProvider
): Promise<[CLIProxyProvider, RemoteModelInfo[] | null]> {
  const channel = PROVIDER_TO_CHANNEL[provider];
  if (!channel) {
    return [provider, null];
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LIVE_FETCH_TIMEOUT_MS);

  try {
    const target = getProxyTarget();
    const response = await fetch(
      buildProxyUrl(target, `/v0/management/model-definitions/${channel}`),
      {
        signal: controller.signal,
        headers: buildManagementHeaders(target),
      }
    );

    if (!response.ok) {
      return [provider, null];
    }

    const data = (await response.json()) as GetModelDefinitionsResponse;
    return [provider, Array.isArray(data.models) ? data.models : null];
  } catch {
    return [provider, null];
  } finally {
    clearTimeout(timeoutId);
  }
}

async function isProxyCatalogReachable(): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1000);

  try {
    const target = getProxyTarget();
    const response = await fetch(buildProxyUrl(target, '/'), {
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function refreshCatalogFromProxy(): Promise<Record<string, RemoteModelInfo[]> | null> {
  if (!(await isProxyCatalogReachable())) {
    return null;
  }

  const settled = await Promise.all(
    SYNCABLE_PROVIDERS.map((provider) => fetchProviderCatalog(provider))
  );
  const providers = Object.fromEntries(
    settled.filter(([, models]) => Array.isArray(models) && models.length > 0)
  ) as Record<string, RemoteModelInfo[]>;

  if (Object.keys(providers).length === 0) {
    return null;
  }

  setCachedCatalog(providers);
  return providers;
}

/** Map remote thinking support to CCS ThinkingSupport */
function mapThinking(remote?: RemoteThinkingSupport): ThinkingSupport | undefined {
  if (!remote) return undefined;
  // If levels are provided, it's a levels-type thinking
  if (remote.levels && remote.levels.length > 0) {
    return {
      type: 'levels',
      levels: remote.levels,
      zeroAllowed: remote.zero_allowed,
      dynamicAllowed: remote.dynamic_allowed,
    };
  }
  // If min/max budget are provided, it's budget-type
  if (remote.min !== undefined || remote.max !== undefined) {
    return {
      type: 'budget',
      min: remote.min,
      max: remote.max,
      zeroAllowed: remote.zero_allowed,
      dynamicAllowed: remote.dynamic_allowed,
    };
  }
  return { type: 'none' };
}

/** Map RemoteModelInfo to ModelEntry */
function mapRemoteToModelEntry(provider: CLIProxyProvider, remote: RemoteModelInfo): ModelEntry {
  const entry: ModelEntry = {
    id: remote.id,
    name: remote.display_name || remote.id,
  };
  if (remote.description) entry.description = remote.description;
  if (
    typeof remote.context_length === 'number' &&
    Number.isInteger(remote.context_length) &&
    remote.context_length > 0
  ) {
    entry.contextWindow = remote.context_length;
  }
  // xAI context length is inherent to the model ID; its API does not accept
  // Claude's [1m] model suffix.
  if (provider !== 'xai' && remote.context_length && remote.context_length >= 1_000_000) {
    entry.extendedContext = true;
  }
  const thinking = mapThinking(remote.thinking);
  if (thinking) entry.thinking = thinking;
  return entry;
}

/**
 * Merge remote models with static catalog for a provider.
 * Remote fields override static where present.
 * Static-only fields preserved: broken, deprecated, deprecationReason, issueUrl, tier.
 * Models in remote but not in static → added.
 * Models removed upstream stay hidden; UI falls back to static only when live data is unavailable.
 */
export function mergeCatalog(
  provider: CLIProxyProvider,
  remoteModels: RemoteModelInfo[]
): ProviderCatalog | undefined {
  const filteredRemoteModels =
    provider === 'agy'
      ? remoteModels.filter(
          (remoteModel) => !getDeniedModelIdReasonForProvider(remoteModel.id, provider)
        )
      : remoteModels;

  const staticCatalog = MODEL_CATALOG[provider];
  if (!staticCatalog && filteredRemoteModels.length === 0) return undefined;

  const displayName = staticCatalog?.displayName || provider;

  // Build map of static models by lowercase ID for fast lookup
  const staticMap = new Map<string, ModelEntry>();
  if (staticCatalog) {
    for (const model of staticCatalog.models) {
      staticMap.set(model.id.toLowerCase(), model);
    }
  }

  // Process remote models: merge with static entries
  const mergedModels: ModelEntry[] = [];

  for (const remote of filteredRemoteModels) {
    const remoteEntry = mapRemoteToModelEntry(provider, remote);
    const staticEntry = staticMap.get(remote.id.toLowerCase());
    if (staticEntry) {
      const mergedThinking = remoteEntry.thinking
        ? {
            ...remoteEntry.thinking,
            zeroAllowed: remoteEntry.thinking.zeroAllowed ?? staticEntry.thinking?.zeroAllowed,
            maxLevel: remoteEntry.thinking.maxLevel ?? staticEntry.thinking?.maxLevel,
          }
        : staticEntry.thinking;

      // Merge: remote overrides, static fills gaps
      mergedModels.push({
        ...remoteEntry,
        thinking: mergedThinking,
        // Preserve static-only fields
        tier: staticEntry.tier,
        broken: staticEntry.broken,
        issueUrl: staticEntry.issueUrl,
        deprecated: staticEntry.deprecated,
        deprecationReason: staticEntry.deprecationReason,
        contextWindow: remoteEntry.contextWindow ?? staticEntry.contextWindow,
      });
    } else {
      mergedModels.push(remoteEntry);
    }
  }

  const staticDefaultModel = staticCatalog?.defaultModel;
  const hasStaticDefaultModel =
    typeof staticDefaultModel === 'string' &&
    mergedModels.some((model) => model.id.toLowerCase() === staticDefaultModel.toLowerCase());
  const defaultModel = hasStaticDefaultModel ? staticDefaultModel : (mergedModels[0]?.id ?? '');

  return {
    provider,
    displayName,
    defaultModel,
    models: mergedModels,
  };
}

function getResolvedCatalogFromProviders(
  provider: CLIProxyProvider,
  providers?: Record<string, RemoteModelInfo[]>
): ProviderCatalog | undefined {
  if (providers?.[provider]) {
    return mergeCatalog(provider, providers[provider]);
  }
  return MODEL_CATALOG[provider];
}

function getAllResolvedCatalogsFromProviders(
  providers?: Record<string, RemoteModelInfo[]>
): Partial<Record<CLIProxyProvider, ProviderCatalog>> {
  const result: Partial<Record<CLIProxyProvider, ProviderCatalog>> = {};
  const providerIds = new Set<CLIProxyProvider>();

  for (const provider of Object.keys(MODEL_CATALOG) as CLIProxyProvider[]) {
    providerIds.add(provider);
  }

  if (providers) {
    for (const provider of Object.keys(providers) as CLIProxyProvider[]) {
      providerIds.add(provider);
    }
  }

  for (const provider of providerIds) {
    const catalog = getResolvedCatalogFromProviders(provider, providers);
    if (catalog) {
      result[provider] = catalog;
    }
  }

  return result;
}

/**
 * Get resolved catalog for a provider.
 * Uses cached remote data if available, falls back to static.
 */
export function getResolvedCatalog(provider: CLIProxyProvider): ProviderCatalog | undefined {
  const cached = getCachedCatalog();
  if (cached && cached.providers[provider]) {
    return mergeCatalog(provider, cached.providers[provider]);
  }
  return MODEL_CATALOG[provider];
}

/**
 * Get all resolved catalogs (for Dashboard).
 */
export function getAllResolvedCatalogs(): Partial<Record<CLIProxyProvider, ProviderCatalog>> {
  const cached = getCachedCatalog();
  return getAllResolvedCatalogsFromProviders(cached?.providers);
}

export async function getResolvedCatalogSnapshot(): Promise<ResolvedCatalogSnapshot> {
  const liveProviders = await refreshCatalogFromProxy();
  if (liveProviders) {
    return {
      catalogs: getAllResolvedCatalogsFromProviders(liveProviders),
      source: 'live',
      cacheAge: getCacheAge(),
    };
  }

  const cached = getCachedCatalog();
  if (cached?.providers) {
    return {
      catalogs: getAllResolvedCatalogsFromProviders(cached.providers),
      source: 'cache',
      cacheAge: getCacheAge(),
    };
  }

  return {
    catalogs: getAllResolvedCatalogsFromProviders(),
    source: 'static',
    cacheAge: null,
  };
}
