/**
 * Quota management configuration types and defaults.
 *
 * Controls hybrid auto+manual account selection for multi-account setups.
 * Version 7+ feature.
 */

// ============================================================================
// QUOTA MANAGEMENT CONFIGURATION (v7+)
// ============================================================================

/**
 * Auto quota management configuration.
 * Controls automatic failover behavior.
 */
export interface AutoQuotaConfig {
  /** Enable pre-flight quota check before requests (default: true) */
  preflight_check: boolean;
  /** Quota percentage below which account is "exhausted" (default: 5) */
  exhaustion_threshold: number;
  /** Tier priority for failover, highest to lowest (default: ['paid']) */
  tier_priority: string[];
  /** Minutes to skip exhausted account before retry (default: 5) */
  cooldown_minutes: number;
}

/**
 * Runtime quota monitor configuration.
 * Controls adaptive polling during active sessions.
 */
export interface RuntimeMonitorConfig {
  /** Enable runtime monitoring during sessions (default: true) */
  enabled: boolean;
  /** Poll interval in seconds when quota > warn_threshold (default: 300) */
  normal_interval_seconds: number;
  /** Poll interval in seconds when quota <= warn_threshold (default: 60) */
  critical_interval_seconds: number;
  /** Quota percentage that triggers fast polling + warning (default: 20) */
  warn_threshold: number;
  /** Quota percentage that triggers cooldown + switch (default: 5) */
  exhaustion_threshold: number;
  /** Minutes to cooldown exhausted account (default: 5) */
  cooldown_minutes: number;
}

/**
 * Manual quota management configuration.
 * User-controlled overrides for account selection.
 */
export interface ManualQuotaConfig {
  /** User-paused accounts (stored in accounts.json) */
  paused_accounts: string[];
  /** Force use of specific account (overrides auto-selection) */
  forced_default: string | null;
  /** Lock to specific tier only */
  tier_lock: string | null;
}

/**
 * Quota management mode.
 * - auto: Fully automatic failover based on quota
 * - manual: User controls everything, no auto-switching
 * - hybrid: Auto-failover with user overrides (default)
 */
export type QuotaManagementMode = 'auto' | 'manual' | 'hybrid';

/**
 * Quota management configuration section.
 * Controls hybrid auto+manual account selection for multi-account setups.
 */
export interface QuotaManagementConfig {
  /** Management mode (default: hybrid) */
  mode: QuotaManagementMode;
  /** Auto mode settings */
  auto: AutoQuotaConfig;
  /** Manual mode settings */
  manual: ManualQuotaConfig;
  /** Runtime monitor settings */
  runtime_monitor: RuntimeMonitorConfig;
}

/**
 * Default auto quota configuration.
 */
export const DEFAULT_AUTO_QUOTA_CONFIG: AutoQuotaConfig = {
  preflight_check: true,
  exhaustion_threshold: 5,
  tier_priority: ['ultra', 'pro', 'free'],
  cooldown_minutes: 5,
};

/**
 * Default manual quota configuration.
 */
export const DEFAULT_MANUAL_QUOTA_CONFIG: ManualQuotaConfig = {
  paused_accounts: [],
  forced_default: null,
  tier_lock: null,
};

/**
 * Default runtime monitor configuration.
 */
export const DEFAULT_RUNTIME_MONITOR_CONFIG: RuntimeMonitorConfig = {
  enabled: true,
  normal_interval_seconds: 300,
  critical_interval_seconds: 60,
  warn_threshold: 20,
  exhaustion_threshold: 5,
  cooldown_minutes: 5,
};

/**
 * Default quota management configuration.
 */
export const DEFAULT_QUOTA_MANAGEMENT_CONFIG: QuotaManagementConfig = {
  mode: 'hybrid',
  auto: { ...DEFAULT_AUTO_QUOTA_CONFIG },
  manual: { ...DEFAULT_MANUAL_QUOTA_CONFIG },
  runtime_monitor: { ...DEFAULT_RUNTIME_MONITOR_CONFIG },
};
