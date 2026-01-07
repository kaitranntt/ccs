/**
 * CLIProxy Variant Service
 *
 * Handles CRUD operations for CLIProxy variant profiles.
 * Supports both unified config (config.yaml) and legacy JSON format.
 */

import * as os from 'os';
import * as path from 'path';
import { CLIProxyProfileName } from '../../auth/profile-detector';
import { CLIProxyProvider } from '../types';
import { isReservedName, isWindowsReservedName } from '../../config/reserved-names';
import { isUnifiedMode } from '../../config/unified-config-loader';
import { deleteConfigForPort } from '../config-generator';
import { deleteSessionLockForPort } from '../session-tracker';
import {
  createSettingsFile,
  createSettingsFileUnified,
  deleteSettingsFile,
  getRelativeSettingsPath,
  updateSettingsModel,
} from './variant-settings';
import {
  VariantConfig,
  variantExistsInConfig,
  listVariantsFromConfig,
  saveVariantUnified,
  saveVariantLegacy,
  removeVariantFromUnifiedConfig,
  removeVariantFromLegacyConfig,
  getNextAvailablePort,
} from './variant-config-adapter';

// Re-export VariantConfig from adapter
export type { VariantConfig } from './variant-config-adapter';

/** Result of variant operations */
export interface VariantOperationResult {
  success: boolean;
  error?: string;
  variant?: VariantConfig;
  settingsPath?: string;
}

/**
 * Validate CLIProxy profile name
 */
export function validateProfileName(name: string): string | null {
  if (!name) {
    return 'Profile name is required';
  }
  if (!/^[a-zA-Z][a-zA-Z0-9._-]*$/.test(name)) {
    return 'Name must start with letter, contain only letters, numbers, dot, dash, underscore';
  }
  if (name.length > 32) {
    return 'Name must be 32 characters or less';
  }
  if (isReservedName(name)) {
    return `'${name}' is a reserved name`;
  }
  if (isWindowsReservedName(name)) {
    return `'${name}' is a Windows reserved device name and cannot be used`;
  }
  return null;
}

/**
 * Check if CLIProxy variant profile exists
 */
export function variantExists(name: string): boolean {
  return variantExistsInConfig(name);
}

/**
 * List all CLIProxy variants
 */
export function listVariants(): Record<string, VariantConfig> {
  return listVariantsFromConfig();
}

/**
 * Create a new CLIProxy variant
 */
export function createVariant(
  name: string,
  provider: CLIProxyProfileName,
  model: string,
  account?: string
): VariantOperationResult {
  try {
    // Allocate unique port for this variant
    const port = getNextAvailablePort();

    let settingsPath: string;

    if (isUnifiedMode()) {
      settingsPath = createSettingsFileUnified(name, provider, model, port);
      saveVariantUnified(
        name,
        provider as CLIProxyProvider,
        getRelativeSettingsPath(provider, name),
        account,
        port
      );
    } else {
      settingsPath = createSettingsFile(name, provider, model, port);
      saveVariantLegacy(name, provider, `~/.ccs/${path.basename(settingsPath)}`, account, port);
    }

    return {
      success: true,
      settingsPath,
      variant: { provider, model, account, port },
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Remove a CLIProxy variant
 */
export function removeVariant(name: string): VariantOperationResult {
  try {
    let variant: VariantConfig | null;

    if (isUnifiedMode()) {
      const unifiedVariant = removeVariantFromUnifiedConfig(name);
      if (unifiedVariant?.settings) {
        deleteSettingsFile(unifiedVariant.settings);
      }
      // Clean up port-specific config and session files
      if (unifiedVariant?.port) {
        deleteConfigForPort(unifiedVariant.port);
        deleteSessionLockForPort(unifiedVariant.port);
      }
      variant = unifiedVariant;
    } else {
      variant = removeVariantFromLegacyConfig(name);
      if (variant?.settings) {
        deleteSettingsFile(variant.settings);
      }
      // Clean up port-specific config and session files
      if (variant?.port) {
        deleteConfigForPort(variant.port);
        deleteSessionLockForPort(variant.port);
      }
    }

    if (!variant) {
      return { success: false, error: `Variant '${name}' not found` };
    }

    return { success: true, variant };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/** Update options for variant */
export interface UpdateVariantOptions {
  provider?: CLIProxyProfileName;
  account?: string;
  model?: string;
}

/**
 * Update an existing CLIProxy variant
 */
export function updateVariant(name: string, updates: UpdateVariantOptions): VariantOperationResult {
  try {
    const variants = listVariantsFromConfig();
    const existing = variants[name];

    if (!existing) {
      return { success: false, error: `Variant '${name}' not found` };
    }

    // Update model in settings file if provided
    if (updates.model !== undefined && existing.settings) {
      const settingsPath = existing.settings.replace(/^~/, os.homedir());
      updateSettingsModel(settingsPath, updates.model);
    }

    // Update config entry if provider or account changed
    if (updates.provider !== undefined || updates.account !== undefined) {
      const newProvider = updates.provider ?? existing.provider;
      const newAccount = updates.account !== undefined ? updates.account : existing.account;

      if (isUnifiedMode()) {
        saveVariantUnified(
          name,
          newProvider as CLIProxyProvider,
          existing.settings || '',
          newAccount || undefined,
          existing.port
        );
      } else {
        saveVariantLegacy(
          name,
          newProvider,
          existing.settings || '',
          newAccount || undefined,
          existing.port
        );
      }
    }

    return {
      success: true,
      variant: {
        provider: updates.provider ?? existing.provider,
        model: updates.model ?? existing.model,
        account: updates.account !== undefined ? updates.account : existing.account,
        port: existing.port,
        settings: existing.settings,
      },
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}
