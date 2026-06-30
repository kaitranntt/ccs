/**
 * Unified Config Loader — orchestrator
 *
 * Loads and saves the unified YAML configuration.
 * Provides fallback to legacy JSON format for backward compatibility.
 *
 * Phase 1-6 refactor (issue #1164):
 *   Phase 1 → src/config/loader/io-locks.ts
 *   Phase 2 → src/config/loader/normalizers.ts
 *   Phase 3 → src/config/loader/yaml-serializer.ts
 *   Phase 4 → src/config/loader/defaults-merger.ts
 *   Phase 5 → src/config/loader/config-getters.ts
 *
 * This file re-exports the full public API so all existing import sites
 * continue to work without modification.
 */

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import {
  isUnifiedConfig,
  createEmptyUnifiedConfig,
  UNIFIED_CONFIG_VERSION,
} from './unified-config-types';
import type { UnifiedConfig } from './unified-config-types';
import { isUnifiedConfigEnabled } from './feature-flags';

// loadUnifiedConfig() runs several times per invocation (startup migration check,
// first-time-install check, command handler, doctor checks). A corrupt config.yaml
// must report its parse error ONCE, not once per call. Track paths already warned
// so repeated loads in the same process stay quiet.
const warnedCorruptConfigPaths = new Set<string>();

// ---------------------------------------------------------------------------
// Phase 1 re-exports: io-locks
// ---------------------------------------------------------------------------

export {
  CONFIG_YAML,
  CONFIG_JSON,
  CONFIG_LOCK,
  LOCK_STALE_MS,
  GO_DURATION_SEGMENT,
  GO_DURATION_PATTERN,
  getConfigYamlPath,
  getConfigJsonPath,
  acquireLock,
  releaseLock,
  hasUnifiedConfig,
  hasLegacyConfig,
  sleepSync,
  withConfigWriteLock,
} from './loader/io-locks';
import {
  getConfigYamlPath,
  hasUnifiedConfig,
  hasLegacyConfig,
  withConfigWriteLock,
  loadUnifiedConfigWithLockHeld,
  writeUnifiedConfigWithLockHeld,
} from './loader/io-locks';

// ---------------------------------------------------------------------------
// Phase 2 re-exports: normalizers
// ---------------------------------------------------------------------------

export {
  normalizeBrowserDevtoolsPort,
  normalizeBrowserPolicy,
  normalizeBrowserEvalMode,
  canonicalizeBrowserConfig,
  normalizeSessionAffinityTtl,
  hasPositiveDuration,
  validateCompositeVariants,
  normalizeContinuityInheritanceMap,
  normalizeContinuityConfig,
  normalizeOfficialChannelsConfig,
} from './loader/normalizers';
import { canonicalizeBrowserConfig, validateCompositeVariants } from './loader/normalizers';

// ---------------------------------------------------------------------------
// Phase 3 re-exports: yaml-serializer
// ---------------------------------------------------------------------------

export { generateYamlHeader, generateYamlWithComments } from './loader/yaml-serializer';
import { generateYamlHeader, generateYamlWithComments } from './loader/yaml-serializer';

// ---------------------------------------------------------------------------
// Phase 4 re-exports: defaults-merger
// ---------------------------------------------------------------------------

export { mergeWithDefaults } from './loader/defaults-merger';
import { mergeWithDefaults } from './loader/defaults-merger';

// ---------------------------------------------------------------------------
// Phase 5 re-exports: config-getters
// ---------------------------------------------------------------------------

export type { GeminiWebSearchInfo } from './loader/config-getters';
export {
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
  hasExplicitClaudeBrowserDevtoolsPort,
  getImageAnalysisConfig,
  getLoggingConfig,
  getCursorConfig,
} from './loader/config-getters';

// ---------------------------------------------------------------------------
// getConfigFormat
// ---------------------------------------------------------------------------

/**
 * Determine which config format is active.
 * Returns 'yaml' if unified config exists or is enabled,
 * 'json' if only legacy config exists,
 * 'none' if no config exists.
 */
export function getConfigFormat(): 'yaml' | 'json' | 'none' {
  if (hasUnifiedConfig()) return 'yaml';
  if (isUnifiedConfigEnabled()) return 'yaml';
  if (hasLegacyConfig()) return 'json';
  return 'none';
}

// ---------------------------------------------------------------------------
// Core load / save / mutate
// ---------------------------------------------------------------------------

/**
 * Load unified config from YAML file.
 * Returns null if file doesn't exist.
 * Auto-upgrades config if version is outdated (regenerates comments).
 */
