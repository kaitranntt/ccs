/**
 * Custom error types for CCS CLI
 *
 * All custom errors extend CCSError which provides:
 * - Standardized exit codes
 * - Recoverable flag for retry logic
 * - Consistent error formatting
 *
 * Fields are declared explicitly (no TypeScript parameter properties) so this
 * module is erasable-syntax-compatible: web UI builds enforce
 * `erasableSyntaxOnly` and reach this module via the @shared graph.
 */

import { ExitCode } from './exit-codes';

/**
 * Base error class for all CCS errors
 * Extends standard Error with exit code and recovery information
 */
export class CCSError extends Error {
  readonly code: ExitCode;
  readonly recoverable: boolean;

  constructor(
    message: string,
    code: ExitCode = ExitCode.GENERAL_ERROR,
    recoverable: boolean = false
  ) {
    super(message);
    this.code = code;
    this.recoverable = recoverable;
    this.name = 'CCSError';
    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Configuration-related errors
 * Examples: missing config file, invalid JSON, corrupt settings
 */
export class ConfigError extends CCSError {
  readonly configPath?: string;

  constructor(message: string, configPath?: string) {
    super(message, ExitCode.CONFIG_ERROR, false);
    this.name = 'ConfigError';
    this.configPath = configPath;
  }
}

/**
 * Network-related errors
 * Examples: connection refused, timeout, DNS resolution failure
 */
export class NetworkError extends CCSError {
  readonly url?: string;
  readonly statusCode?: number;

  constructor(message: string, url?: string, statusCode?: number) {
    super(message, ExitCode.NETWORK_ERROR, true); // Network errors are typically recoverable
    this.name = 'NetworkError';
    this.url = url;
    this.statusCode = statusCode;
  }
}

/**
 * Authentication/authorization errors
 * Examples: invalid API key, expired token, insufficient permissions
 */
export class AuthError extends CCSError {
  readonly provider?: string;

  constructor(message: string, provider?: string) {
    super(message, ExitCode.AUTH_ERROR, false);
    this.name = 'AuthError';
    this.provider = provider;
  }
}

/**
 * Binary/executable errors
 * Examples: Claude CLI not found, corrupted binary, permission denied
 */
export class BinaryError extends CCSError {
  readonly binaryPath?: string;

  constructor(message: string, binaryPath?: string) {
    super(message, ExitCode.BINARY_ERROR, false);
    this.name = 'BinaryError';
    this.binaryPath = binaryPath;
  }
}

/**
 * Provider-specific errors
 * Examples: API rate limit, service unavailable, invalid model
 */
export class ProviderError extends CCSError {
  readonly provider: string;
  readonly details?: unknown;

  constructor(message: string, provider: string, details?: unknown) {
    super(message, ExitCode.PROVIDER_ERROR, true); // Provider errors may be recoverable
    this.name = 'ProviderError';
    this.provider = provider;
    this.details = details;
  }
}

/**
 * Profile-related errors
 * Examples: profile not found, invalid profile name, duplicate profile
 */
export class ProfileError extends CCSError {
  readonly profileName?: string;
  readonly availableProfiles?: string[];

  constructor(message: string, profileName?: string, availableProfiles?: string[]) {
    super(message, ExitCode.PROFILE_ERROR, false);
    this.name = 'ProfileError';
    this.profileName = profileName;
    this.availableProfiles = availableProfiles;
  }
}

/**
 * Proxy-related errors
 * Examples: proxy startup failure, port conflict, proxy timeout
 */
export class ProxyError extends CCSError {
  readonly port?: number;

  constructor(message: string, port?: number) {
    super(message, ExitCode.PROXY_ERROR, false);
    this.name = 'ProxyError';
    this.port = port;
  }
}

/**
 * Migration-related errors
 * Examples: failed to migrate config, backup creation failed
 */
export class MigrationError extends CCSError {
  readonly fromVersion?: string;
  readonly toVersion?: string;

  constructor(message: string, fromVersion?: string, toVersion?: string) {
    super(message, ExitCode.MIGRATION_ERROR, false);
    this.name = 'MigrationError';
    this.fromVersion = fromVersion;
    this.toVersion = toVersion;
  }
}

/**
 * User abort error (Ctrl+C, SIGINT)
 * Used when user explicitly cancels an operation
 */
export class UserAbortError extends CCSError {
  constructor(message: string = 'Operation cancelled by user') {
    super(message, ExitCode.USER_ABORT, false);
    this.name = 'UserAbortError';
  }
}

/**
 * Input validation errors (model denylist, invalid format, length limits)
 * Distinguishes user-input validation failures from system errors
 */
export class ValidationError extends CCSError {
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message, ExitCode.GENERAL_ERROR, false);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Retryable/transient error
 * Signals that the operation may succeed on retry (e.g. rate limits, timeouts)
 */
export class RetryableError extends CCSError {
  readonly originalError?: Error;
  readonly retryAfter?: number; // ms until next attempt

  constructor(message: string, originalError?: Error, retryAfter?: number) {
    super(message, ExitCode.GENERAL_ERROR, true);
    this.name = 'RetryableError';
    this.originalError = originalError;
    this.retryAfter = retryAfter;
  }
}

/**
 * Type guard to check if an error is a CCSError
 */
export function isCCSError(error: unknown): error is CCSError {
  return error instanceof CCSError;
}

/**
 * Type guard to check if an error is recoverable
 */
export function isRecoverableError(error: unknown): boolean {
  if (isCCSError(error)) {
    return error.recoverable;
  }
  return false;
}
