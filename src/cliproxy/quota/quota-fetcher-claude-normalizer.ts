/**
 * Claude Quota Response Normalization Helpers
 *
 * Parses Anthropic policy-limits or OAuth-usage payloads into normalized windows and core usage summary.
 */

import type { ClaudeCoreUsageSummary, ClaudeQuotaWindow } from './quota-types';
import { sanitizeQuotaLabelOrNull } from './quota-label-sanitizer';

// Distinguishes epoch milliseconds from seconds (1e12 ~= 2001-09-09T01:46:40Z).
const EPOCH_MS_THRESHOLD = 1e12;

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return undefined;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeTimestamp(value: unknown): string | null {
  const asNum = asNumber(value);
  if (asNum !== null) {
    const millis = asNum > EPOCH_MS_THRESHOLD ? asNum : asNum * 1000;
    const date = new Date(millis);
    return isNaN(date.getTime()) ? null : date.toISOString();
  }

  const str = asString(value);
  if (!str) return null;

  // Numeric strings can be either epoch seconds or epoch milliseconds.
  if (/^\d+$/.test(str)) {
    const numeric = Number(str);
    if (isFinite(numeric)) {
      const millis = numeric > EPOCH_MS_THRESHOLD ? numeric : numeric * 1000;
      const date = new Date(millis);
      return isNaN(date.getTime()) ? null : date.toISOString();
    }
  }

  const date = new Date(str);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

function getClaudeWindowLabel(rateLimitType: string): string {
  switch (rateLimitType) {
    case 'five_hour':
      return 'Session limit';
    case 'seven_day':
      return 'Weekly limit';
    case 'seven_day_opus':
      return 'Opus limit';
    case 'seven_day_sonnet':
      return 'Sonnet limit';
    case 'seven_day_oauth_apps':
      return 'OAuth apps limit';
    case 'seven_day_cowork':
      return 'Cowork limit';
    case 'overage':
      return 'Extra usage';
    default:
      if (!rateLimitType) return 'Unknown limit';
      return rateLimitType
        .split(/[_-]+/g)
        .filter((part) => part.length > 0)
        .map((part) =>
          /^\d+$/.test(part) ? part : `${part.charAt(0).toUpperCase()}${part.slice(1)}`
        )
        .join(' ');
  }
}

/** Units are dictated by the payload, never inferred from the value. */
type UtilizationUnit = 'ratio' | 'percent';

function normalizeUtilization(raw: Record<string, unknown>, unit: UtilizationUnit) {
  const utilization = asNumber(raw['utilization']);
  const used = asNumber(raw['usedPercent'] ?? raw['used_percent'] ?? raw['used_percentage']);
  const remaining = asNumber(raw['remainingPercent'] ?? raw['remaining_percent']);
  const usedPercent =
    utilization !== null
      ? unit === 'ratio'
        ? utilization * 100
        : utilization
      : (used ?? (remaining !== null ? 100 - remaining : null));
  if (usedPercent === null || usedPercent < 0 || usedPercent > 100) return null;
  return { utilization: usedPercent / 100, usedPercent, remainingPercent: 100 - usedPercent };
}

/** Known legacy IDs are the only safe fallback for metadata-free cached windows. */
export function getClaudeWindowMetadata(
  window: Pick<ClaudeQuotaWindow, 'rateLimitType' | 'scope' | 'cadence' | 'modelLabel'>
): Pick<ClaudeQuotaWindow, 'scope' | 'cadence' | 'modelLabel'> {
  if (window.scope !== undefined)
    return { scope: window.scope, cadence: window.cadence, modelLabel: window.modelLabel };
  switch (window.rateLimitType) {
    case 'five_hour':
      return { scope: 'account', cadence: '5h' };
    case 'seven_day':
      return { scope: 'account', cadence: 'weekly' };
    case 'seven_day_opus':
      return { scope: 'model', cadence: 'weekly', modelLabel: 'Opus' };
    case 'seven_day_sonnet':
      return { scope: 'model', cadence: 'weekly', modelLabel: 'Sonnet' };
    case 'fable_weekly':
    case 'fable_seven_day':
    case 'seven_day_fable':
      return { scope: 'model', cadence: 'weekly', modelLabel: 'Fable' };
    default:
      return { scope: 'unknown' };
  }
}

function normalizeModelLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeRateLimitType(value: unknown, fallbackKey?: string): string {
  const direct = asString(value);
  if (direct) return direct;
  if (fallbackKey) return fallbackKey;
  return '';
}

function toObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeRestriction(
  raw: Record<string, unknown>,
  fallbackKey: string | undefined,
  unit: UtilizationUnit
): ClaudeQuotaWindow | null {
  const rateLimitType = normalizeRateLimitType(
    raw['rateLimitType'] ?? raw['rate_limit_type'] ?? raw['claim'] ?? raw['claimAbbrev'],
    fallbackKey
  );
  if (!rateLimitType) return null;

  const status = asString(raw['status']) || 'unknown';
  const resetAt =
    normalizeTimestamp(raw['resetsAt'] ?? raw['resets_at'] ?? raw['resetAt'] ?? raw['reset_at']) ||
    null;
  const overageResetsAt =
    normalizeTimestamp(
      raw['overageResetsAt'] ??
        raw['overage_resets_at'] ??
        raw['overageResetAt'] ??
        raw['overage_reset_at']
    ) || null;

  const metrics = normalizeUtilization(raw, unit);
  if (!metrics) return null;
  const metadata = getClaudeWindowMetadata({ rateLimitType });

  return {
    rateLimitType,
    label: metadata.modelLabel
      ? metadata.modelLabel + ' weekly limit'
      : getClaudeWindowLabel(rateLimitType),
    ...metadata,
    status,
    ...metrics,
    resetAt,
    surpassedThreshold: asBoolean(raw['surpassedThreshold'] ?? raw['surpassed_threshold']),
    severity: asString(raw['severity']) || undefined,
    overageStatus: asString(raw['overageStatus'] ?? raw['overage_status']) || undefined,
    overageResetsAt,
    overageDisabledReason:
      asString(raw['overageDisabledReason'] ?? raw['overage_disabled_reason']) || undefined,
    isUsingOverage: asBoolean(raw['isUsingOverage'] ?? raw['is_using_overage']),
    hasExtraUsageEnabled: asBoolean(raw['hasExtraUsageEnabled'] ?? raw['has_extra_usage_enabled']),
  };
}

/**
 * Parse raw policy limits response into normalized windows.
 * Supports both policy-limits `restrictions` payloads and OAuth usage payloads
 * keyed by window name (`five_hour`, `seven_day`, `seven_day_sonnet`, ...).
 */
export function buildClaudeQuotaWindows(payload: Record<string, unknown>): ClaudeQuotaWindow[] {
  const windows: ClaudeQuotaWindow[] = [];
  // Parse modern rows first so valid scoped entries win over legacy aliases.
  if (Array.isArray(payload['limits'])) {
    for (const item of payload['limits']) {
      const raw = toObject(item);
      if (!raw) continue;
      const model = toObject(toObject(raw['scope'])?.['model']);
      const modelLabel = sanitizeQuotaLabelOrNull(model?.['display_name']);
      const kind = asString(raw['kind']);
      if (!kind) continue;
      const percent = asNumber(raw['percent']);
      if (percent === null) continue;
      const window = normalizeRestriction({ ...raw, utilization: percent }, kind, 'percent');
      if (!window) continue;
      if (kind !== 'weekly_scoped' || !modelLabel) {
        windows.push({ ...window, scope: 'unknown' });
        continue;
      }
      windows.push({
        ...window,
        rateLimitType: 'weekly_scoped:' + normalizeModelLabel(modelLabel),
        scope: 'model',
        cadence: 'weekly',
        modelLabel: modelLabel.replace(/\s+/g, ' '),
        label: modelLabel.replace(/\s+/g, ' ') + ' weekly limit',
      });
    }
  }
  const restrictions = payload['restrictions'];
  if (Array.isArray(restrictions)) {
    for (const item of restrictions) {
      const raw = toObject(item);
      const window = raw ? normalizeRestriction(raw, undefined, 'ratio') : null;
      if (window) windows.push(window);
    }
  } else if (toObject(restrictions)) {
    for (const [key, value] of Object.entries(restrictions as Record<string, unknown>)) {
      const raw = toObject(value);
      const window = raw ? normalizeRestriction(raw, key, 'ratio') : null;
      if (window) windows.push(window);
    }
  }
  for (const [key, value] of Object.entries(payload)) {
    if (key === 'extra_usage' || key === 'restrictions' || key === 'scope') continue;
    const raw = toObject(value);
    if (!raw) continue;
    const window = normalizeRestriction(raw, key, 'percent');
    if (window) windows.push(window);
  }
  if (windows.length === 0) {
    const direct = normalizeRestriction(payload, undefined, 'ratio');
    if (direct) windows.push(direct);
  }
  const seen = new Set<string>();
  return windows
    .filter((window) => {
      const key = [
        window.scope,
        window.cadence,
        window.modelLabel
          ? normalizeModelLabel(window.modelLabel)
          : window.scope === 'account'
            ? ''
            : window.rateLimitType,
      ].join(':');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.rateLimitType.localeCompare(b.rateLimitType));
}

function mapCoreWindow(window: ClaudeQuotaWindow | null): ClaudeCoreUsageSummary['fiveHour'] {
  if (!window) return null;
  return {
    rateLimitType: window.rateLimitType,
    label: window.label,
    remainingPercent: window.remainingPercent,
    resetAt: window.resetAt,
    status: window.status,
  };
}

/** Account-wide weekly quota only; model and unknown windows never bind account health. */
export function isClaudeWeeklyRateLimitType(rateLimitType: string): boolean {
  return rateLimitType === 'seven_day';
}

export function pickMostRestrictiveClaudeWeeklyWindow(
  windows: ClaudeQuotaWindow[]
): ClaudeQuotaWindow | null {
  return (
    windows.find(
      (window) =>
        window.rateLimitType === 'seven_day' && getClaudeWindowMetadata(window).scope === 'account'
    ) ?? null
  );
}

/** Rebuild from actual windows, never trust a previously collapsed core summary. */
export function buildClaudeCoreUsageSummary(windows: ClaudeQuotaWindow[]): ClaudeCoreUsageSummary {
  return {
    fiveHour: mapCoreWindow(
      windows.find(
        (window) =>
          window.rateLimitType === 'five_hour' &&
          getClaudeWindowMetadata(window).scope === 'account'
      ) ?? null
    ),
    weekly: mapCoreWindow(pickMostRestrictiveClaudeWeeklyWindow(windows)),
  };
}
