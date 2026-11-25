/**
 * normalizers.ts
 *
 * Input normalization and validation helpers extracted from
 * unified-config-loader.ts (Phase 2 split — issue #1164).
 *
 * Contains: browser config normalizers, session affinity TTL normalizer,
 * composite variant validator, continuity config normalizer, and official
 * channels config normalizer.
 */

import { DEFAULT_BROWSER_CONFIG, DEFAULT_OFFICIAL_CHANNELS_CONFIG } from '../unified-config-types';
import type {
  UnifiedConfig,
  BrowserConfig,
  BrowserEvalMode,
  BrowserToolPolicy,
  OfficialChannelsConfig,
  OfficialChannelId,
  ContinuityConfig,
} from '../unified-config-types';
import { validateCompositeTiers } from '../../cliproxy/config/composite-validator';
import {
  isOfficialChannelId,
  normalizeOfficialChannelIds,
  resolveLegacyDiscordSelection,
} from '../../channels/official-channels-ids';
import { getRecommendedBrowserUserDataDir } from '../../shared/ccs-paths';
import { GO_DURATION_PATTERN, GO_DURATION_SEGMENT } from './io-locks';

// ---------------------------------------------------------------------------
// Browser normalizers
// ---------------------------------------------------------------------------

export function normalizeBrowserDevtoolsPort(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BROWSER_CONFIG.claude.devtools_port;
  }

  const port = Math.floor(value as number);
  if (port < 1 || port > 65535) {
    return DEFAULT_BROWSER_CONFIG.claude.devtools_port;
  }

  return port;
}

export function normalizeBrowserPolicy(value: string | undefined): BrowserToolPolicy {
  return value === 'auto' || value === 'manual' ? value : DEFAULT_BROWSER_CONFIG.claude.policy;
}

export function normalizeBrowserEvalMode(value: string | undefined): BrowserEvalMode {
  if (value === 'disabled' || value === 'readonly' || value === 'readwrite') {
    return value;
  }

  return DEFAULT_BROWSER_CONFIG.claude.eval_mode ?? 'readonly';
}

export function canonicalizeBrowserConfig(
  config?: BrowserConfig,
  fallback: BrowserConfig = DEFAULT_BROWSER_CONFIG
): BrowserConfig {
  const claudeUserDataDir =
    config?.claude?.user_data_dir === undefined
      ? fallback.claude.user_data_dir || getRecommendedBrowserUserDataDir()
      : config.claude.user_data_dir.trim() || getRecommendedBrowserUserDataDir();

  return {
    claude: {
      enabled: config?.claude?.enabled ?? fallback.claude.enabled,
      policy: normalizeBrowserPolicy(config?.claude?.policy ?? fallback.claude.policy),
      user_data_dir: claudeUserDataDir,
      devtools_port: normalizeBrowserDevtoolsPort(
        config?.claude?.devtools_port ?? fallback.claude.devtools_port
      ),
      eval_mode: normalizeBrowserEvalMode(config?.claude?.eval_mode ?? fallback.claude.eval_mode),
    },
    codex: {
      enabled: config?.codex?.enabled ?? fallback.codex.enabled,
      policy: normalizeBrowserPolicy(config?.codex?.policy ?? fallback.codex.policy),
      eval_mode: normalizeBrowserEvalMode(config?.codex?.eval_mode ?? fallback.codex.eval_mode),
    },
  };
}

// ---------------------------------------------------------------------------
// Session affinity TTL normalizer
// ---------------------------------------------------------------------------

export function normalizeSessionAffinityTtl(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed || !GO_DURATION_PATTERN.test(trimmed) || !hasPositiveDuration(trimmed)) {
    return fallback;
  }

  return trimmed;
}

export function hasPositiveDuration(value: string): boolean {
  const segments = value.match(new RegExp(GO_DURATION_SEGMENT, 'g'));
  if (!segments) {
    return false;
  }

  return segments.some((segment) => {
    const numeric = parseFloat(segment);
    return Number.isFinite(numeric) && numeric > 0;
  });
}

// ---------------------------------------------------------------------------
// Composite variant validator
// ---------------------------------------------------------------------------

/**
 * Validate composite variant provider strings.
 * Warns about invalid providers in composite variant configurations.
 */
export function validateCompositeVariants(config: UnifiedConfig): void {
  const variants = config.cliproxy?.variants;
  if (!variants) return;

  for (const [name, variant] of Object.entries(variants)) {
    if ('type' in variant && variant.type === 'composite') {
      const error = validateCompositeTiers(variant.tiers, {
        defaultTier: variant.default_tier,
        requireAllTiers: true,
      });
      if (error) {
        console.warn(`[!] Variant '${name}': invalid composite config (${error})`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Continuity config normalizer
// ---------------------------------------------------------------------------

/**
 * Normalize continuity inheritance mapping payload.
 * Keeps only non-empty string keys and values.
 */
export function normalizeContinuityInheritanceMap(
  value: unknown
): Record<string, string> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  const normalized: Record<string, string> = {};
  for (const [profileName, accountName] of Object.entries(value as Record<string, unknown>)) {
    const normalizedProfile = profileName.trim();
    const normalizedAccount = typeof accountName === 'string' ? accountName.trim() : '';

    if (!normalizedProfile || !normalizedAccount) {
      continue;
    }

    normalized[normalizedProfile] = normalizedAccount;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

/**
 * Normalize continuity section.
 * Supports legacy root key: continuity_inherit_from_account.
 */
export function normalizeContinuityConfig(
  partial: Partial<UnifiedConfig>
): ContinuityConfig | undefined {
  const legacyMap = normalizeContinuityInheritanceMap(
    (partial as Partial<UnifiedConfig> & { continuity_inherit_from_account?: unknown })
      .continuity_inherit_from_account
  );
  const continuityMap = normalizeContinuityInheritanceMap(partial.continuity?.inherit_from_account);

  if (!legacyMap && !continuityMap) {
    return undefined;
  }

  return {
    inherit_from_account: {
      ...(legacyMap ?? {}),
      ...(continuityMap ?? {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Official channels config normalizer
// ---------------------------------------------------------------------------

export interface LegacyDiscordChannelsConfig {
  enabled?: boolean;
  unattended?: boolean;
}

export function normalizeOfficialChannelsConfig(
  partial: Partial<UnifiedConfig> & { discord_channels?: LegacyDiscordChannelsConfig }
): OfficialChannelsConfig {
  const hasCanonicalChannelsSection = partial.channels !== undefined;
  const hasExplicitSelectedField =
    hasCanonicalChannelsSection &&
    Object.prototype.hasOwnProperty.call(partial.channels, 'selected');
  const rawSelected =
    hasExplicitSelectedField && Array.isArray(partial.channels?.selected)
      ? partial.channels.selected.filter((value): value is OfficialChannelId =>
          isOfficialChannelId(value)
        )
      : [];

  return {
    selected: hasCanonicalChannelsSection
      ? normalizeOfficialChannelIds(rawSelected)
      : resolveLegacyDiscordSelection(partial.discord_channels?.enabled),
    unattended:
      partial.channels?.unattended ??
      partial.discord_channels?.unattended ??
      DEFAULT_OFFICIAL_CHANNELS_CONFIG.unattended,
  };
}
