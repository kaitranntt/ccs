import * as fs from 'fs';
import * as path from 'path';
import { getCcsDir } from '../utils/config-manager';
import type { CLIProxyProvider } from './types';
import type { ModelEntry, ProviderCatalog, ThinkingSupport } from './model-catalog';
import { MODEL_CATALOG } from './model-catalog';
import type { RemoteModelInfo, RemoteThinkingSupport } from './management-api-types';

const CACHE_FILE_NAME = 'model-catalog-cache.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

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
  qwen: 'qwen',
  iflow: 'iflow',
};

/** CCS provider → channel name mapping (reverse) */
export const PROVIDER_TO_CHANNEL: Record<string, string> = Object.fromEntries(
  Object.entries(CHANNEL_TO_PROVIDER).map(([k, v]) => [v, k])
);

/** Providers to sync from CLIProxyAPI */
export const SYNCABLE_PROVIDERS: CLIProxyProvider[] = ['agy', 'gemini', 'codex', 'claude'];

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

/** Map remote thinking support to CCS ThinkingSupport */
function mapThinking(remote?: RemoteThinkingSupport): ThinkingSupport | undefined {
  if (!remote) return undefined;
  // If levels are provided, it's a levels-type thinking
  if (remote.levels && remote.levels.length > 0) {
    return {
      type: 'levels',
      levels: remote.levels,
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
function mapRemoteToModelEntry(remote: RemoteModelInfo): ModelEntry {
  const entry: ModelEntry = {
    id: remote.id,
    name: remote.display_name || remote.id,
  };
  if (remote.description) entry.description = remote.description;
  if (remote.context_length && remote.context_length >= 1_000_000) {
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
 * Models in static but not in remote → kept.
 * Models in remote but not in static → added.
 */
export function mergeCatalog(
  provider: CLIProxyProvider,
  remoteModels: RemoteModelInfo[]
): ProviderCatalog | undefined {
  const staticCatalog = MODEL_CATALOG[provider];
  if (!staticCatalog && remoteModels.length === 0) return undefined;

  const displayName = staticCatalog?.displayName || provider;
  const defaultModel = staticCatalog?.defaultModel || (remoteModels[0]?.id ?? '');

  // Build map of static models by lowercase ID for fast lookup
  const staticMap = new Map<string, ModelEntry>();
  if (staticCatalog) {
    for (const model of staticCatalog.models) {
      staticMap.set(model.id.toLowerCase(), model);
    }
  }

  // Process remote models: merge with static entries
  const mergedIds = new Set<string>();
  const mergedModels: ModelEntry[] = [];

  for (const remote of remoteModels) {
    const remoteEntry = mapRemoteToModelEntry(remote);
    const staticEntry = staticMap.get(remote.id.toLowerCase());
    mergedIds.add(remote.id.toLowerCase());

    if (staticEntry) {
      // Merge: remote overrides, static fills gaps
      mergedModels.push({
        ...remoteEntry,
        // Preserve static-only fields
        tier: staticEntry.tier,
        broken: staticEntry.broken,
        issueUrl: staticEntry.issueUrl,
        deprecated: staticEntry.deprecated,
        deprecationReason: staticEntry.deprecationReason,
      });
    } else {
      mergedModels.push(remoteEntry);
    }
  }

  // Add static-only models not in remote
  if (staticCatalog) {
    for (const model of staticCatalog.models) {
      if (!mergedIds.has(model.id.toLowerCase())) {
        mergedModels.push(model);
      }
    }
  }

  return {
    provider,
    displayName,
    defaultModel,
    models: mergedModels,
  };
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
  const result: Partial<Record<CLIProxyProvider, ProviderCatalog>> = {};
  const cached = getCachedCatalog();

  // Get all known providers from both static and cache
  const providers = new Set<CLIProxyProvider>();
  for (const p of Object.keys(MODEL_CATALOG) as CLIProxyProvider[]) providers.add(p);
  if (cached) {
    for (const p of Object.keys(cached.providers) as CLIProxyProvider[]) providers.add(p);
  }

  for (const provider of providers) {
    const catalog = getResolvedCatalog(provider);
    if (catalog) result[provider] = catalog;
  }

  return result;
}
