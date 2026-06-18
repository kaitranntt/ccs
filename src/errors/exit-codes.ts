/**
 * Standardized exit codes for CCS CLI
 *
 * Exit codes follow Unix conventions:
 * - 0: Success
 * - 1-125: Application errors
 * - 126-127: Command execution errors (reserved by shell)
 * - 128+N: Signal termination (128 + signal number)
 * - 130: SIGINT (Ctrl+C) - 128 + 2
 *
 * Implemented as a const object + union type (not a TS `enum`) so the file is
 * erasable-syntax-compatible: web UI builds (ui/tsconfig.app.json,
 * erasableSyntaxOnly) can reach this module via the @shared graph without
 * failing the build. Value (`ExitCode.CONFIG_ERROR`) and type (`: ExitCode`)
 * usage both continue to work.
 */

export const ExitCode = {
  /** Successful execution */
  SUCCESS: 0,

  /** General/unspecified error */
  GENERAL_ERROR: 1,

  /** Configuration file errors (missing, invalid, corrupt) */
  CONFIG_ERROR: 2,

  /** Network-related errors (connection, timeout, DNS) */
  NETWORK_ERROR: 3,

  /** Authentication/authorization errors (invalid token, expired, forbidden) */
  AUTH_ERROR: 4,

  /** Binary/executable errors (missing Claude CLI, corrupted binary) */
  BINARY_ERROR: 5,

  /** Provider-specific errors (API errors, rate limits, service unavailable) */
  PROVIDER_ERROR: 6,

  /** Profile not found or invalid */
  PROFILE_ERROR: 7,

  /** Proxy-related errors (startup failure, port conflict) */
  PROXY_ERROR: 8,

  /** Migration errors (failed to migrate config) */
  MIGRATION_ERROR: 9,

  /** User aborted operation (Ctrl+C, SIGINT) */
  USER_ABORT: 130,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

/**
 * Human-readable descriptions for exit codes
 * Used in error messages and documentation
 */
export const EXIT_CODE_DESCRIPTIONS: Record<ExitCode, string> = {
  [ExitCode.SUCCESS]: 'Success',
  [ExitCode.GENERAL_ERROR]: 'General error',
  [ExitCode.CONFIG_ERROR]: 'Configuration error',
  [ExitCode.NETWORK_ERROR]: 'Network error',
  [ExitCode.AUTH_ERROR]: 'Authentication error',
  [ExitCode.BINARY_ERROR]: 'Binary/executable error',
  [ExitCode.PROVIDER_ERROR]: 'Provider error',
  [ExitCode.PROFILE_ERROR]: 'Profile error',
  [ExitCode.PROXY_ERROR]: 'Proxy error',
  [ExitCode.MIGRATION_ERROR]: 'Migration error',
  [ExitCode.USER_ABORT]: 'User abort (Ctrl+C)',
};

/**
 * Check if an exit code indicates success
 */
export function isSuccess(code: ExitCode | number): boolean {
  return code === ExitCode.SUCCESS;
}

/**
 * Check if an exit code indicates a recoverable error
 * (errors that might succeed on retry)
 */
export function isRecoverable(code: ExitCode | number): boolean {
  return code === ExitCode.NETWORK_ERROR || code === ExitCode.PROVIDER_ERROR;
}
