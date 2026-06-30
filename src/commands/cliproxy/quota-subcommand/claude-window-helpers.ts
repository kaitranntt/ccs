/**
 * Claude window classification + display helpers.
 *
 * Claude quota results include multiple policy windows (5h, weekly, weekly
 * per-model variants like Opus/Sonnet, overage, etc.). These helpers classify
 * each window and extract the two "core usage" windows for the summary line.
 */

import type { ClaudeQuotaResult } from '../../../cliproxy/quota/quota-types';
import { pickMostRestrictiveClaudeWeeklyWindow } from '../../../cliproxy/quota/quota-fetcher-claude-normalizer';
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
      return window.label;
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
 * Prefers the explicit coreUsage metadata. Falls back to the 'five_hour'
 * window and the most restrictive weekly window when metadata is absent.
 */
export function getClaudeCoreUsageWindows(quota: ClaudeQuotaResult): {
  fiveHourWindow: ClaudeDisplayWindow | null;
  weeklyWindow: ClaudeDisplayWindow | null;
} {
  const coreUsage = quota.coreUsage;
  const fiveHourFromCore = toClaudeCoreDisplayWindow(coreUsage?.fiveHour ?? null);
  const weeklyFromCore = toClaudeCoreDisplayWindow(coreUsage?.weekly ?? null);
  if (fiveHourFromCore || weeklyFromCore) {
    return {
      fiveHourWindow: fiveHourFromCore,
      weeklyWindow: weeklyFromCore,
    };
  }

  const fiveHourPolicy =
    quota.windows.find((window) => window.rateLimitType === 'five_hour') ?? null;
  const weeklyPolicy = pickMostRestrictiveClaudeWeeklyWindow(quota.windows);

  return {
    fiveHourWindow: fiveHourPolicy ? toClaudeDisplayWindow(fiveHourPolicy) : null,
    weeklyWindow: weeklyPolicy ? toClaudeDisplayWindow(weeklyPolicy) : null,
  };
}
