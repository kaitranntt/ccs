/**
 * Shared Quota Tooltip Content Component
 * Displays provider-specific quota information in tooltips
 */

import { Clock } from 'lucide-react';
import {
  cn,
  formatQuotaPercent,
  formatResetTime,
  getCodexQuotaBreakdown,
  getQuotaFailureInfo,
  getCodexWindowDisplayLabel,
  getModelsWithTiers,
  groupModelsByTier,
  isAgyQuotaResult,
  isClaudeQuotaResult,
  isCodexQuotaResult,
  isGeminiQuotaResult,
  isGhcpQuotaResult,
  type ModelTier,
  type UnifiedQuotaResult,
} from '@/lib/utils';
import type { ProviderEntitlementEvidence } from '@/lib/api-client';
import { useTranslation } from 'react-i18next';

interface QuotaTooltipContentProps {
  quota: UnifiedQuotaResult | null | undefined;
  resetTime: string | null;
}

const lowQuotaTextClass = 'text-red-700 dark:text-red-400';

function formatPlanLabel(planType: string | null | undefined): string | null {
  if (!planType) return null;
  const normalized = planType
    .split(/[\s_-]+/g)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
  return normalized.length > 0 ? normalized.join(' ') : planType;
}

function formatAbsoluteResetTime(resetTime: string | null): string | null {
  if (!resetTime) return null;
  try {
    const parsed = new Date(resetTime);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleString(undefined, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return null;
  }
}

function getClaudeWindowDisplayLabel(
  rateLimitType: string,
  fallback: string,
  t: (key: string) => string
): string {
  switch (rateLimitType) {
    case 'five_hour':
      return t('quotaTooltip.fiveHourLimit');
    case 'seven_day':
      return t('quotaTooltip.weeklyLimit');
    case 'seven_day_opus':
      return t('quotaTooltip.weeklyOpus');
    case 'seven_day_sonnet':
      return t('quotaTooltip.weeklySonnet');
    case 'seven_day_oauth_apps':
      return t('quotaTooltip.weeklyOAuthApps');
    case 'seven_day_cowork':
      return t('quotaTooltip.weeklyCowork');
    case 'overage':
      return t('quotaTooltip.extraUsage');
    default:
      return fallback;
  }
}

function formatGeminiTokenType(tokenType: string | null | undefined): string | null {
  if (!tokenType) return null;

  switch (tokenType.trim().toLowerCase()) {
    case 'requests':
      return 'Requests';
    case 'input':
      return 'Input tokens';
    case 'output':
      return 'Output tokens';
    default:
      return tokenType
        .split(/[\s_-]+/g)
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
  }
}

function formatGeminiBucketLabel(label: string): string {
  switch (label) {
    case 'Gemini Flash Lite Series':
      return 'Flash Lite';
    case 'Gemini Flash Series':
      return 'Flash';
    case 'Gemini Pro Series':
      return 'Pro';
    default:
      return label;
  }
}

function formatGeminiBucketModels(modelIds: string[] | undefined): string | null {
  const uniqueModelIds = Array.from(new Set((modelIds || []).filter(Boolean)));
  return uniqueModelIds.length > 0 ? uniqueModelIds.join(', ') : null;
}

function formatGeminiRemainingAmount(
  remainingAmount: number | null | undefined,
  tokenType: string | null | undefined,
  t: (key: string, options?: Record<string, unknown>) => string
): string | null {
  if (remainingAmount === null || remainingAmount === undefined) return null;

  const formattedAmount = remainingAmount.toLocaleString();
  switch (tokenType?.trim().toLowerCase()) {
    case 'requests':
      return t('quotaTooltip.requestsRemaining', { count: formattedAmount });
    case 'input':
      return t('quotaTooltip.inputTokensRemaining', { count: formattedAmount });
    case 'output':
      return t('quotaTooltip.outputTokensRemaining', { count: formattedAmount });
    default:
      return t('quotaTooltip.amountRemaining', { count: formattedAmount });
  }
}

function renderEntitlementRows(
  entitlement: ProviderEntitlementEvidence | undefined,
  t: (key: string) => string
) {
  if (!entitlement) return null;

  const rows: Array<{ label: string; value: string | null }> = [];
  if (entitlement.rawTierLabel) {
    rows.push({ label: t('quotaTooltip.tier'), value: entitlement.rawTierLabel });
  } else if (entitlement.normalizedTier !== 'unknown') {
    rows.push({ label: t('quotaTooltip.tier'), value: entitlement.normalizedTier });
  }
  if (entitlement.rawTierId) {
    rows.push({ label: t('quotaTooltip.tierId'), value: entitlement.rawTierId });
  }
  if (entitlement.accessState !== 'entitled' || entitlement.capacityState !== 'available') {
    rows.push({
      label: t('quotaTooltip.state'),
      value: `${entitlement.accessState.replaceAll('_', ' ')} / ${entitlement.capacityState.replaceAll('_', ' ')}`,
    });
  }

  if (rows.length === 0) return null;

  return rows.map((row) => (
    <div key={row.label} className="flex justify-between gap-4">
      <span className="text-muted-foreground">{row.label}</span>
      <span className="font-mono">{row.value}</span>
    </div>
  ));
}

/**
 * Renders provider-specific quota tooltip content
 * Uses type guards for proper TypeScript narrowing
 */
export function QuotaTooltipContent({ quota, resetTime }: QuotaTooltipContentProps) {
  const { t } = useTranslation();

  if (!quota) {
    return <p className="text-xs text-muted-foreground">{t('quotaTooltip.loadingQuota')}</p>;
  }

  if (!quota.success) {
    const failureInfo = getQuotaFailureInfo(quota);
    const failureToneClass =
      failureInfo?.tone === 'destructive'
        ? 'text-destructive'
        : failureInfo?.tone === 'warning'
          ? 'text-amber-700 dark:text-amber-300'
          : 'text-foreground';

    return (
      <div className="max-w-sm space-y-2 text-xs">
        <div className="space-y-1">
          <p className={cn('font-semibold tracking-tight', failureToneClass)}>
            {failureInfo?.label || quota.error || t('quotaTooltip.failedLoadQuota')}
          </p>
          <p className="leading-relaxed text-foreground/90">
            {failureInfo?.summary || quota.error}
          </p>
        </div>
        {failureInfo?.actionHint && (
          <div className="rounded-md border border-border/70 bg-muted/35 px-2.5 py-2 text-foreground/80">
            {failureInfo.actionHint}
          </div>
        )}
        {failureInfo?.technicalDetail && (
          <div className="rounded-md border border-border/60 bg-muted/25 px-2 py-1.5 font-mono text-[11px] text-foreground/75">
            {failureInfo.technicalDetail}
          </div>
        )}
        {failureInfo?.rawDetail && (
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/70 bg-muted/55 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-foreground/85">
            {failureInfo.rawDetail}
          </pre>
        )}
      </div>
    );
  }

  // Antigravity (agy) provider tooltip
  if (isAgyQuotaResult(quota)) {
    const tiered = getModelsWithTiers(quota.models || []);
    const groups = groupModelsByTier(tiered);
    const tierOrder: ModelTier[] = ['primary', 'gemini-3', 'gemini-2', 'other'];

    return (
      <div className="text-xs space-y-1.5">
        {renderEntitlementRows(quota.entitlement, t)}
        <p className="font-medium">{t('quotaTooltip.modelQuotas')}</p>
        {tierOrder.map((tier, idx) => {
          const models = groups.get(tier);
          if (!models || models.length === 0) return null;
          const isFirst = tierOrder.slice(0, idx).every((t) => !groups.get(t)?.length);
          return (
            <div key={tier}>
              {!isFirst && <div className="my-1 border-t border-border/40" />}
              {models.map((m) => (
                <div key={m.name} className="flex justify-between gap-4">
                  <span className={cn('truncate', m.exhausted && lowQuotaTextClass)}>
                    {m.displayName}
                  </span>
                  <span className={cn('font-mono', m.exhausted && lowQuotaTextClass)}>
                    {m.percentage}%
                  </span>
                </div>
              ))}
            </div>
          );
        })}
        <ResetTimeIndicator resetTime={resetTime} />
      </div>
    );
  }

  // Codex provider tooltip
  if (isCodexQuotaResult(quota)) {
    const { fiveHourWindow, weeklyWindow, codeReviewWindows, additionalWindows, unknownWindows } =
      getCodexQuotaBreakdown(quota.windows);
    const fiveHourResetAt = quota.coreUsage?.fiveHour?.resetAt ?? fiveHourWindow?.resetAt ?? null;
    const weeklyResetAt = quota.coreUsage?.weekly?.resetAt ?? weeklyWindow?.resetAt ?? null;
    const orderedWindows = [
      fiveHourWindow,
      weeklyWindow,
      ...codeReviewWindows,
      ...additionalWindows,
      ...unknownWindows,
    ]
      .filter((w): w is NonNullable<typeof w> => !!w)
      .filter(
        (w, index, arr) =>
          arr.findIndex(
            (candidate) => candidate.label === w.label && candidate.resetAt === w.resetAt
          ) === index
      );

    return (
      <div className="text-xs space-y-1.5">
        <p className="font-medium">{t('quotaTooltip.rateLimits')}</p>
        {quota.planType && (
          <p className="text-muted-foreground">
            {t('quotaTooltip.plan', { plan: quota.planType })}
          </p>
        )}
        {orderedWindows.map((w, index) => (
          <div
            key={`${w.label}-${w.resetAt ?? 'no-reset'}-${index}`}
            className="flex justify-between gap-4"
          >
            <span className={cn(w.remainingPercent < 20 && lowQuotaTextClass)}>
              {getCodexWindowDisplayLabel(w, orderedWindows)}
            </span>
            <span className="font-mono">{w.remainingPercent}%</span>
          </div>
        ))}
        <CodexResetIndicators
          fiveHourResetTime={fiveHourResetAt}
          weeklyResetTime={weeklyResetAt}
          fallbackResetTime={resetTime}
        />
      </div>
    );
  }

  // Claude provider tooltip
  if (isClaudeQuotaResult(quota)) {
    const coreWindows = [quota.coreUsage?.fiveHour, quota.coreUsage?.weekly]
      .filter((window): window is NonNullable<typeof window> => !!window)
      .map((window) => ({
        rateLimitType: window.rateLimitType,
        label: window.label,
        remainingPercent: window.remainingPercent,
        resetAt: window.resetAt,
        status: window.status,
      }));
    const policyWindows = quota.windows.map((window) => ({
      rateLimitType: window.rateLimitType,
      label: window.label,
      remainingPercent: window.remainingPercent,
      resetAt: window.resetAt,
      status: window.status,
    }));
    const orderedWindows = [...coreWindows, ...policyWindows].filter(
      (window, index, arr) =>
        arr.findIndex(
          (candidate) =>
            candidate.rateLimitType === window.rateLimitType &&
            candidate.resetAt === window.resetAt &&
            candidate.status === window.status
        ) === index
    );

    const fiveHourResetAt =
      quota.coreUsage?.fiveHour?.resetAt ??
      quota.windows.find((window) => window.rateLimitType === 'five_hour')?.resetAt ??
      null;
    const weeklyResetAt =
      quota.coreUsage?.weekly?.resetAt ??
      quota.windows.find((window) =>
        [
          'seven_day',
          'seven_day_opus',
          'seven_day_sonnet',
          'seven_day_oauth_apps',
          'seven_day_cowork',
        ].includes(window.rateLimitType)
      )?.resetAt ??
      null;

    return (
      <div className="text-xs space-y-1.5">
        <p className="font-medium">{t('quotaTooltip.rateLimits')}</p>
        {orderedWindows.map((window, index) => (
          <div
            key={`${window.rateLimitType}-${window.resetAt ?? 'no-reset'}-${window.status}-${index}`}
            className="flex justify-between gap-4"
          >
            <span className={cn(window.remainingPercent < 20 && lowQuotaTextClass)}>
              {getClaudeWindowDisplayLabel(window.rateLimitType, window.label, t)}
            </span>
            <span className="font-mono">{window.remainingPercent}%</span>
          </div>
        ))}
        <CodexResetIndicators
          fiveHourResetTime={fiveHourResetAt}
          weeklyResetTime={weeklyResetAt}
          fallbackResetTime={resetTime}
        />
        {quota.stale && (
          <p className="text-amber-700 dark:text-amber-300">
            {t('quotaTooltip.staleAsOf', {
              time: new Date(quota.lastUpdated).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
            })}
          </p>
        )}
      </div>
    );
  }

  // Gemini provider tooltip
  if (isGeminiQuotaResult(quota)) {
    const hasBucketResetTime = quota.buckets.some((bucket) => !!bucket.resetTime);
    const hasEntitlementTier =
      !!quota.entitlement?.rawTierLabel ||
      (!!quota.entitlement && quota.entitlement.normalizedTier !== 'unknown');
    const distinctTokenTypes = Array.from(
      new Set(
        quota.buckets
          .map((bucket) => formatGeminiTokenType(bucket.tokenType))
          .filter((tokenType): tokenType is string => !!tokenType)
      )
    );
    const sharedTokenType = distinctTokenTypes.length === 1 ? distinctTokenTypes[0] : null;

    return (
      <div className="text-xs space-y-1.5">
        {renderEntitlementRows(quota.entitlement, t)}
        {!hasEntitlementTier && quota.tierLabel && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{t('quotaTooltip.tier')}</span>
            <span className="font-mono">{quota.tierLabel}</span>
          </div>
        )}
        {quota.creditBalance !== null && quota.creditBalance !== undefined && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{t('quotaTooltip.credits')}</span>
            <span className="font-mono">{quota.creditBalance.toLocaleString()}</span>
          </div>
        )}
        <div className="space-y-1">
          <p className="font-medium">{t('quotaTooltip.modelQuotasLower')}</p>
          {sharedTokenType && (
            <p className="text-[11px] text-muted-foreground">
              {t('quotaTooltip.allBucketsReport', { tokenType: sharedTokenType })}
            </p>
          )}
        </div>
        {quota.buckets.map((bucket) => {
          const bucketTokenType = sharedTokenType ? null : formatGeminiTokenType(bucket.tokenType);
          const bucketModels = formatGeminiBucketModels(bucket.modelIds);
          const remainingAmountLabel = formatGeminiRemainingAmount(
            bucket.remainingAmount,
            bucket.tokenType,
            t
          );

          return (
            <div key={bucket.id} className="space-y-0.5">
              <div className="flex justify-between gap-4">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className={cn(bucket.remainingPercent < 20 && lowQuotaTextClass)}>
                      {formatGeminiBucketLabel(bucket.label)}
                    </span>
                    {bucketTokenType && (
                      <span className="rounded border border-border/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {bucketTokenType}
                      </span>
                    )}
                  </div>
                  {bucketModels && (
                    <div className="break-words text-[11px] text-muted-foreground">
                      {bucketModels}
                    </div>
                  )}
                </div>
                <span className="shrink-0 font-mono">{bucket.remainingPercent}%</span>
              </div>
              {(remainingAmountLabel || bucket.resetTime) && (
                <div className="flex justify-between gap-4 text-[11px] text-muted-foreground">
                  <span>{remainingAmountLabel ?? ''}</span>
                  <span>{formatAbsoluteResetTime(bucket.resetTime) ?? ''}</span>
                </div>
              )}
            </div>
          );
        })}
        {!hasBucketResetTime && <ResetTimeIndicator resetTime={resetTime} />}
      </div>
    );
  }

  // GitHub Copilot (ghcp) provider tooltip
  if (isGhcpQuotaResult(quota)) {
    const snapshotRows = [
      {
        label: t('quotaTooltip.premiumInteractions'),
        snapshot: quota.snapshots.premiumInteractions,
      },
      { label: t('quotaTooltip.chat'), snapshot: quota.snapshots.chat },
      { label: t('quotaTooltip.completions'), snapshot: quota.snapshots.completions },
    ].filter(({ snapshot }) => snapshot.reported !== false);
    const effectiveResetTime = quota.quotaResetDate ?? resetTime;
    const planLabel = formatPlanLabel(quota.planType);

    return (
      <div className="text-xs space-y-1.5">
        <p className="font-medium">{t('quotaTooltip.quotaSnapshots')}</p>
        {planLabel && (
          <p className="text-muted-foreground">{t('quotaTooltip.plan', { plan: planLabel })}</p>
        )}
        {snapshotRows.map(({ label, snapshot }) => {
          const isLow = snapshot.percentRemaining < 20;
          return (
            <div key={label} className="space-y-0.5">
              <div className="flex justify-between gap-4">
                <span className={cn(isLow && lowQuotaTextClass)}>{label}</span>
                <span className={cn('font-mono', isLow && lowQuotaTextClass)}>
                  {snapshot.unlimited
                    ? t('quotaTooltip.unlimited')
                    : `${formatQuotaPercent(snapshot.percentRemaining)}%`}
                </span>
              </div>
              {!snapshot.unlimited && (
                <div className="text-[11px] text-muted-foreground">
                  {t('quotaTooltip.remaining', {
                    remaining: snapshot.remaining,
                    entitlement: snapshot.entitlement,
                  })}
                </div>
              )}
            </div>
          );
        })}
        <ResetTimeIndicator resetTime={effectiveResetTime} />
      </div>
    );
  }

  return null;
}

