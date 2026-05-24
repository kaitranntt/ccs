/**
 * Cursor Model Catalog
 *
 * Manages available models from Cursor IDE.
 */

import * as http from 'http';
import type { CursorModel } from './types';
import type { CursorApiCredentials } from './cursor-protobuf-schema';
import { isDaemonRunning } from './cursor-daemon';
import { getCursorDaemonToken } from './cursor-daemon-auth';
import { buildCursorModelsHeaders } from './cursor-client-policy';
import {
  DEFAULT_CURSOR_MODEL,
  DEFAULT_CURSOR_MODELS,
  detectProvider,
  formatModelName,
} from './cursor-default-models';

/** Default daemon port */
export const DEFAULT_CURSOR_PORT = 20129;

export { DEFAULT_CURSOR_MODEL, DEFAULT_CURSOR_MODELS, detectProvider, formatModelName };

const CURSOR_MODELS_API_ENDPOINT = 'https://api2.cursor.sh/v1/models';
const CURSOR_MODELS_CACHE_TTL_MS = 5 * 60 * 1000;
const CURSOR_MODELS_MAX_BODY_SIZE = 1024 * 1024; // 1MB limit
const CURSOR_DAEMON_MODELS_TIMEOUT_MS = 5000;

let liveModelsCache: {
  models: CursorModel[];
  expiresAtMs: number;
} | null = null;

interface CursorModelsApiResponse {
  data?: Array<{ id?: unknown; name?: unknown; provider?: unknown }>;
  models?: Array<{ id?: unknown; name?: unknown; provider?: unknown }>;
}

function debugLog(message: string, error?: unknown): void {
  if (!process.env.CCS_DEBUG) return;
  if (error) {
    console.error(`[cursor] ${message}`, error);
    return;
  }
  console.error(`[cursor] ${message}`);
}

function normalizeModelRecords(
  records: Array<{ id?: unknown; name?: unknown; provider?: unknown }>
): CursorModel[] {
  const models: CursorModel[] = [];
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    if (typeof record.id !== 'string' || !record.id) continue;
    const modelId = record.id;
    const modelName = typeof record.name === 'string' && record.name ? record.name : modelId;
    const provider =
      typeof record.provider === 'string' && record.provider
        ? record.provider
        : detectProvider(modelId);
    models.push({
      id: modelId,
      name: modelName,
      provider,
      isDefault: modelId === DEFAULT_CURSOR_MODEL,
    });
  }
  return models;
}

function parseApiModelsResponse(payload: unknown): CursorModel[] | null {
  if (!payload || typeof payload !== 'object') return null;
  const response = payload as CursorModelsApiResponse;
  const records = Array.isArray(response.data)
    ? response.data
    : Array.isArray(response.models)
      ? response.models
      : null;

  if (!records) return null;

  const models = normalizeModelRecords(records);
  return models.length > 0 ? models : null;
}

