/**
 * Thinking/reasoning budget configuration types and defaults.
 *
 * Controls thinking budget injection for CLIProxy providers.
 * Version 8+ feature.
 */

// ============================================================================
// THINKING CONFIGURATION (v8+)
// ============================================================================

/**
 * Thinking mode for auto/manual/off control.
 * - auto: Apply tier-based defaults (opus→high, sonnet→medium, haiku→low)
 * - off: Disable thinking entirely
 * - manual: Use explicit override value
 */
export type ThinkingMode = 'auto' | 'off' | 'manual';

/**
 * Tier-to-thinking level defaults.
 * Maps Claude tier names to thinking level names.
 */
export interface ThinkingTierDefaults {
  /** Thinking level for opus tier (default: 'high') */
  opus: string;
  /** Thinking level for sonnet tier (default: 'medium') */
  sonnet: string;
  /** Thinking level for haiku tier (default: 'low') */
  haiku: string;
}

/**
 * Thinking configuration section.
 * Controls thinking/reasoning budget injection for CLIProxy providers.
 */
export interface ThinkingConfig {
  /** Thinking mode (default: 'auto') */
  mode: ThinkingMode;
  /** Manual override value (level name or budget number) */
  override?: string | number;
  /** Tier-to-level mapping */
  tier_defaults: ThinkingTierDefaults;
  /** Per-provider overrides (e.g., { gemini: { opus: 'high' } }) */
  provider_overrides?: Record<string, Partial<ThinkingTierDefaults>>;
  /** Show warning when values are clamped (default: true) */
  show_warnings?: boolean;
}

/**
 * Default thinking tier defaults.
 */
export const DEFAULT_THINKING_TIER_DEFAULTS: ThinkingTierDefaults = {
  opus: 'high',
  sonnet: 'medium',
  haiku: 'low',
};

/**
 * Default thinking configuration.
 */
export const DEFAULT_THINKING_CONFIG: ThinkingConfig = {
  mode: 'auto',
  tier_defaults: { ...DEFAULT_THINKING_TIER_DEFAULTS },
  show_warnings: true,
};
