const CODEX_FEATURE_LABEL_FALLBACK = 'Additional';
const CODEX_FEATURE_LABEL_MAX_LENGTH = 80;
const TERMINAL_ESCAPE_SEQUENCE_REGEX =
  /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|\u001b\[[0-?]*[ -/]*[@-~]/g;
const TERMINAL_CONTROL_CHARS_REGEX = /[\u0000-\u001f\u007f-\u009f]/g;

/**
 * Sanitize upstream quota labels before storing or rendering them.
 *
 * The quota API is not schema-validated at runtime, so additional-rate-limit
 * labels must be constrained to safe, printable strings before they reach the
 * terminal.
 */
export function sanitizeQuotaLabelOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const sanitized = value
    .replace(TERMINAL_ESCAPE_SEQUENCE_REGEX, '')
    .replace(TERMINAL_CONTROL_CHARS_REGEX, '')
    .trim()
    .slice(0, CODEX_FEATURE_LABEL_MAX_LENGTH)
    .trimEnd();

  return sanitized.length > 0 ? sanitized : null;
}

export const sanitizeCodexFeatureLabelOrNull = sanitizeQuotaLabelOrNull;

export function sanitizeCodexFeatureLabel(value: unknown): string {
  return sanitizeCodexFeatureLabelOrNull(value) ?? CODEX_FEATURE_LABEL_FALLBACK;
}
