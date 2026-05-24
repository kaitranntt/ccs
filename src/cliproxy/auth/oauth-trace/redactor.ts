/**
 * OAuth secret redactor — single choke point.
 *
 * Every value reaching any sink passes through these helpers first.
 * Adding a new sensitive key here is the only place it has to change.
 *
 * DEFERRED: per-event syscall throttling; fsync / file-size cap on file sink.
 */

const SENSITIVE_QUERY_KEYS = [
  'code',
  'state',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'client_secret',
  'authorization',
  // PKCE / device-flow / assertion keys
  'code_verifier',
  'device_code',
  'assertion',
  'subject_token',
] as const;

const SENSITIVE_OBJECT_KEYS = new Set(
  SENSITIVE_QUERY_KEYS.map((k) => k.toLowerCase()).concat(['authorization', 'bearer', 'token'])
);

const REDACTED = '***REDACTED***';

/**
 * Matches sensitive keys in query strings, fragments, and standard params.
 * Lookbehind covers: `?`, `&`, `#`, and `&#` (fragment-then-amp) delimiters.
 * Keys are decoded before matching to catch URL-encoded bypass attempts.
 */
const QUERY_PARAM_REGEX = new RegExp(
  `(?<=[?&#])(${SENSITIVE_QUERY_KEYS.join('|')})=[^&#\\s]+`,
  'gi'
);

const BEARER_REGEX = /Bearer\s+[A-Za-z0-9._\-~+/=]+/gi;

const KV_SEPARATORS = String.raw`(?:=|:)`;
const VALUE_FRAGMENT = String.raw`[^\s,;&\]}\"']+`;
const STRING_KV_KEYS = [...SENSITIVE_QUERY_KEYS, 'token'].filter((key) => key !== 'authorization');
const SENSITIVE_KEY_GROUP = `(${STRING_KV_KEYS.join('|')})`;
const LEADING_KV_REGEX = new RegExp(
  String.raw`(^|\s)${SENSITIVE_KEY_GROUP}(\s*${KV_SEPARATORS}\s*)${VALUE_FRAGMENT}`,
  'gi'
);
const QUOTED_JSON_KV_REGEX = new RegExp(
  String.raw`([\"'])${SENSITIVE_KEY_GROUP}\1(\s*:\s*)([\"'])(?:\\.|(?!\4).)*?\4`,
  'gi'
);

/** Redact sensitive query-param values inside any string. Idempotent. */
export function redactString(s: string): string {
  if (!s) return s;
  return s
    .replace(QUERY_PARAM_REGEX, (_full, key) => `${key}=${REDACTED}`)
    .replace(BEARER_REGEX, `Bearer ${REDACTED}`)
    .replace(
      QUOTED_JSON_KV_REGEX,
      (_full, quoteKey, key, separator, quoteVal) =>
        `${quoteKey}${key}${quoteKey}${separator}${quoteVal}${REDACTED}${quoteVal}`
    )
    .replace(
      LEADING_KV_REGEX,
      (_full, prefix, key, separator) => `${prefix}${key}${separator}${REDACTED}`
    );
}

/** Redact a parsed URL by name; returns redacted href or original on parse error. */
export function redactUrl(u: string): string {
  try {
    const url = new URL(u);

    // Redact query params — URL parser already decoded keys, compare decoded.
    for (const key of SENSITIVE_QUERY_KEYS) {
      if (url.searchParams.has(key)) url.searchParams.set(key, REDACTED);
    }
    // Also catch URL-encoded key names that URL.searchParams may not normalise
    // (e.g. `?%63%6F%64%65=SECRET`). Decode all keys and re-check.
    for (const [rawKey, rawVal] of [...url.searchParams.entries()]) {
      const decoded = decodeURIComponent(rawKey).toLowerCase();
      if (
        (SENSITIVE_OBJECT_KEYS.has(decoded) || SENSITIVE_QUERY_KEYS.includes(decoded as never)) &&
        rawVal !== REDACTED
      ) {
        url.searchParams.set(rawKey, REDACTED);
      }
    }

    // Redact fragment — strip leading `#`, prepend `?` so QUERY_PARAM_REGEX
    // matches the first param (lookbehind requires `?`, `&`, or `#`).
    if (url.hash) {
      const bare = url.hash.slice(1); // remove leading '#'
      const fakeQuery = `?${bare}`;
      const redacted = redactString(fakeQuery);
      url.hash = redacted.slice(1); // put back without the fake '?'
    }

    return url.toString();
  } catch {
    return redactString(u);
  }
}

/**
 * Shallow-redact a plain object. Returns a new object; original is not mutated.
 * Arrays are recursed so token arrays (e.g. `{tokens:[{access_token:'AT'}]}`)
 * do not bypass redaction.
 */
export function redactJsonShallow(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_OBJECT_KEYS.has(key.toLowerCase())) {
      out[key] = REDACTED;
    } else if (typeof value === 'string') {
      out[key] = redactString(value);
    } else if (Array.isArray(value)) {
      out[key] = value.map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? redactJsonShallow(item as Record<string, unknown>)
          : item
      );
    } else if (value && typeof value === 'object') {
      out[key] = redactJsonShallow(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Redact an Authorization header value. */
export function redactBearer(header: string): string {
  return header.replace(BEARER_REGEX, `Bearer ${REDACTED}`);
}

export const REDACTED_PLACEHOLDER = REDACTED;
