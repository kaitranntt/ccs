/**
 * Preset Utilities
 * Shared functions for applying default presets to provider settings
 */

import type { CliproxyProviderCatalog } from './api-client';
import { MODEL_CATALOGS } from './model-catalogs';
import { buildUiCatalogs } from './model-catalogs';
import { CLIPROXY_DEFAULT_PORT } from './default-ports';
export { CLIPROXY_DEFAULT_PORT } from './default-ports';

/** Default fallback API key if fetch fails */
const DEFAULT_API_KEY = 'ccs-internal-managed';

/**
 * Fetch effective API key from backend
 * Falls back to default if fetch fails
 */
async function fetchEffectiveApiKey(): Promise<string> {
  try {
    const response = await fetch('/api/settings/auth/tokens/raw');
    if (!response.ok) return DEFAULT_API_KEY;
    const data = await response.json();
    return data?.apiKey?.value ?? DEFAULT_API_KEY;
  } catch {
    return DEFAULT_API_KEY;
  }
}

async function fetchProviderCatalog(provider: string, catalog?: CliproxyProviderCatalog) {
  if (catalog) {
    return catalog;
  }

  try {
    const response = await fetch('/api/cliproxy/catalog');
    if (!response.ok) {
      return MODEL_CATALOGS[provider];
    }

    const data = (await response.json()) as {
      catalogs?: Partial<Record<string, (typeof MODEL_CATALOGS)[string]>>;
    };
    return buildUiCatalogs(data.catalogs)[provider] ?? MODEL_CATALOGS[provider];
  } catch {
    return MODEL_CATALOGS[provider];
  }
}

/**
 * Check whether the provider already has a settings file.
 * Returns null when existence cannot be determined (callers must not write).
 */
async function providerSettingsExist(provider: string): Promise<boolean | null> {
  try {
    const response = await fetch(`/api/settings/${provider}`);
    if (response.status === 404) return false;
    return response.ok ? true : null;
  } catch {
    return null;
  }
}

/**
 * Apply default preset for a provider to its settings
 * Uses the catalog default model's preset mapping or falls back to using defaultModel for all tiers
 *
 * Only seeds a missing settings file. The PUT replaces the whole file, so writing over an
 * existing one would drop the user's models, env keys and other settings.
 *
 * The claude built-in provider is model-neutral: its settings carry no model pins so Claude
 * Code's own /model selection applies. The CLI creates its transport-only settings on launch.
 *
 * @param provider - The provider ID (e.g., 'gemini', 'codex', 'agy')
 * @param port - Optional custom port (defaults to CLIPROXY_DEFAULT_PORT)
 * @returns Object with success status and applied preset name (no presetName when skipped)
 */
export async function applyDefaultPreset(
  provider: string,
  port?: number,
  catalog?: CliproxyProviderCatalog
): Promise<{ success: boolean; presetName?: string; skipped?: boolean }> {
  if (provider === 'claude') return { success: true, skipped: true };

  const settingsExist = await providerSettingsExist(provider);
  if (settingsExist === null) return { success: false };
  if (settingsExist) return { success: true, skipped: true };

  const resolvedCatalog = await fetchProviderCatalog(provider, catalog);
  if (!resolvedCatalog) return { success: false };

  const defaultModelEntry =
    resolvedCatalog.models.find((model) => model.id === resolvedCatalog.defaultModel) ||
    resolvedCatalog.models[0];
  const selectedModelId = defaultModelEntry?.id ?? resolvedCatalog.defaultModel;
  const mapping = defaultModelEntry?.presetMapping || {
    default: selectedModelId,
    opus: selectedModelId,
    sonnet: selectedModelId,
    haiku: selectedModelId,
  };

  // Fetch effective API key (respects user customization)
  const effectiveApiKey = await fetchEffectiveApiKey();

  const effectivePort = port ?? CLIPROXY_DEFAULT_PORT;
  const settings = {
    env: {
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${effectivePort}/api/provider/${provider}`,
      ANTHROPIC_AUTH_TOKEN: effectiveApiKey,
      ANTHROPIC_MODEL: mapping.default,
      ANTHROPIC_DEFAULT_OPUS_MODEL: mapping.opus,
      ANTHROPIC_DEFAULT_SONNET_MODEL: mapping.sonnet,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: mapping.haiku,
    },
  };

  try {
    const res = await fetch(`/api/settings/${provider}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings }),
    });
    return {
      success: res.ok,
      presetName: defaultModelEntry?.name || resolvedCatalog.defaultModel,
    };
  } catch {
    return { success: false };
  }
}
