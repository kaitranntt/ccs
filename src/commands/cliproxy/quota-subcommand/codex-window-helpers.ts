/**
 * Codex window classification + display helpers.
 *
 * Codex quota results include multiple rate-limit windows (5h usage, weekly
 * usage, code review, and "additional" feature windows like Codex Spark).
 * These helpers classify each window, pick display labels, and identify the
 * two "core usage" windows used in the per-account summary.
 */

import {
  sanitizeCodexFeatureLabel,
  sanitizeCodexFeatureLabelOrNull,
} from '../../../cliproxy/quota/quota-label-sanitizer';
import type { CodexQuotaResult } from '../../../cliproxy/quota/quota-types';
import { formatAbsoluteResetTime, formatResetTime, formatResetTimeISO } from './format-helpers';
import type { CodexWindowKind } from './types';

/** Subset of a Codex window used by label classification (for test ergonomics). */
export type CodexWindowSummary = Pick<
  CodexQuotaResult['windows'][number],
  'label' | 'resetAfterSeconds' | 'category' | 'cadence' | 'featureLabel'
>;

/** Render the reset time for a Codex window as either a relative or absolute label. */
export function formatCodexWindowReset(
  window: Pick<CodexQuotaResult['windows'][number], 'resetAfterSeconds' | 'resetAt'>
): string | null {
  if (typeof window.resetAfterSeconds === 'number' && isFinite(window.resetAfterSeconds)) {
    const relative = formatResetTime(Math.max(0, window.resetAfterSeconds));
    if (window.resetAfterSeconds >= 86400 && window.resetAt) {
      const absolute = formatAbsoluteResetTime(window.resetAt);
      return absolute ? `${relative} (${absolute})` : relative;
    }
    return relative;
  }

  if (window.resetAt) {
    return formatResetTimeISO(window.resetAt);
  }

  return null;
}

/** Classify a Codex window label into a known kind. */
export function getCodexWindowKind(label: string): CodexWindowKind {
  const lower = (label || '').toLowerCase();
  const isCodeReview = lower.includes('code review') || lower.includes('code_review');
  const isPrimary = lower.includes('primary');
  const isSecondary = lower.includes('secondary');

  if (isCodeReview) {
    if (isPrimary) return 'code-review-5h';
    if (isSecondary) return 'code-review-weekly';
    return 'code-review';
  }

  if (isPrimary) return 'usage-5h';
  if (isSecondary) return 'usage-weekly';
  return 'unknown';
}

/**
 * Infer whether a code-review window resets on the 5h or weekly cadence by
 * comparing its reset time against the 5h and weekly usage windows. Returns
 * null when no inference is possible.
 */
export function inferCodeReviewCadence(
  window: CodexWindowSummary,
  allWindows: CodexWindowSummary[]
): '5h' | 'weekly' | null {
  const kind = getCodexWindowKind(window.label);
  if (kind === 'code-review-weekly') return 'weekly';

  const reset = window.resetAfterSeconds;
  if (typeof reset !== 'number' || !isFinite(reset) || reset <= 0) return null;

  const usage5h = allWindows.find(
    (w) =>
      getCodexWindowKind(w.label) === 'usage-5h' &&
      typeof w.resetAfterSeconds === 'number' &&
      isFinite(w.resetAfterSeconds) &&
      w.resetAfterSeconds > 0
  );
  const usageWeekly = allWindows.find(
    (w) =>
      getCodexWindowKind(w.label) === 'usage-weekly' &&
      typeof w.resetAfterSeconds === 'number' &&
      isFinite(w.resetAfterSeconds) &&
      w.resetAfterSeconds > 0
  );

  if (!usage5h || !usageWeekly) return null;

  const diffTo5h = Math.abs(reset - (usage5h.resetAfterSeconds as number));
  const diffToWeekly = Math.abs(reset - (usageWeekly.resetAfterSeconds as number));
  return diffToWeekly <= diffTo5h ? 'weekly' : '5h';
}

/**
 * Strip a leading "GPT-X.Y-Codex-" prefix from a feature label and turn the
 * remainder into a Codex-prefixed display name. Other labels pass through unchanged.
 */
export function prettifyCodexFeatureLabel(featureLabel: unknown, fallbackLabel?: unknown): string {
  const trimmed =
    sanitizeCodexFeatureLabelOrNull(featureLabel) ??
    (fallbackLabel === undefined
      ? sanitizeCodexFeatureLabel(featureLabel)
      : sanitizeCodexFeatureLabel(fallbackLabel));
  const stripped = trimmed.replace(/^GPT-[\d.]+-Codex-/i, '');
  if (stripped !== trimmed && stripped.length > 0) {
    return `Codex ${stripped}`;
  }
  return trimmed;
}

