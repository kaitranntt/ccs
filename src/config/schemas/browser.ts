/**
 * Browser automation configuration types and defaults.
 *
 * Controls Claude browser attach and Codex browser tooling.
 * Version 13+ feature.
 */

/**
 * Browser tool exposure policy.
 */
export type BrowserToolPolicy = 'auto' | 'manual';

/**
 * Browser eval access mode.
 */
export type BrowserEvalMode = 'disabled' | 'readonly' | 'readwrite';

/**
 * Claude browser attach configuration.
 */
export interface BrowserClaudeConfig {
  /** Enable Claude browser attach (default: false) */
  enabled: boolean;
  /** Control whether Claude browser attach is exposed automatically or only via --browser */
  policy: BrowserToolPolicy;
  /** Chrome user-data directory used for attach mode */
  user_data_dir: string;
  /** DevTools port used for attach mode (default: 9222) */
  devtools_port: number;
  /** Eval access mode exposed through browser settings/status surfaces */
  eval_mode?: BrowserEvalMode;
}

/**
 * Codex browser tooling configuration.
 */
export interface BrowserCodexConfig {
  /** Enable Codex browser tooling injection (default: false) */
  enabled: boolean;
  /** Control whether Codex browser tooling is exposed automatically or only via --browser */
  policy: BrowserToolPolicy;
  /** Eval access mode exposed through browser settings/status surfaces */
  eval_mode?: BrowserEvalMode;
}

/**
 * Browser automation configuration.
 * Controls Claude browser attach and Codex browser tooling.
 */
export interface BrowserConfig {
  claude: BrowserClaudeConfig;
  codex: BrowserCodexConfig;
}

/**
 * Default browser configuration.
 */
export const DEFAULT_BROWSER_CONFIG: BrowserConfig = {
  claude: {
    enabled: false,
    policy: 'manual',
    user_data_dir: '',
    devtools_port: 9222,
    eval_mode: 'readonly',
  },
  codex: {
    enabled: false,
    policy: 'manual',
    eval_mode: 'readonly',
  },
};
