import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { getActiveConfigPath, getCcsDir, getConfigPath } from '../utils/config-manager';

export interface OpenAICompatProxyRoutingConfig {
  default?: string;
  background?: string;
  think?: string;
  longContext?: string;
  webSearch?: string;
  longContextThreshold?: number;
}

interface RoutingConfigCacheEntry {
  activePath: string;
  activeFingerprint: string;
  legacyPath: string;
  legacyFingerprint: string;
  config: OpenAICompatProxyRoutingConfig;
}

const MAX_CACHE_ENTRIES = 16;
const routingConfigCache = new Map<string, RoutingConfigCacheEntry>();

function getFileFingerprint(filePath: string): string {
  try {
    const stats = fs.statSync(filePath, { bigint: true });
    return `${stats.mtimeNs}:${stats.size}`;
  } catch {
    return 'missing';
  }
}

export function invalidateOpenAICompatProxyRoutingCache(): void {
  routingConfigCache.clear();
}

function readRawConfigObject(configPath: string): Record<string, unknown> | null {
  if (!fs.existsSync(configPath)) {
    return null;
  }

  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed =
    configPath.endsWith('.yaml') || configPath.endsWith('.yml') ? yaml.load(raw) : JSON.parse(raw);
  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
}

function normalizeRoutingConfig(value: unknown): OpenAICompatProxyRoutingConfig {
  if (typeof value !== 'object' || value === null) {
    return {};
  }

  const config = value as Record<string, unknown>;
  return {
    default:
      typeof config.default === 'string' && config.default.trim()
        ? config.default.trim()
        : undefined,
    background:
      typeof config.background === 'string' && config.background.trim()
        ? config.background.trim()
        : undefined,
    think:
      typeof config.think === 'string' && config.think.trim() ? config.think.trim() : undefined,
    longContext:
      typeof config.longContext === 'string' && config.longContext.trim()
        ? config.longContext.trim()
        : undefined,
    webSearch:
      typeof config.webSearch === 'string' && config.webSearch.trim()
        ? config.webSearch.trim()
        : undefined,
    longContextThreshold:
      typeof config.longContextThreshold === 'number' &&
      Number.isFinite(config.longContextThreshold)
        ? config.longContextThreshold
        : undefined,
  };
}

function resolveUncachedRoutingConfig(
  activePath: string,
  legacyPath: string
): OpenAICompatProxyRoutingConfig {
  const rawConfig = readRawConfigObject(activePath);
  if (rawConfig?.proxy && typeof rawConfig.proxy === 'object') {
    return normalizeRoutingConfig((rawConfig.proxy as Record<string, unknown>).routing);
  }

  if (legacyPath !== activePath) {
    const legacyConfig = readRawConfigObject(legacyPath);
    if (legacyConfig?.proxy && typeof legacyConfig.proxy === 'object') {
      return normalizeRoutingConfig((legacyConfig.proxy as Record<string, unknown>).routing);
    }
  }

  return {};
}

export function loadOpenAICompatProxyRoutingConfig(): OpenAICompatProxyRoutingConfig {
  const cacheKey = getCcsDir();
  const activePath = getActiveConfigPath();
  const legacyPath = getConfigPath();
  const activeFingerprint = getFileFingerprint(activePath);
  const legacyFingerprint =
    legacyPath === activePath ? activeFingerprint : getFileFingerprint(legacyPath);

  const cached = routingConfigCache.get(cacheKey);
  if (
    cached &&
    cached.activePath === activePath &&
    cached.activeFingerprint === activeFingerprint &&
    cached.legacyPath === legacyPath &&
    cached.legacyFingerprint === legacyFingerprint
  ) {
    return { ...cached.config };
  }

  const resolved = resolveUncachedRoutingConfig(activePath, legacyPath);
  if (routingConfigCache.size >= MAX_CACHE_ENTRIES && !routingConfigCache.has(cacheKey)) {
    const oldestKey = routingConfigCache.keys().next().value;
    if (oldestKey !== undefined) {
      routingConfigCache.delete(oldestKey);
    }
  }
  routingConfigCache.set(cacheKey, {
    activePath,
    activeFingerprint,
    legacyPath,
    legacyFingerprint,
    config: resolved,
  });

  return { ...resolved };
}
