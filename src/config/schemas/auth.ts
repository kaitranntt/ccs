/**
 * Account, profile, and authentication config types.
 *
 * Covers:
 * - AccountConfig: isolated Claude instances via CLAUDE_CONFIG_DIR
 * - ProfileConfig: API-based profiles (env var injection)
 * - OAuthAccounts: CLIProxy nickname-to-email mapping
 * - CLIProxyAuthConfig: API key and management secret customization
 * - TokenRefreshSettings: background token refresh worker config
 * - DashboardAuthConfig: dashboard login protection
 */

import type { TargetType } from '../../targets/target-adapter';

/**
 * Account configuration (formerly in profiles.json).
 * Represents an isolated Claude instance via CLAUDE_CONFIG_DIR.
 */
export interface AccountConfig {
  /** ISO timestamp when account was created */
  created: string;
  /** ISO timestamp of last usage, null if never used */
  last_used: string | null;
  /** Context mode for project workspace data */
  context_mode?: 'isolated' | 'shared';
  /** Context-sharing group when context_mode='shared' */
  context_group?: string;
  /** Shared continuity depth when context_mode='shared' */
  continuity_mode?: 'standard' | 'deeper';
  /** Bare profile: no shared symlinks (commands, skills, agents, settings.json) */
  bare?: boolean;
}

/**
 * API-based profile configuration.
 * Injects environment variables for alternative providers (GLM, Kimi, etc.).
 *
 * Settings are stored in separate *.settings.json files (matching Claude's pattern)
 * to allow users to edit them directly without touching config.yaml.
 */
export interface ProfileConfig {
  /** Profile type - currently only 'api' */
  type: 'api';
  /** Path to settings file (e.g., "~/.ccs/glm.settings.json") */
  settings: string;
  /** Target CLI to use for this profile (default: 'claude') */
  target?: TargetType;
}

/**
 * CLIProxy OAuth account nickname mapping.
 * Maps user-friendly nicknames to email addresses.
 */
export type OAuthAccounts = Record<string, string>;

/**
 * CLIProxy authentication configuration.
 * Allows customization of API key and management secret for CLIProxyAPI.
 */
export interface CLIProxyAuthConfig {
  /** API key for CCS-managed requests (default: 'ccs-internal-managed') */
  api_key?: string;
  /** Management secret for Control Panel login (default: 'ccs') */
  management_secret?: string;
}

/**
 * Token refresh configuration.
 * Manages background token refresh worker settings.
 */
export interface TokenRefreshSettings {
  /** Enable background token refresh (default: false) */
  enabled?: boolean;
  /** Refresh check interval in minutes (default: 30) */
  interval_minutes?: number;
  /** Preemptive refresh time in minutes (default: 45) */
  preemptive_minutes?: number;
  /** Maximum retry attempts per token (default: 3) */
  max_retries?: number;
  /** Enable verbose logging (default: false) */
  verbose?: boolean;
}

/**
 * Dashboard authentication configuration.
 * Optional login protection for CCS dashboard.
 * Disabled by default for backward compatibility.
 */
export interface DashboardAuthConfig {
  /** Enable dashboard authentication (default: false) */
  enabled: boolean;
  /** Username for dashboard login */
  username: string;
  /** Bcrypt-hashed password (use: npx bcrypt-cli hash 'password') */
  password_hash: string;
  /** Session timeout in hours (default: 24) */
  session_timeout_hours?: number;
}

/**
 * Default dashboard auth configuration.
 * Disabled by default - must be explicitly enabled.
 */
export const DEFAULT_DASHBOARD_AUTH_CONFIG: DashboardAuthConfig = {
  enabled: false,
  username: '',
  password_hash: '',
  session_timeout_hours: 24,
};