export function loadUnifiedConfig(): UnifiedConfig | null {
  const yamlPath = getConfigYamlPath();

  if (!fs.existsSync(yamlPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(yamlPath, 'utf8');
    const parsed = yaml.load(content);

    if (!isUnifiedConfig(parsed)) {
      throw new Error(`Invalid config format in ${yamlPath}`);
    }

    // Auto-upgrade if version is outdated (regenerates YAML with new comments and fields)
    if ((parsed.version ?? 1) < UNIFIED_CONFIG_VERSION) {
      const upgraded = mergeWithDefaults(parsed);
      upgraded.version = UNIFIED_CONFIG_VERSION;
      try {
        saveUnifiedConfig(upgraded);
        if (process.env.CCS_DEBUG) {
          console.error(`[i] Config upgraded to v${UNIFIED_CONFIG_VERSION}`);
        }
        return upgraded;
      } catch (saveError) {
        console.error('[!] Config upgrade failed to save:', (saveError as Error).message);
        // Continue using the upgraded version in-memory even if save fails
      }
    }

    return parsed;
  } catch (err) {
    // U3: Provide better context for YAML syntax errors. Print at most once per
    // path per process so repeated loads of a corrupt file do not spam the error.
    const alreadyWarned = warnedCorruptConfigPaths.has(yamlPath);
    if (!alreadyWarned) {
      warnedCorruptConfigPaths.add(yamlPath);
      if (err instanceof yaml.YAMLException) {
        const mark = err.mark;
        console.error(`[X] YAML syntax error in ${yamlPath}:`);
        console.error(
          `    Line ${(mark?.line ?? 0) + 1}, Column ${(mark?.column ?? 0) + 1}: ${err.reason || 'Invalid syntax'}`
        );
        if (mark?.snippet) {
          console.error(`    ${mark.snippet}`);
        }
        console.error(
          `    Tip: Check for missing colons, incorrect indentation, or unquoted special characters.`
        );
      } else {
        const error = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[X] Failed to load config: ${error}`);
      }
    }
    throw err;
  }
}

/**
 * Load config, preferring YAML if available, falling back to creating empty config.
 * Merges with defaults to ensure all sections exist.
 */
export function loadOrCreateUnifiedConfig(): UnifiedConfig {
  // Read-only: "create" means an in-memory default object when config.yaml is
  // absent. This never writes to disk, so callers on legacy installs can use
  // it for read paths without implicitly creating config.yaml.
  const existing = loadUnifiedConfig();
  if (existing) {
    const merged = mergeWithDefaults(existing);
    validateCompositeVariants(merged);
    return merged;
  }
  return createEmptyUnifiedConfig();
}

/**
 * Save unified config to YAML file.
 * Uses atomic write (temp file + rename) to prevent corruption.
 * Uses lockfile to prevent concurrent writes.
 */
export function saveUnifiedConfig(config: UnifiedConfig): void {
  withConfigWriteLock(() => {
    writeUnifiedConfigWithLockHeld(config, generateYamlHeader, generateYamlWithComments);
  });
}

/**
 * Atomically mutate unified config with lock held across read-modify-write.
 * Prevents stale writes from overwriting concurrent updates.
 */
export function mutateUnifiedConfig(mutator: (config: UnifiedConfig) => void): UnifiedConfig {
  return withConfigWriteLock(() => {
    const current = loadUnifiedConfigWithLockHeld(mergeWithDefaults, validateCompositeVariants);
    const previousBrowser = current.browser
      ? canonicalizeBrowserConfig(current.browser)
      : undefined;
    mutator(current);
    if (current.browser) {
      current.browser = canonicalizeBrowserConfig(current.browser, previousBrowser);
    }
    writeUnifiedConfigWithLockHeld(current, generateYamlHeader, generateYamlWithComments);
    return current;
  });
}

/**
 * Update unified config with partial data.
 * Loads existing config, merges changes, and saves.
 */
export function updateUnifiedConfig(updates: Partial<UnifiedConfig>): UnifiedConfig {
  return mutateUnifiedConfig((config) => {
    Object.assign(config, updates);
  });
}

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

/**
 * Check if unified config mode is active.
 * Returns true if config.yaml exists OR CCS_UNIFIED_CONFIG=1.
 */
export function isUnifiedMode(): boolean {
  return hasUnifiedConfig() || isUnifiedConfigEnabled();
}

/**
 * Get default profile name from config.
 */
export function getDefaultProfile(): string | undefined {
  const config = loadUnifiedConfig();
  return config?.default;
}

/**
 * Set default profile name in config.
 */
export function setDefaultProfile(name: string): void {
  updateUnifiedConfig({ default: name });
}