/** Human-readable label for a Codex window, using metadata when available. */
export function getCodexWindowDisplayLabel(
  window: CodexWindowSummary,
  allWindows: CodexWindowSummary[] = []
): string {
  const context = allWindows.length > 0 ? allWindows : [window];

  // Prefer explicit category metadata when present (post-2026-04 windows).
  if (window.category === 'usage') {
    if (window.cadence === '5h') return '5h usage limit';
    if (window.cadence === 'weekly') return 'Weekly usage limit';
  }

  if (window.category === 'additional') {
    const pretty = prettifyCodexFeatureLabel(window.featureLabel, window.label);
    if (window.cadence === '5h') return `${pretty} (5h)`;
    if (window.cadence === 'weekly') return `${pretty} (weekly)`;
    return pretty;
  }

  if (window.category === 'code-review') {
    if (window.cadence === '5h') return 'Code review (5h)';
    if (window.cadence === 'weekly') return 'Code review (weekly)';
    return 'Code review';
  }

  // Legacy fallback: classify via label sniffing for cached windows without metadata.
  switch (getCodexWindowKind(window.label)) {
    case 'usage-5h':
      return '5h usage limit';
    case 'usage-weekly':
      return 'Weekly usage limit';
    case 'code-review-5h':
    case 'code-review-weekly':
    case 'code-review': {
      const inferred = inferCodeReviewCadence(window, context);
      if (inferred === '5h') return 'Code review (5h)';
      if (inferred === 'weekly') return 'Code review (weekly)';
      return 'Code review';
    }
    case 'unknown':
      return window.label;
  }
}

/**
 * Pick the two "core usage" windows (5h + weekly) out of a Codex result.
 *
 * Prefers explicit category metadata. Falls back to label sniffing for cached
 * windows, and finally to a best-effort guess based on reset times so the
 * summary line always has something useful to show.
 */
export function getCodexCoreUsageWindows(windows: CodexQuotaResult['windows']): {
  fiveHourWindow: CodexQuotaResult['windows'][number] | null;
  weeklyWindow: CodexQuotaResult['windows'][number] | null;
} {
  let fiveHourWindow: CodexQuotaResult['windows'][number] | null = null;
  let weeklyWindow: CodexQuotaResult['windows'][number] | null = null;
  const nonCodeReviewWindows: CodexQuotaResult['windows'] = [];

  // Prefer explicit category metadata when present so 'additional' windows
  // (e.g. GPT-5.3 Codex Spark) do not displace core usage windows in the summary.
  const hasCategoryMetadata = windows.some((window) => Boolean(window.category));

  if (hasCategoryMetadata) {
    for (const window of windows) {
      if (window.category === 'usage') {
        if (window.cadence === '5h' && !fiveHourWindow) fiveHourWindow = window;
        else if (window.cadence === 'weekly' && !weeklyWindow) weeklyWindow = window;
        nonCodeReviewWindows.push(window);
      }
      // 'code-review' and 'additional' are excluded from the core usage summary.
    }
  } else {
    for (const window of windows) {
      const kind = getCodexWindowKind(window.label);
      if (kind === 'usage-5h') {
        if (!fiveHourWindow) fiveHourWindow = window;
        nonCodeReviewWindows.push(window);
        continue;
      }
      if (kind === 'usage-weekly') {
        if (!weeklyWindow) weeklyWindow = window;
        nonCodeReviewWindows.push(window);
        continue;
      }
      if (kind === 'unknown') {
        nonCodeReviewWindows.push(window);
      }
    }
  }

  if ((!fiveHourWindow || !weeklyWindow) && nonCodeReviewWindows.length > 0) {
    const withReset = nonCodeReviewWindows
      .filter((w) => typeof w.resetAfterSeconds === 'number' && w.resetAfterSeconds >= 0)
      .sort((a, b) => (a.resetAfterSeconds || 0) - (b.resetAfterSeconds || 0));

    if (!fiveHourWindow) {
      fiveHourWindow = withReset[0] || nonCodeReviewWindows[0] || null;
    }

    if (!weeklyWindow) {
      weeklyWindow =
        withReset.length > 1
          ? withReset[withReset.length - 1]
          : nonCodeReviewWindows.find((w) => w !== fiveHourWindow) || null;
    }
  }

  return { fiveHourWindow, weeklyWindow };
}