/**
 * Reset time indicator shown at bottom of tooltip
 */
function ResetTimeIndicator({ resetTime }: { resetTime: string | null }) {
  const { t } = useTranslation();

  if (!resetTime) return null;

  return (
    <div className="flex items-center gap-1.5 border-t border-border/60 pt-1">
      <Clock className="h-3 w-3 text-sky-600 dark:text-sky-300" />
      <span className="font-medium text-sky-600 dark:text-sky-300">
        {t('quotaTooltip.resets', { time: formatResetTime(resetTime) })}
      </span>
    </div>
  );
}

function CodexResetIndicators({
  fiveHourResetTime,
  weeklyResetTime,
  fallbackResetTime,
}: {
  fiveHourResetTime: string | null;
  weeklyResetTime: string | null;
  fallbackResetTime: string | null;
}) {
  const { t } = useTranslation();

  const hasSpecificReset = !!fiveHourResetTime || !!weeklyResetTime;
  if (!hasSpecificReset && !fallbackResetTime) return null;

  return (
    <div className="space-y-1 border-t border-border/60 pt-1">
      {fiveHourResetTime && (
        <div className="flex items-center gap-1.5">
          <Clock className="h-3 w-3 text-sky-600 dark:text-sky-300" />
          <span className="font-medium text-sky-600 dark:text-sky-300">
            {t('quotaTooltip.fiveHourResets', { time: formatResetTime(fiveHourResetTime) })}
          </span>
        </div>
      )}
      {weeklyResetTime && (
        <div className="flex items-center gap-1.5">
          <Clock className="h-3 w-3 text-indigo-600 dark:text-indigo-300" />
          <span className="font-medium text-indigo-600 dark:text-indigo-300">
            {t('quotaTooltip.weeklyResets', { time: formatResetTime(weeklyResetTime) })}
          </span>
        </div>
      )}
      {!hasSpecificReset && fallbackResetTime && (
        <ResetTimeIndicator resetTime={fallbackResetTime} />
      )}
    </div>
  );
}
