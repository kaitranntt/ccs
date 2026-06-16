/**
 * Config Loader Facade
 *
 * Single import path for all config loading operations.
 * Re-exports read-only functions from unified-config-loader and config-manager,
 * and provides cache-coherent write wrappers that keep the memoization cache in sync.
 *
 * IMPORTANT:
 * - Raw write functions (saveUnifiedConfig, mutateUnifiedConfig,
 *   updateUnifiedConfig) are NOT re-exported here. Use the cache-coherent
 *   wrappers (saveConfig, mutateConfig, updateConfig) instead.
 * - `loadOrCreateUnifiedConfig` and `loadUnifiedConfig` are re-exported as
 *   uncached reads. If you need cached reads, use `getCachedConfig()`.
 *   If you use an uncached read followed by a write outside this facade,
 *   call `invalidateConfigCache()` to keep the cache coherent.
 *
 * Usage:
 *   import { getCachedConfig, saveConfig, mutateConfig } from '../config/config-loader-facade';
 *   import { getCcsDir, loadSettings } from '../config/config-loader-facade';
 */

// Re-export read-only functions from unified-config-loader
export {
  loadUnifiedConfig,
  loadOrCreateUnifiedConfig,
  getConfigYamlPath,
  getConfigJsonPath,
  hasUnifiedConfig,
  hasLegacyConfig,
  getConfigFormat,
  isUnifiedMode,
  getDefaultProfile,
  setDefaultProfile,
  getWebSearchConfig,
  getGlobalEnvConfig,
  getOutputLimitsEnv,
  getContinuityInheritanceMap,
  getCliproxySafetyConfig,
  getThinkingConfig,
  getOfficialChannelsConfig,
  isDashboardAuthEnabled,
  getDashboardAuthConfig,
  getBrowserConfig,
  getImageAnalysisConfig,
  getLoggingConfig,
  getCursorConfig,
} from './unified-config-loader';

// Re-export types from unified-config-loader
export type { GeminiWebSearchInfo } from './unified-config-loader';

// Re-export selected functions from config-manager
export { loadSettings, loadConfigSafe, readConfig, getCcsDir } from '../utils/config-manager';

// Internal imports for memoization wrappers
import { statSync } from 'fs';
import type { UnifiedConfig } from './unified-config-types';
import {
  loadOrCreateUnifiedConfig as _loadOrCreateUnifiedConfig,
  saveUnifiedConfig as _saveUnifiedConfig,
  mutateUnifiedConfig as _mutateUnifiedConfig,
  updateUnifiedConfig as _updateUnifiedConfig,
  getConfigYamlPath as _getConfigYamlPath,
} from './unified-config-loader';

// ---------------------------------------------------------------------------
// Memoization cache with mtime-based staleness detection
// ---------------------------------------------------------------------------

let _configCache: UnifiedConfig | null = null;
let _cacheMtimeMs: number = 0;

function getConfigFileMtime(): number {
  try {
    return statSync(_getConfigYamlPath()).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Get the unified config with in-memory caching.
 * Checks file mtime on each call — if the config file was modified
 * externally (e.g. by code importing unified-config-loader directly),
 * the cache is automatically invalidated and re-read from disk.
 */
export function getCachedConfig(): UnifiedConfig {
  const currentMtime = getConfigFileMtime();
  if (!_configCache || currentMtime > _cacheMtimeMs) {
    _configCache = _loadOrCreateUnifiedConfig();
    _cacheMtimeMs = getConfigFileMtime();
  }
  return structuredClone(_configCache);
}

/**
 * Clear the memoization cache.
 * The next call to getCachedConfig() will re-read from disk.
 */
export function invalidateConfigCache(): void {
  _configCache = null;
  _cacheMtimeMs = 0;
}

/**
 * Save config to disk and update the cache.
 * Stores a deep copy to break the reference alias.
 */
export function saveConfig(config: UnifiedConfig): void {
  _saveUnifiedConfig(config);
  _configCache = structuredClone(config);
}

/**
 * Atomically mutate config (read-modify-write with lock) and invalidate cache.
 * Invalidated AFTER _mutateUnifiedConfig returns — if that throws, cache stays valid.
 */
export function mutateConfig(mutator: (config: UnifiedConfig) => void): UnifiedConfig {
  const result = _mutateUnifiedConfig(mutator);
  _configCache = null;
  return result;
}

/**
 * Partial-update config and invalidate cache.
 * Shorthand for mutateConfig with Object.assign.
 */
export function updateConfig(updates: Partial<UnifiedConfig>): UnifiedConfig {
  const result = _updateUnifiedConfig(updates);
  _configCache = null;
  return result;
}

/**
 * Get the current cache state (for diagnostics/testing).
 * Returns true if a cached config exists, false otherwise.
 */
export function hasCachedConfig(): boolean {
  return _configCache !== null;
}
