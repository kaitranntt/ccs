/**
 * Token parsing helpers for Gemini CLI auth files.
 *
 * Extracts access tokens, expiry, and project IDs from the raw auth file
 * payload. Gemini auth files come in two structural variants:
 *   - flat:  { access_token, expired, project_id, account }
 *   - nested:{ token: { access_token, expiry }, project_id, account }
 * These helpers handle both without throwing on shape mismatches.
 */

/**
 * Extract the access token from a Gemini auth file payload.
 * Handles both flat (`access_token`) and nested (`token.access_token`) shapes.
 * Returns null if no usable token is present.
 */
export function extractAccessToken(data: Record<string, unknown>): string | null {
  // Flat structure: { access_token: "..." }
  if (typeof data.access_token === 'string') {
    return data.access_token;
  }
  // Nested structure: { token: { access_token: "..." } }
  if (data.token && typeof data.token === 'object') {
    const token = data.token as Record<string, unknown>;
    if (typeof token.access_token === 'string') {
      return token.access_token;
    }
  }
  return null;
}

/**
 * Extract the token expiry from a Gemini auth file payload.
 * Handles both flat (`expired`) and nested (`token.expiry`) shapes.
 * Returns the raw string/number, or null if absent.
 */
export function extractExpiry(data: Record<string, unknown>): string | number | null {
  // Flat structure: { expired: "..." }
  if (typeof data.expired === 'string') {
    return data.expired;
  }
  if (typeof data.expired === 'number') {
    return data.expired;
  }
  // Nested structure: { token: { expiry: "..." } }
  if (data.token && typeof data.token === 'object') {
    const token = data.token as Record<string, unknown>;
    if (typeof token.expiry === 'string') {
      return token.expiry;
    }
    if (typeof token.expiry === 'number') {
      return token.expiry;
    }
  }
  return null;
}

/**
 * Extract the project ID from an auth file's `account` field.
 * Input shape: "user@example.com (cloudaicompanion-abc-123)"
 * Returns the last parenthesized segment, or null if no match.
 *
 * Example:
 *   "user@example.com (cloudaicompanion-abc-123)" -> "cloudaicompanion-abc-123"
 */
export function resolveGeminiCliProjectId(accountField: string): string | null {
  const regex = /\(([^()]+)\)/g;
  let match: RegExpExecArray | null;
  let lastMatch: string | null = null;
  while ((match = regex.exec(accountField)) !== null) {
    lastMatch = match[1];
  }
  return lastMatch;
}
