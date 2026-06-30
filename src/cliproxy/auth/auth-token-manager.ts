/**
 * Auth Token Manager for CLIProxyAPI
 *
 * Manages API key and management secret resolution with inheritance:
 * - Per-variant override → Global config → Default constants
 *
 * Provides secure token generation for user customization.
 */

import { randomBytes } from 'crypto';

import { CCS_INTERNAL_API_KEY, CCS_CONTROL_PANEL_SECRET } from '../config/generator';
import { loadOrCreateUnifiedConfig, mutateConfig } from '../../config/config-loader-facade';
import { ProfileError } from '../../errors/error-types';

/**
 * Generate a cryptographically secure token.
 * Uses CSPRNG (crypto.randomBytes) for proper entropy.
 *
 * @param length - Number of random bytes (default: 32 = 256-bit entropy)
 * @returns Base64URL-encoded token (43 chars for 32 bytes)
 */
export function generateSecureToken(length = 32): string {
  return randomBytes(length).toString('base64url');
}

/**
 * Mask a token for display.
 * Shows first 4 and last 4 chars: "ccs_...4f2a"
 * Used by CLI commands and API routes.
 */
export function maskToken(token: string): string {
  if (token.length <= 8) return '****';
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

/**
 * Get effective API key with inheritance chain.
 * Priority: variant auth → global cliproxy.auth → default constant
 *
 * @param variantName - Optional variant name for per-variant override
 * @returns Resolved API key
 */
export function getEffectiveApiKey(variantName?: string): string {
  const config = loadOrCreateUnifiedConfig();

  // Priority 1: Per-variant override
  if (variantName) {
    const variant = config.cliproxy.variants[variantName];
    if (variant?.auth?.api_key) {
      return variant.auth.api_key;
    }
  }

  // Priority 2: Global cliproxy.auth
  if (config.cliproxy.auth?.api_key) {
    return config.cliproxy.auth.api_key;
  }

  // Priority 3: Default constant (backwards compatible)
  return CCS_INTERNAL_API_KEY;
}

/**
 * Get effective management secret.
 * Priority: global cliproxy.auth → default constant
 *
 * Note: Management secret is global-only (no per-variant override)
 * as it controls the Control Panel access for the entire CLIProxy instance.
 *
 * @returns Resolved management secret
 */
export function getEffectiveManagementSecret(): string {
  const config = loadOrCreateUnifiedConfig();

  // Priority 1: Global cliproxy.auth
  if (config.cliproxy.auth?.management_secret) {
    return config.cliproxy.auth.management_secret;
  }

  // Priority 2: Default constant (backwards compatible)
  return CCS_CONTROL_PANEL_SECRET;
}

/**
 * Set global API key.
 * Updates cliproxy.auth.api_key in config.yaml.
 *
 * @param apiKey - New API key (or undefined to reset to default)
 */
export function setGlobalApiKey(apiKey: string | undefined): void {
  mutateConfig((config) => {
    if (!config.cliproxy.auth) {
      config.cliproxy.auth = {};
    }

    if (apiKey === undefined) {
      delete config.cliproxy.auth.api_key;
    } else {
      config.cliproxy.auth.api_key = apiKey;
    }
  });
}

/**
 * Set global management secret.
 * Updates cliproxy.auth.management_secret in config.yaml.
 *
 * @param secret - New management secret (or undefined to reset to default)
 */
export function setGlobalManagementSecret(secret: string | undefined): void {
  mutateConfig((config) => {
    if (!config.cliproxy.auth) {
      config.cliproxy.auth = {};
    }

    if (secret === undefined) {
      delete config.cliproxy.auth.management_secret;
    } else {
      config.cliproxy.auth.management_secret = secret;
    }
  });
}

/**
 * Set per-variant API key override.
 * Updates variants[variantName].auth.api_key in config.yaml.
 *
 * @param variantName - Variant name
 * @param apiKey - New API key (or undefined to remove override)
 */
export function setVariantApiKey(variantName: string, apiKey: string | undefined): void {
  mutateConfig((config) => {
    const variant = config.cliproxy.variants[variantName];

    if (!variant) {
      throw new ProfileError(`Variant '${variantName}' not found`, variantName);
    }

    if (!variant.auth) {
      variant.auth = {};
    }

    if (apiKey === undefined) {
      delete variant.auth.api_key;
      if (Object.keys(variant.auth).length === 0) {
        delete variant.auth;
      }
    } else {
      variant.auth.api_key = apiKey;
    }
  });
}

/**
 * Reset all auth settings to defaults.
 * Removes cliproxy.auth and all variant auth overrides.
 */
export function resetAuthToDefaults(): void {
  mutateConfig((config) => {
    delete config.cliproxy.auth;

    for (const variantName of Object.keys(config.cliproxy.variants)) {
      const variant = config.cliproxy.variants[variantName];
      if (variant.auth) {
        delete variant.auth;
      }
    }
  });
}

/**
 * Get auth configuration summary for display.
 * Returns current effective values and whether they're customized.
 */
export function getAuthSummary(): {
  apiKey: { value: string; isCustom: boolean };
  managementSecret: { value: string; isCustom: boolean };
} {
  const config = loadOrCreateUnifiedConfig();

  const customApiKey = config.cliproxy.auth?.api_key;
  const customSecret = config.cliproxy.auth?.management_secret;

  return {
    apiKey: {
      value: customApiKey || CCS_INTERNAL_API_KEY,
      isCustom: !!customApiKey,
    },
    managementSecret: {
      value: customSecret || CCS_CONTROL_PANEL_SECRET,
      isCustom: !!customSecret,
    },
  };
}
