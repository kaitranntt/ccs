/**
 * Shared utilities for the Gemini CLI quota fetcher submodule.
 *
 * Includes the diagnostic logger (provider context = cliproxy:quota:gemini-cli)
 * and small value-normalization helpers used by multiple submodules. Token
 * values are never logged here; accountId is attached as provider context
 * only.
 */

import { createLogger } from '../../../services/logging';

/**
 * Diagnostic-only logger for Gemini CLI quota fetch progress, upstream HTTP
 * status, and recovery hints. Token values live in auth files and are never
 * read into log messages.
 */
export const logger = createLogger('cliproxy:quota:gemini-cli');

/**
 * Normalize a raw value into a trimmed non-empty string, or null.
 * Returns null for empty strings, non-strings, or whitespace-only input.
 */
export function normalizeStringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Normalize a raw value into a finite number, or null.
 * Accepts actual numbers and numeric strings; rejects NaN/Infinity.
 */
export function normalizeNumberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

/**
 * Best-effort JSON.parse that returns null on failure instead of throwing.
 * Used when normalizing upstream response bodies into a `json` field.
 */
export function safeParseJson(bodyText: string): unknown {
  try {
    return JSON.parse(bodyText);
  } catch {
    return null;
  }
}

/**
 * Compute the remaining milliseconds available before a deadline, clamped
 * to a minimum of 1ms so AbortController timeouts are always positive.
 */
export function getRemainingTimeoutMs(deadlineMs: number): number {
  return Math.max(1, deadlineMs - Date.now());
}
