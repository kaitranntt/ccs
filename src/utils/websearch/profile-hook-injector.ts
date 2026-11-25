/**
 * Profile Hook Injector
 *
 * Injects the legacy WebSearch compatibility hook into per-profile settings files.
 * The first-class runtime now uses the CCS-managed MCP server; these hooks remain
 * for compatibility and migration safety only.
 *
 * @module utils/websearch/profile-hook-injector
 */

import * as fs from 'fs';
import { info, warn } from '../ui';
import { getWebSearchHookConfig, getHookPath, removeHookConfig } from './hook-config';
import { isCcsWebSearchHook, deduplicateCcsHooks } from './hook-utils';
import { getMigrationMarkerPath, installWebSearchHook } from './hook-installer';
import { getWebSearchConfig } from '../../config/config-loader-facade';
import { ProfileError } from '../../errors/error-types';
import {
  ensureHookMigrationMarker,
  ensurePreToolUseProfileHook,
  getProfileSettingsPath,
} from '../../shared/profile-hook-injector';

// Valid profile name pattern (alphanumeric, dash, underscore only)
const VALID_PROFILE_NAME = /^[a-zA-Z0-9_-]+$/;

function hasUsableHookBinary(): boolean {
  try {
    const hookPath = getHookPath();
    const stat = fs.statSync(hookPath);
    if (!stat.isFile()) {
      return false;
    }

    fs.accessSync(hookPath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Migrate CCS hook from global settings to profile settings (one-time)
 */
function migrateGlobalHook(): void {
  ensureHookMigrationMarker(getMigrationMarkerPath(), {
    beforeCreate: () => {
      const removed = removeHookConfig();
      if (removed && process.env.CCS_DEBUG) {
        console.error(info('Migrated WebSearch hook from global settings'));
      }
    },
    onError: (error) => {
      if (process.env.CCS_DEBUG) {
        console.error(warn(`Migration failed: ${error.message}`));
      }
    },
  });
}

/**
 * Ensure the legacy WebSearch compatibility hook is configured in a profile's
 * settings file when that path is still needed.
 *
 * @param profileName - Name of the profile (e.g., 'agy', 'gemini', 'glm')
 * @returns true if hook is configured (existing or newly added)
 */
export function ensureProfileHooks(profileName: string): boolean {
  try {
    // Validate profile name to prevent path traversal
    if (!VALID_PROFILE_NAME.test(profileName)) {
      if (process.env.CCS_DEBUG) {
        console.error(warn(`Invalid profile name: ${profileName}`));
      }
      return false;
    }

    const wsConfig = getWebSearchConfig();

    // Skip if WebSearch is disabled
    if (!wsConfig.enabled) {
      return false;
    }

    // Keep the injected command target valid for all profile types, not just CLIProxy.
    // The installer already skips byte-identical copies, so we can always attempt a refresh
    // without rewriting unchanged hooks. Re-check existence after a failed install to tolerate
    // concurrent first-run installs that may have completed in another process.
    if (!installWebSearchHook() && !hasUsableHookBinary()) {
      if (process.env.CCS_DEBUG) {
        console.error(warn('WebSearch hook binary is missing and could not be installed'));
      }
      return false;
    }

    // One-time migration from global settings
    migrateGlobalHook();

    return ensurePreToolUseProfileHook({
      profileName,
      settingsPath: getProfileSettingsPath(profileName),
      matcher: 'WebSearch',
      commandPathFragment: '.ccs/hooks/websearch-transformer',
      expectedHookPath: getHookPath(),
      getHookConfig: getWebSearchHookConfig,
      isHookEntry: isCcsWebSearchHook,
      deduplicateHooks: deduplicateCcsHooks,
      compareExistingOnDeduplicate: true,
      onMalformed: (parseError) => {
        if (process.env.CCS_DEBUG) {
          console.error(warn(`Malformed ${profileName}.settings.json: ${parseError.message}`));
        }
      },
      onDeduplicated: () => {
        if (process.env.CCS_DEBUG) {
          console.error(
            info(`Removed duplicate WebSearch hooks from ${profileName}.settings.json`)
          );
        }
      },
      onAdded: () => {
        if (process.env.CCS_DEBUG) {
          console.error(info(`Added WebSearch hook to ${profileName}.settings.json`));
        }
      },
      onTimeoutUpdated: () => {
        if (process.env.CCS_DEBUG) {
          console.error(info('Updated WebSearch hook timeout in profile settings'));
        }
      },
      onTimeoutError: (error) => {
        if (process.env.CCS_DEBUG) {
          console.error(warn(`updateHookTimeoutIfNeeded failed: ${error.message}`));
        }
      },
    });
  } catch (error) {
    if (process.env.CCS_DEBUG) {
      console.error(warn(`Failed to inject hook: ${(error as Error).message}`));
    }
    return false;
  }
}

export function ensureProfileHooksOrThrow(profileName: string): void {
  const wsConfig = getWebSearchConfig();
  if (!wsConfig.enabled) {
    return;
  }

  if (!ensureProfileHooks(profileName)) {
    throw new ProfileError(
      `WebSearch is enabled, but CCS could not prepare the profile hook for "${profileName}".`,
      profileName
    );
  }
}
