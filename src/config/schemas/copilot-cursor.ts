/**
 * Copilot and Cursor IDE integration configuration types and defaults.
 *
 * Covers:
 * - CopilotConfig: deprecated GitHub Copilot proxy compatibility (strictly opt-in)
 * - CursorConfig: Cursor IDE proxy daemon
 */

/**
 * Copilot API account type.
 */
export type CopilotAccountType = 'individual' | 'business' | 'enterprise';

/**
 * Copilot API configuration.
 * Enables deprecated GitHub Copilot compatibility via copilot-api proxy.
 * Strictly opt-in - disabled by default.
 *
 * !! DISCLAIMER - USE AT YOUR OWN RISK !!
 * This uses an UNOFFICIAL reverse-engineered API.
 * Excessive usage may trigger GitHub account restrictions.
 * CCS provides NO WARRANTY and accepts NO RESPONSIBILITY for any consequences.
 */
export interface CopilotConfig {
  /** Enable Copilot integration (default: false) - must be explicitly enabled */
  enabled: boolean;
  /** Auto-start copilot-api daemon when using profile (default: false) */
  auto_start: boolean;
  /** Port for copilot-api proxy (default: 4141) */
  port: number;
  /** GitHub Copilot account type (default: individual) */
  account_type: CopilotAccountType;
  /** Rate limit in seconds between requests (null = no limit) */
  rate_limit: number | null;
  /** Wait instead of error when rate limit is hit (default: true) */
  wait_on_limit: boolean;
  /** Default model ID (e.g., claude-sonnet-4.5) */
  model: string;
  /** Model mapping for Claude tiers - maps opus/sonnet/haiku to specific models */
  opus_model?: string;
  sonnet_model?: string;
  haiku_model?: string;
}

/**
 * Cursor IDE integration configuration.
 * Enables Cursor IDE usage via cursor proxy daemon.
 */
export interface CursorConfig {
  /** Enable Cursor integration (default: false) */
  enabled: boolean;
  /** Port for cursor proxy daemon (default: 20129) */
  port: number;
  /** Auto-start daemon when CCS starts (default: false) */
  auto_start: boolean;
  /** Enable ghost mode to disable telemetry (default: true) */
  ghost_mode: boolean;
  /** Default model ID used by Cursor integration */
  model: string;
  /** Optional tier mapping for Claude-compatible model routing */
  opus_model?: string;
  /** Optional tier mapping for Claude-compatible model routing */
  sonnet_model?: string;
  /** Optional tier mapping for Claude-compatible model routing */
  haiku_model?: string;
}

/**
 * Default Copilot configuration.
 * Strictly opt-in - disabled by default.
 * Uses gpt-4.1 as default model (free tier compatible).
 */
export const DEFAULT_COPILOT_CONFIG: CopilotConfig = {
  enabled: false,
  auto_start: false,
  port: 4141,
  account_type: 'individual',
  rate_limit: null,
  wait_on_limit: true,
  model: 'gpt-4.1',
};

/**
 * Default Cursor configuration.
 * Disabled by default, ghost mode enabled for privacy.
 */
export const DEFAULT_CURSOR_CONFIG: CursorConfig = {
  enabled: false,
  port: 20129,
  auto_start: false,
  ghost_mode: true,
  model: 'gpt-5.3-codex',
};