function parseContentLength(value: string | string[] | undefined): number | null {
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (!rawValue) return null;

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function getCachedLiveModels(nowMs: number = Date.now()): CursorModel[] | null {
  if (!liveModelsCache) return null;
  if (liveModelsCache.expiresAtMs <= nowMs) {
    liveModelsCache = null;
    return null;
  }
  return liveModelsCache.models;
}

function setCachedLiveModels(models: CursorModel[], nowMs: number = Date.now()): void {
  liveModelsCache = {
    models,
    expiresAtMs: nowMs + CURSOR_MODELS_CACHE_TTL_MS,
  };
}

export function clearCursorModelsCache(): void {
  liveModelsCache = null;
}

export async function fetchModelsFromCursorApi(
  credentials: CursorApiCredentials,
  options: {
    endpoint?: string;
    timeoutMs?: number;
  } = {}
): Promise<CursorModel[] | null> {
  if (!credentials.accessToken || !credentials.machineId) {
    return null;
  }

  const endpoint = options.endpoint || CURSOR_MODELS_API_ENDPOINT;
  const timeoutMs = options.timeoutMs ?? 5000;
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: buildCursorModelsHeaders(credentials),
      signal: abortController.signal,
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        clearCursorModelsCache();
      }
      debugLog(`Cursor models API returned ${response.status} (${endpoint})`);
      return null;
    }

    const payload = (await response.json()) as unknown;
    const parsed = parseApiModelsResponse(payload);
    if (!parsed) {
      debugLog(`Cursor models API payload shape invalid (${endpoint})`);
    }
    return parsed;
  } catch (error) {
    debugLog(`Cursor models API fetch failed (${endpoint})`, error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getModelsForDaemon(
  options: {
    credentials?: CursorApiCredentials | null;
    endpoint?: string;
    timeoutMs?: number;
  } = {}
): Promise<CursorModel[]> {
  const cached = getCachedLiveModels();
  if (cached) {
    return cached;
  }

  const credentials = options.credentials;
  if (credentials?.accessToken && credentials.machineId) {
    const liveModels = await fetchModelsFromCursorApi(credentials, {
      endpoint: options.endpoint,
      timeoutMs: options.timeoutMs,
    });
    if (liveModels && liveModels.length > 0) {
      setCachedLiveModels(liveModels);
      return liveModels;
    }
  }

  return DEFAULT_CURSOR_MODELS;
}

/**
 * Fetch available models from running cursor daemon.
 *
 * @param port The port cursor daemon is running on
 * @returns List of available models
 */
export async function fetchModelsFromDaemon(port: number): Promise<CursorModel[]> {
  return new Promise((resolve) => {
    let resolved = false;
    const safeResolve = (models: CursorModel[]) => {
      if (resolved) return;
      resolved = true;
      resolve(models);
    };

    const req = http.request(
      {
        // Use 127.0.0.1 instead of localhost for more reliable local connections
        hostname: '127.0.0.1',
        port,
        path: '/v1/models',
        method: 'GET',
        timeout: CURSOR_DAEMON_MODELS_TIMEOUT_MS,
      },
      (res) => {
        const contentLength = parseContentLength(res.headers['content-length']);
        if (contentLength !== null && contentLength > CURSOR_MODELS_MAX_BODY_SIZE) {
          debugLog(
            'Cursor daemon /v1/models content-length exceeded 1MB; falling back to defaults'
          );
          res.destroy();
          req.destroy();
          safeResolve(DEFAULT_CURSOR_MODELS);
          return;
        }

        let data = '';
        let bodySize = 0;

        res.on('data', (chunk) => {
          if (resolved) return;
          bodySize += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
          if (bodySize > CURSOR_MODELS_MAX_BODY_SIZE) {
            debugLog('Cursor daemon /v1/models body exceeded 1MB; falling back to defaults');
            res.destroy();
            req.destroy();
            safeResolve(DEFAULT_CURSOR_MODELS);
            return;
          }

          data += chunk;
        });

        res.on('end', () => {
          if (resolved) return;
          try {
            const response = JSON.parse(data) as { data?: Array<{ id?: unknown }> };
            if (Array.isArray(response.data)) {
              const models: CursorModel[] = response.data
                .filter((m) => m && typeof m.id === 'string' && m.id.length > 0)
                .map((m) => ({
                  id: m.id as string,
                  name: formatModelName(m.id as string),
                  provider: detectProvider(m.id as string),
                  isDefault: m.id === DEFAULT_CURSOR_MODEL,
                }));
              safeResolve(models.length > 0 ? models : DEFAULT_CURSOR_MODELS);
            } else {
              debugLog('Cursor daemon /v1/models payload missing data[]; falling back to defaults');
              safeResolve(DEFAULT_CURSOR_MODELS);
            }
          } catch (error) {
            debugLog(
              'Cursor daemon /v1/models returned invalid JSON; falling back to defaults',
              error
            );
            safeResolve(DEFAULT_CURSOR_MODELS);
          }
        });
      }
    );

    req.on('error', (error) => {
      debugLog('Cursor daemon /v1/models request failed; falling back to defaults', error);
      safeResolve(DEFAULT_CURSOR_MODELS);
    });

    req.on('timeout', () => {
      debugLog('Cursor daemon /v1/models request timed out; falling back to defaults');
      req.destroy();
      safeResolve(DEFAULT_CURSOR_MODELS);
    });

    req.end();
  });
}

/**
 * Get available models (from daemon or defaults).
 * Checks daemon health first to avoid 5s timeout when daemon is not running.
 */
export async function getAvailableModels(port: number): Promise<CursorModel[]> {
  if (!(await isDaemonRunning(port, getCursorDaemonToken()))) {
    return DEFAULT_CURSOR_MODELS;
  }
  return fetchModelsFromDaemon(port);
}

function getCatalogDefaultModelId(availableModels: CursorModel[]): string {
  if (availableModels.some((model) => model.id === DEFAULT_CURSOR_MODEL)) {
    return DEFAULT_CURSOR_MODEL;
  }

  const explicitDefault = availableModels.find((model) => model.isDefault)?.id;
  if (explicitDefault) {
    return explicitDefault;
  }

  const firstAvailable = availableModels.find(
    (model) => typeof model.id === 'string' && model.id.trim().length > 0
  )?.id;

  return firstAvailable || DEFAULT_CURSOR_MODEL;
}

function addLookupCandidate(candidates: Set<string>, value: string): void {
  const normalized = value.trim().toLowerCase();
  if (normalized) {
    candidates.add(normalized);
  }
}

function buildCursorAnthropicModelLookupCandidates(requestedModel: string): string[] {
  const candidates = new Set<string>();
  const raw = requestedModel.trim().toLowerCase();
  addLookupCandidate(candidates, raw);

  let normalized = raw.replace(/^[a-z0-9_-]+\//, '');
  addLookupCandidate(candidates, normalized);

  while (true) {
    const stripped = normalized
      .replace(/\(\d+\)$/i, '')
      .replace(/\[1m\]$/i, '')
      .replace(/-thinking$/i, '')
      .replace(/-\d{8}$/i, '');

    if (stripped === normalized) {
      break;
    }

    normalized = stripped;
    addLookupCandidate(candidates, normalized);
  }

  const anthropicAliasMatch = normalized.match(
    /^claude-(opus|sonnet|haiku)-(\d+)(?:[.-](\d+))?(?:-(1m|fast-mode))?$/i
  );
  if (anthropicAliasMatch) {
    const [, family, major, minor, variant] = anthropicAliasMatch;
    const cursorModelId = `claude-${major}${minor ? `.${minor}` : ''}-${family.toLowerCase()}${variant ? `-${variant.toLowerCase()}` : ''}`;
    addLookupCandidate(candidates, cursorModelId);
  }

  return [...candidates];
}

export function resolveCursorRequestModel(
  requestedModel: string | null | undefined,
  availableModels: CursorModel[]
): string {
  const fallbackModel = getCatalogDefaultModelId(availableModels);
  const normalizedRequested = typeof requestedModel === 'string' ? requestedModel.trim() : '';
  if (!normalizedRequested) {
    return fallbackModel;
  }

  const lookupCandidates = new Set(buildCursorAnthropicModelLookupCandidates(normalizedRequested));
  const matchedModel = availableModels.find((model) =>
    lookupCandidates.has(model.id.toLowerCase())
  );
  if (matchedModel) {
    return matchedModel.id;
  }

  return fallbackModel;
}

/**
 * Get the default model.
 * Uses GPT-5.3 Codex as default.
 */
export function getDefaultModel(): string {
  return getCatalogDefaultModelId(DEFAULT_CURSOR_MODELS);
}
