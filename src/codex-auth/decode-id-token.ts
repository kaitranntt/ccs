import type { CodexAccountIdentity } from './types';

// JWT claim URI for OpenAI-specific auth data (nested object).
// Verified against real auth.json: chatgpt_plan_type and chatgpt_account_id
// live under this key, NOT at top level.
const OPENAI_AUTH_CLAIM = 'https://api.openai.com/auth';
const OPENAI_PROFILE_CLAIM = 'https://api.openai.com/profile';
const BASE64URL_SEGMENT_RE = /^[A-Za-z0-9_-]+$/;

interface OpenAIAuthClaim {
  chatgpt_plan_type?: string;
  chatgpt_account_id?: string;
}

interface OpenAIProfileClaim {
  email?: string;
}

interface JwtPayload {
  email?: string;
  [OPENAI_AUTH_CLAIM]?: OpenAIAuthClaim;
  [OPENAI_PROFILE_CLAIM]?: OpenAIProfileClaim;
  [key: string]: unknown;
}

function base64urlDecode(str: string): string {
  // Convert base64url to standard base64
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function isBase64UrlSegment(str: string): boolean {
  return str.length > 0 && str.length % 4 !== 1 && BASE64URL_SEGMENT_RE.test(str);
}

function decodeJsonSegment(str: string): unknown {
  return JSON.parse(base64urlDecode(str));
}

/**
 * Decode the payload of a JWT id_token without signature verification.
 * Returns only the display-safe fields: email, plan_type, account_id.
 * Returns {} on any parse failure — never throws.
 *
 * Security note: signature is NOT verified. This is purely cosmetic data
 * for dashboard display. Auth boundary is OS file perms on auth.json.
 */
export function decodeIdToken(idToken: string): CodexAccountIdentity {
  try {
    const payload = decodeJwtPayload(idToken);
    if (!payload) return {};

    const authClaim = payload[OPENAI_AUTH_CLAIM];
    const profileClaim = payload[OPENAI_PROFILE_CLAIM];

    // Email: prefer top-level, fall back to profile claim
    const email = payload.email ?? profileClaim?.email;

    const result: CodexAccountIdentity = {};
    if (typeof email === 'string' && email.length > 0) {
      result.email = email;
    }
    if (typeof authClaim?.chatgpt_plan_type === 'string') {
      result.plan_type = authClaim.chatgpt_plan_type;
    }
    if (typeof authClaim?.chatgpt_account_id === 'string') {
      result.account_id = authClaim.chatgpt_account_id;
    }

    return result;
  } catch {
    return {};
  }
}

export function hasStructurallyValidIdToken(idToken: string): boolean {
  return decodeJwtPayload(idToken) !== null;
}

function decodeJwtPayload(idToken: string): JwtPayload | null {
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      return null;
    }
    if (!parts.every((part) => isBase64UrlSegment(part))) {
      return null;
    }

    const header = decodeJsonSegment(parts[0] ?? '');
    if (!header || typeof header !== 'object' || Array.isArray(header)) {
      return null;
    }

    const payload = decodeJsonSegment(parts[1] ?? '');
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }
    return payload as JwtPayload;
  } catch {
    return null;
  }
}
