import type { LogErrorInfo } from './log-types';

/**
 * Sensitive log key matcher (single source of truth).
 *
 * Add new patterns conservatively. Numeric/boolean values are passed through
 * even when their key matches (e.g., `expires_at` epoch numbers stay readable);
 * only string and object values are redacted.
 */
const SENSITIVE_KEY_PATTERN =
  /^(authorization|proxy[_-]?authorization|cookie|set-cookie|password|password_hash|secret|client[_-]?secret|token|auth[_-]?token|access[_-]?token|refresh[_-]?token|id[_-]?token|bearer|assertion|api[_-]?key|x[_-]?api[_-]?key|x[_-]?goog[_-]?api[_-]?key|management[_-]?key|copilot[_-]?token|cursor[_-]?session[_-]?key|oauth[_-]?code|auth[_-]?code)$/i;

/** CLI flags whose following argument should be redacted in argv arrays. */
const SENSITIVE_ARGV_FLAG_PATTERN =
  /^--(token|api[_-]?key|auth|auth[_-]?token|secret|bearer|password|client[_-]?secret|refresh[_-]?token|access[_-]?token|id[_-]?token|prompt)$/i;

/** Short CLI flags whose following argument should be redacted in argv arrays. */
const SENSITIVE_SHORT_ARGV_FLAG_PATTERN = /^-p$/;

/** CLI flags whose inline `--flag=value` payload should be redacted in argv arrays. */
const SENSITIVE_ARGV_ASSIGNMENT_PATTERN =
  /^--(token|api[_-]?key|auth|auth[_-]?token|secret|bearer|password|client[_-]?secret|refresh[_-]?token|access[_-]?token|id[_-]?token|prompt)=/i;

/** Bearer/Basic/Token auth-scheme prefix in raw string values. */
const AUTH_SCHEME_VALUE_PATTERN = /^(Bearer|Basic|Token)\s+\S+/;

const MAX_STRING_LENGTH = 2000;
const MAX_DEPTH = 5;

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]`;
}

function maskAuthSchemeValue(value: string): string {
  const match = AUTH_SCHEME_VALUE_PATTERN.exec(value);
  if (!match) return value;
  return `${match[1]} [redacted]`;
}

/**
 * Known credential token shapes that may appear anywhere in a string value
 * (error messages, URLs, free-text). Applied IN ADDITION to sensitive-key
 * redaction so a token routed through a non-sensitive field (e.g. an Error
 * captured under `err`) is still scrubbed. Each branch requires a distinctive
 * prefix plus an ample body to minimise false positives on ordinary prose.
 */
const SECRET_TOKEN_PATTERN =
  /(?:Bearer|Basic|Token)\s+\S{8,}|sk-ant-[A-Za-z0-9_-]{16,}|sk-[A-Za-z0-9_-]{32,}|xox[bpoa]-[A-Za-z0-9-]{10,}|gh[opsu]_[A-Za-z0-9]{36,}|glpat-[A-Za-z0-9_-]{18,}|AIza[0-9A-Za-z_-]{35}|eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*|(?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret)(?:=|%3D)[A-Za-z0-9._~+/=-]{8,}/g;

/**
 * Scrub known credential shapes from an arbitrary string. Preserves the
 * Bearer/Basic/Token scheme prefix when present so the entry stays readable.
 * Exported so the logger can also scrub the human-authored message string
 * (defense-in-depth for the hotpath console.error sweep).
 */
export function maskSecretTokens(value: string): string {
  return value.replace(SECRET_TOKEN_PATTERN, (match) => {
    const scheme = /^(Bearer|Basic|Token)\s+/.exec(match);
    return scheme ? `${scheme[1]} [redacted]` : '[redacted]';
  });
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (depth >= MAX_DEPTH) {
    return '[max-depth]';
  }

  if (typeof value === 'string') {
    return truncateString(maskSecretTokens(maskAuthSchemeValue(value)));
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncateString(maskSecretTokens(value.message)),
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1));
  }

  if (typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      sanitized[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? '[redacted]'
        : sanitizeValue(nestedValue, depth + 1);
    }
    return sanitized;
  }

  return String(value);
}

export function redactContext(
  context: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!context) {
    return {};
  }

  return sanitizeValue(context, 0) as Record<string, unknown>;
}

export function redactErrorInfo(error: LogErrorInfo | undefined): LogErrorInfo | undefined {
  if (!error) {
    return undefined;
  }

  return sanitizeValue(error, 0) as LogErrorInfo;
}

/**
 * Redact sensitive values from a CLI argv array (e.g. for spawn-arg logging).
 *
 * Pairs every sensitive flag (`--token`, `--api-key`, etc.) with its following
 * argument and replaces that argument with `[redacted]`. Non-sensitive args
 * pass through unchanged.
 */
export function redactArgv(argv: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (SENSITIVE_ARGV_ASSIGNMENT_PATTERN.test(arg)) {
      const separatorIndex = arg.indexOf('=');
      out.push(`${arg.slice(0, separatorIndex + 1)}[redacted]`);
      continue;
    }
    out.push(arg);
    if (
      (SENSITIVE_ARGV_FLAG_PATTERN.test(arg) || SENSITIVE_SHORT_ARGV_FLAG_PATTERN.test(arg)) &&
      i + 1 < argv.length
    ) {
      out.push('[redacted]');
      i++;
    }
  }
  return out;
}
