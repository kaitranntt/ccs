import type { ClaudeQuotaResult, ClaudeQuotaWindow } from './api-client';

/** Classify older responses only by known IDs, never by a collapsed core summary. */
export function getClaudeWindowScope(window: ClaudeQuotaWindow) {
  if (window.scope !== undefined) return window.scope;
  if (['five_hour', 'seven_day'].includes(window.rateLimitType)) return 'account';
  if (
    [
      'seven_day_opus',
      'seven_day_sonnet',
      'fable_weekly',
      'fable_seven_day',
      'seven_day_fable',
    ].includes(window.rateLimitType)
  )
    return 'model';
  return 'unknown';
}

export function getClaudeAccountWindows(quota: ClaudeQuotaResult) {
  return quota.windows.filter(
    (window) =>
      getClaudeWindowScope(window) === 'account' &&
      ['five_hour', 'seven_day'].includes(window.rateLimitType)
  );
}
