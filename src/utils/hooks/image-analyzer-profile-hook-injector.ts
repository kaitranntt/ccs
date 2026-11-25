/**
 * Image Analyzer Profile Hook Injector
 *
 * Injects image analyzer hooks into per-profile settings files.
 * This replaces the global ~/.claude/settings.json approach.
 *
 * Injects for profiles that resolve to a supported image-analysis backend.
 *
 * @module utils/hooks/image-analyzer-profile-injector
 */

import * as path from 'path';
import { info, warn } from '../ui';
import {
  getImageAnalyzerHookConfig,
  getImageAnalyzerHookPath,
} from './image-analyzer-hook-configuration';
import {
  deduplicateCcsImageAnalyzerHooks,
  isCcsImageAnalyzerHook,
  removeCcsImageAnalyzerHooks,
} from './image-analyzer-hook-utils';
import { getCcsDir } from '../../shared/ccs-paths';
import {
  ensureHookMigrationMarker,
  ensurePreToolUseProfileHook,
  getProfileSettingsPath,
  hasProfilePreToolUseHook,
  removeHookMigrationMarker,
  removeProfilePreToolUseHooks,
} from '../../shared/profile-hook-injector';
import {
  resolveImageAnalysisStatus,
  type ImageAnalysisResolutionContext,
} from './image-analysis-backend-resolver';
import { getImageAnalysisConfig } from '../../config/config-loader-facade';

// Valid profile name pattern (alphanumeric, dot, dash, underscore only)
const VALID_PROFILE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/**
 * Get migration marker path (respects CCS_HOME for test isolation)
 */
function getMigrationMarkerPath(): string {
  return path.join(getCcsDir(), '.image-analyzer-hook-migrated');
}

export function getImageAnalysisProfileSettingsPath(
  profileName: string,
  settingsPath?: string | null
): string {
  return getProfileSettingsPath(profileName, settingsPath);
}

export function hasImageAnalysisProfileHook(
  profileName: string,
  settingsPath?: string | null
): boolean {
  return hasProfilePreToolUseHook(
    profileName,
    settingsPath,
    VALID_PROFILE_NAME,
    isCcsImageAnalyzerHook
  );
}

export function removeImageAnalysisProfileHook(
  profileName: string,
  settingsPath?: string | null
): boolean {
  return removeProfilePreToolUseHooks(
    profileName,
    settingsPath,
    VALID_PROFILE_NAME,
    removeCcsImageAnalyzerHooks,
    (resolvedSettingsPath) => {
      if (process.env.CCS_DEBUG) {
        console.error(
          info(`Removed image analyzer hook from ${path.basename(resolvedSettingsPath)}`)
        );
      }
    }
  );
}

/**
 * One-time migration marker management
 */
function migrateGlobalHook(): void {
  ensureHookMigrationMarker(getMigrationMarkerPath(), {
    onError: (error) => {
      if (process.env.CCS_DEBUG) {
        console.error(warn(`Migration failed: ${error.message}`));
      }
    },
  });
}

/**
 * Ensure image analyzer hook is configured in profile's settings file
 *
 * @param input - Profile name or pre-resolved runtime context
 * @returns true if hook is configured (existing or newly added)
 */
export function ensureProfileHooks(input: string | ImageAnalysisResolutionContext): boolean {
  try {
    const context = typeof input === 'string' ? { profileName: input } : input;
    const profileName = context.profileName;

    // Validate profile name to prevent path traversal
    if (!VALID_PROFILE_NAME.test(profileName)) {
      if (process.env.CCS_DEBUG) {
        console.error(warn(`Invalid profile name: ${profileName}`));
      }
      return false;
    }

    const imageConfig = getImageAnalysisConfig();
    const status = resolveImageAnalysisStatus(context, imageConfig);
    if (!status.supported || !status.shouldPersistHook) {
      return false;
    }

    if (context.sharedHookInstalled === false) {
      return false;
    }

    // One-time migration marker
    migrateGlobalHook();

    return ensurePreToolUseProfileHook({
      profileName,
      settingsPath: getImageAnalysisProfileSettingsPath(profileName, context.settingsPath),
      matcher: 'Read',
      commandPathFragment: '.ccs/hooks/image-analyzer-transformer',
      expectedHookPath: getImageAnalyzerHookPath(),
      getHookConfig: getImageAnalyzerHookConfig,
      isHookEntry: isCcsImageAnalyzerHook,
      deduplicateHooks: deduplicateCcsImageAnalyzerHooks,
      onMalformed: (parseError) => {
        if (process.env.CCS_DEBUG) {
          console.error(warn(`Malformed ${profileName}.settings.json: ${parseError.message}`));
        }
      },
      onAdded: () => {
        if (process.env.CCS_DEBUG) {
          console.error(info(`Added image analyzer hook to ${profileName}.settings.json`));
        }
      },
      onTimeoutUpdated: () => {
        if (process.env.CCS_DEBUG) {
          console.error(info('Updated image analyzer hook timeout in profile settings'));
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

/**
 * Remove migration marker (called during uninstall)
 */
export function removeMigrationMarker(): void {
  removeHookMigrationMarker(getMigrationMarkerPath(), (error) => {
    if (process.env.CCS_DEBUG) {
      console.error(warn(`removeMigrationMarker failed: ${error.message}`));
    }
  });
}
