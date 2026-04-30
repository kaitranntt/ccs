/**
 * Logging and preferences configuration types and defaults.
 *
 * Covers:
 * - LoggingConfig: CCS-owned structured runtime logging
 * - LoggingLevel: log severity levels
 * - PreferencesConfig: user preferences (theme, telemetry, auto-update)
 */

export type LoggingLevel = 'error' | 'warn' | 'info' | 'debug';

/**
 * CCS-owned structured logging configuration.
 * Separate from cliproxy.logging, which controls CLIProxy runtime files.
 */
export interface LoggingConfig {
  /** Enable CCS-owned structured runtime logging */
  enabled: boolean;
  /** Minimum level written to disk */
  level: LoggingLevel;
  /** Rotate current log when it reaches this size in MB */
  rotate_mb: number;
  /** Keep archived segments for this many days */
  retain_days: number;
  /** Redact sensitive values before persistence */
  redact: boolean;
  /** In-memory recent event buffer size for dashboard reads */
  live_buffer_size: number;
}

/**
 * Default logging configuration.
 */
export const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  enabled: true,
  level: 'info',
  rotate_mb: 10,
  retain_days: 7,
  redact: true,
  live_buffer_size: 250,
};

/**
 * User preferences.
 */
export interface PreferencesConfig {
  /** UI theme preference */
  theme?: 'light' | 'dark' | 'system';
  /** Enable anonymous telemetry */
  telemetry?: boolean;
  /** Enable automatic update checks */
  auto_update?: boolean;
}
