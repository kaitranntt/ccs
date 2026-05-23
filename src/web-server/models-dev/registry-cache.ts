import * as fs from 'fs';
import * as path from 'path';

import type { ModelsDevCacheData, ModelsDevProvider, ModelsDevRegistry } from './types';
import { getCcsDir } from '../../config/config-loader-facade';

export const MODELS_DEV_API_URL = 'https://models.dev/api.json';

const CACHE_FILE_NAME = 'models-dev-registry-cache.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const LIVE_FETCH_TIMEOUT_MS = 3000;

let pendingBackgroundRefresh: Promise<ModelsDevRegistry | null> | null = null;

export interface RegistryCacheReadOptions {
  allowStale?: boolean;
  now?: number;
}

export interface RegistryRefreshOptions {
  force?: boolean;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

function getCacheFilePath(): string {
  return path.join(getCcsDir(), CACHE_FILE_NAME);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeRegistryPayload(payload: unknown): ModelsDevRegistry | null {
  if (!isPlainObject(payload)) return null;

  const providers: ModelsDevRegistry = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!isPlainObject(value)) continue;
    const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : key;
    const modelsPayload = isPlainObject(value.models) ? value.models : undefined;
    if (!modelsPayload) continue;

    const models: NonNullable<ModelsDevProvider['models']> = {};
    for (const [modelKey, modelValue] of Object.entries(modelsPayload)) {
      if (!isPlainObject(modelValue)) continue;
      const modelId =
        typeof modelValue.id === 'string' && modelValue.id.trim() ? modelValue.id.trim() : modelKey;
      models[modelKey] = {
        ...(modelValue as NonNullable<ModelsDevProvider['models']>[string]),
        id: modelId,
      };
    }
    if (Object.keys(models).length === 0) continue;

    providers[id] = {
      ...(value as ModelsDevProvider),
      id,
      models,
    };
  }

  return Object.keys(providers).length > 0 ? providers : null;
}

function normalizeCachePayload(payload: unknown): ModelsDevCacheData | null {
  if (!isPlainObject(payload)) return null;
  if (payload.version !== 1 || typeof payload.fetchedAt !== 'number') return null;
  const providers = normalizeRegistryPayload(payload.providers);
  return providers ? { version: 1, fetchedAt: payload.fetchedAt, providers } : null;
}

export function getCachedModelsDevRegistry(
  options: RegistryCacheReadOptions = {}
): ModelsDevRegistry | null {
  try {
    const filePath = getCacheFilePath();
    if (!fs.existsSync(filePath)) return null;

    const cache = normalizeCachePayload(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    if (!cache) return null;

    const now = options.now ?? Date.now();
    if (!options.allowStale && now - cache.fetchedAt > CACHE_TTL_MS) return null;
    return cache.providers;
  } catch {
    return null;
  }
}

export function setCachedModelsDevRegistry(
  providers: ModelsDevRegistry,
  fetchedAt = Date.now()
): void {
  try {
    const filePath = getCacheFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const cache: ModelsDevCacheData = { version: 1, fetchedAt, providers };
    fs.writeFileSync(filePath, JSON.stringify(cache));
  } catch {
    // Best-effort cache writes must not break analytics.
  }
}

export function clearModelsDevRegistryCache(): boolean {
  try {
    const filePath = getCacheFilePath();
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function refreshModelsDevRegistry(
  options: RegistryRefreshOptions = {}
): Promise<ModelsDevRegistry | null> {
  const now = options.now ?? (() => Date.now());
  if (!options.force) {
    const fresh = getCachedModelsDevRegistry({ allowStale: false, now: now() });
    if (fresh) return fresh;
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LIVE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetchImpl(MODELS_DEV_API_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return getCachedModelsDevRegistry({ allowStale: true });

    const providers = normalizeRegistryPayload(await response.json());
    if (!providers) return getCachedModelsDevRegistry({ allowStale: true });

    setCachedModelsDevRegistry(providers, now());
    return providers;
  } catch {
    return getCachedModelsDevRegistry({ allowStale: true });
  } finally {
    clearTimeout(timeoutId);
  }
}

export function startModelsDevRegistryRefresh(
  options: RegistryRefreshOptions = {}
): Promise<ModelsDevRegistry | null> {
  if (!pendingBackgroundRefresh) {
    pendingBackgroundRefresh = refreshModelsDevRegistry(options)
      .catch(() => null)
      .finally(() => {
        pendingBackgroundRefresh = null;
      });
  }

  return pendingBackgroundRefresh;
}
