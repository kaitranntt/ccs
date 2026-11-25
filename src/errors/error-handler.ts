/**
 * Centralized error handler for CCS CLI
 *
 * Provides unified error handling with:
 * - Consistent error formatting
 * - Exit code management
 * - Cleanup callback execution
 * - Debug mode support
 */

import { ExitCode, EXIT_CODE_DESCRIPTIONS } from './exit-codes';
import { isCCSError } from './error-types';
import { runCleanup } from './cleanup-registry';
import { createLogger, flushStructuredLogsSync } from '../services/logging';

const logger = createLogger('cli:error-handler');

/**
 * Debug mode flag - set via CCS_DEBUG environment variable
 */
const isDebugMode = (): boolean => {
  return process.env['CCS_DEBUG'] === '1' || process.env['CCS_DEBUG'] === 'true';
};

/**
 * Format error message for display
 * Uses ASCII-only formatting per codebase standards (no emojis)
 */
function formatErrorMessage(error: unknown): string {
  if (isCCSError(error)) {
    return `[X] ${error.message}`;
  }

  if (error instanceof Error) {
    return `[X] ${error.message}`;
  }

  if (typeof error === 'string') {
    return `[X] ${error}`;
  }

  return '[X] An unexpected error occurred';
}

/**
 * Get exit code from error
 * CCSError types have their own codes, others default to GENERAL_ERROR
 */
function getExitCode(error: unknown): ExitCode {
  if (isCCSError(error)) {
    return error.code;
  }
  return ExitCode.GENERAL_ERROR;
}

/**
 * Log debug information for an error
 * Only outputs when CCS_DEBUG is enabled
 */
function logDebugInfo(error: unknown, code: ExitCode): void {
  if (!isDebugMode()) return;

  console.error('');
  console.error('[i] Debug information:');
  console.error(`    Exit code: ${code} (${EXIT_CODE_DESCRIPTIONS[code] || 'Unknown'})`);

  if (error instanceof Error) {
    console.error(`    Error type: ${error.constructor.name}`);
    if (error.stack) {
      console.error('    Stack trace:');
      const stackLines = error.stack.split('\n').slice(1, 6);
      for (const line of stackLines) {
        console.error(`      ${line.trim()}`);
      }
    }
  }

  // Log additional properties for CCSError types
  if (isCCSError(error)) {
    console.error(`    Recoverable: ${error.recoverable}`);
  }
}

/**
 * Central error handler
 * Formats error, runs cleanup, and exits with appropriate code
 *
 * @param error - The error to handle
 * @returns never - Always exits the process
 */
export function handleError(error: unknown): never {
  // Run cleanup callbacks first
  runCleanup();

  const code = getExitCode(error);
  const message = formatErrorMessage(error);
  logger.error('command.unhandled_error', 'Unhandled CLI error', {
    exitCode: code,
    error,
  });

  // Output error message to stderr
  console.error(message);

  // Log debug info if enabled
  logDebugInfo(error, code);

  flushStructuredLogsSync();

  // Exit with appropriate code
  process.exit(code);
}

/**
 * Exit with an error message and code
 * Convenience function for simple error exits
 *
 * @param message - Error message to display
 * @param code - Exit code (defaults to GENERAL_ERROR)
 * @returns never - Always exits the process
 */
export function exitWithError(message: string, code: ExitCode = ExitCode.GENERAL_ERROR): never {
  runCleanup();
  logger.error('command.exit_error', 'CLI exited with error', {
    exitCode: code,
    message,
  });
  console.error(`[X] ${message}`);

  if (isDebugMode()) {
    console.error('');
    console.error(`[i] Exit code: ${code} (${EXIT_CODE_DESCRIPTIONS[code] || 'Unknown'})`);
  }

  flushStructuredLogsSync();
  process.exit(code);
}

/**
 * Exit with success
 * Runs cleanup and exits with SUCCESS code
 *
 * @param message - Optional success message to display
 * @returns never - Always exits the process
 */
export function exitWithSuccess(message?: string): never {
  runCleanup();
  logger.info('command.exit_success', 'CLI exited successfully', {
    message: message || null,
  });
  if (message) {
    console.log(`[OK] ${message}`);
  }
  flushStructuredLogsSync();
  process.exit(ExitCode.SUCCESS);
}

/**
 * Create a wrapped error handler for async operations
 * Wraps an async function to catch and handle errors
 */
export function withErrorHandling<T extends unknown[]>(
  fn: (...args: T) => Promise<void>
): (...args: T) => Promise<void> {
  return async (...args: T): Promise<void> => {
    try {
      await fn(...args);
    } catch (error) {
      handleError(error);
    }
  };
}

/**
 * Assert a condition, throwing a CCSError if false
 */
export function assertOrExit(
  condition: boolean,
  message: string,
  code: ExitCode = ExitCode.GENERAL_ERROR
): asserts condition {
  if (!condition) {
    exitWithError(message, code);
  }
}
