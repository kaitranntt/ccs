/**
 * API Validation Service
 *
 * Provides validation functions for API profile names and URLs.
 * Extracted from api-command.ts for reuse and testability.
 */

import { isReservedName, isWindowsReservedName } from '../../config/reserved-names';

/**
 * Validate API profile name
 * @returns Error message if invalid, null if valid
 */
export function validateApiName(name: string): string | null {
  if (!name) {
    return 'API name is required';
  }
  if (!/^[a-zA-Z][a-zA-Z0-9._-]*$/.test(name)) {
    return 'API name must start with letter, contain only letters, numbers, dot, dash, underscore';
  }
  if (name.length > 32) {
    return 'API name must be 32 characters or less';
  }
  if (isReservedName(name)) {
    return `'${name}' is a reserved name`;
  }
  if (isWindowsReservedName(name)) {
    return `'${name}' is a Windows reserved device name and cannot be used`;
  }
  return null;
}

/**
 * Validate URL format
 * @returns Error message if invalid, null if valid
 */
export function validateUrl(url: string): string | null {
  if (!url) {
    return 'Base URL is required';
  }
  try {
    new URL(url);
    return null;
  } catch {
    return 'Invalid URL format (must include protocol, e.g., https://)';
  }
}

/**
 * Check if URL looks like it includes endpoint path (common mistake)
 * @returns Warning message if problematic, null if OK
 */
export function getUrlWarning(url: string): string | null {
  const problematicPaths = ['/chat/completions', '/v1/messages', '/messages', '/completions'];
  const lowerUrl = url.toLowerCase();

  for (const pathSuffix of problematicPaths) {
    if (lowerUrl.endsWith(pathSuffix)) {
      return (
        `URL ends with "${pathSuffix}" - Claude appends this automatically.\n` +
        `    You likely want: ${url.replace(new RegExp(pathSuffix + '$', 'i'), '')}`
      );
    }
  }
  return null;
}

/**
 * Sanitize URL by removing common endpoint suffixes
 */
export function sanitizeBaseUrl(url: string): string {
  const suffixes = ['/chat/completions', '/v1/messages', '/messages', '/completions'];
  let sanitized = url;
  for (const suffix of suffixes) {
    const regex = new RegExp(suffix + '$', 'i');
    sanitized = sanitized.replace(regex, '');
  }
  return sanitized;
}
