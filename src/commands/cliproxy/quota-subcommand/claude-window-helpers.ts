/**
 * Claude window classification + display helpers.
 *
 * Claude quota results include multiple policy windows (5h, weekly, weekly
 * per-model variants like Opus/Sonnet, overage, etc.). These helpers classify
 * each window and extract the two "core usage" windows for the summary line.
 */

import type { ClaudeQuotaResult } from '../../../cliproxy/quota/quota-types';
import { buildClaudeCoreUsageSummary } from '../../../cliproxy/quota/quota-fetcher-claude-normalizer';
import type { ClaudeDisplayWindow } from './types';

/** Human-readable label for a Claude window based on its rate-limit type. */
export function getClaudeWindowDisplayLabel(
  window: Pick<ClaudeDisplayWindow, 'rateLimitType' | 'label'>
): string {
  switch (window.rateLimitType) {
    case 'five_hour':
      return '5h usage limit';
    case 'seven_day':
      return 'Weekly usage limit';
    case 'seven_day_opus':
      return 'Weekly usage (Opus)';
    case 'seven_day_sonnet':
      return 'Weekly usage (Sonnet)';
    case 'seven_day_oauth_apps':
      return 'Weekly usage (OAuth apps)';
    case 'seven_day_cowork':
      return 'Weekly usage (Cowork)';
    case 'overage':
      return 'Extra usage';
    default:
      return window.label.replace(/[^\x20-\x7e]/g, '');
  }
}

/** Convert a raw Claude quota window into the normalized display shape. */
export function toClaudeDisplayWindow(
  window: ClaudeQuotaResult['windows'][number]
): ClaudeDisplayWindow {
  return {
    rateLimitType: window.rateLimitType,
    label: window.label,
    remainingPercent: window.remainingPercent,
    resetAt: window.resetAt,
    status: window.status,
  };
}

/** Convert a coreUsage 5h/weekly sub-window into the display shape (or null). */
export function toClaudeCoreDisplayWindow(
  window: NonNullable<ClaudeQuotaResult['coreUsage']>['fiveHour']
): ClaudeDisplayWindow | null {
  if (!window) return null;
  return {
    rateLimitType: window.rateLimitType,
    label: window.label,
    remainingPercent: window.remainingPercent,
    resetAt: window.resetAt,
    status: window.status,
  };
}

/**
 * Pick the two "core usage" windows (5h + weekly) for a Claude result.
 *
 * Rebuilds account-wide slots from windows, ignoring old collapsed metadata.
 */
export function getClaudeCoreUsageWindows(quota: ClaudeQuotaResult): {
  fiveHourWindow: ClaudeDisplayWindow | null;
  weeklyWindow: ClaudeDisplayWindow | null;
} {
  const coreUsage = buildClaudeCoreUsageSummary(quota.windows);
  return {
    fiveHourWindow: toClaudeCoreDisplayWindow(coreUsage.fiveHour),
    weeklyWindow: toClaudeCoreDisplayWindow(coreUsage.weekly),
  };
}
