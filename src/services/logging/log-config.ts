import * as fs from 'fs';
import { DEFAULT_LOGGING_CONFIG } from '../../config/unified-config-types';

import type { LoggingConfig } from './log-types';
import {
  getConfigYamlPath,
  getLoggingConfig as getUnifiedLoggingConfig,
} from '../../config/config-loader-facade';

const CACHE_RECHECK_MS = 1000;
let cachedConfig: LoggingConfig = { ...DEFAULT_LOGGING_CONFIG };
let cachedConfigPath: string | null = null;
let cachedMtimeMs: number | null = null;
let lastCheckedAt = 0;

export function invalidateLoggingConfigCache(): void {
  cachedConfig = { ...DEFAULT_LOGGING_CONFIG };
  cachedConfigPath = null;
  cachedMtimeMs = null;
  lastCheckedAt = 0;
}

function readConfigMtimeMs(configPath: string): number | null {
  try {
    return fs.statSync(configPath).mtimeMs;
  } catch {
    return null;
  }
}

export function getResolvedLoggingConfig(): LoggingConfig {
  const now = Date.now();
  const configPath = getConfigYamlPath();
  if (cachedConfigPath === configPath && now - lastCheckedAt < CACHE_RECHECK_MS) {
    return cachedConfig;
  }

  try {
    const nextMtimeMs = readConfigMtimeMs(configPath);
    if (cachedConfigPath === configPath && nextMtimeMs === cachedMtimeMs) {
      lastCheckedAt = now;
      return cachedConfig;
    }

    cachedConfig = {
      ...DEFAULT_LOGGING_CONFIG,
      ...getUnifiedLoggingConfig(),
    };
    cachedConfigPath = configPath;
    cachedMtimeMs = nextMtimeMs;
    lastCheckedAt = now;
    return cachedConfig;
  } catch {
    cachedConfig = { ...DEFAULT_LOGGING_CONFIG };
    cachedConfigPath = configPath;
    cachedMtimeMs = null;
    lastCheckedAt = now;
    return cachedConfig;
  }
}
