import {
  cn,
  formatQuotaPercent,
  getCodexQuotaBreakdown,
  getProviderMinQuota,
  getProviderResetTime,
  getQuotaFailureInfo,
  isClaudeQuotaResult,
  isCodexQuotaResult,
} from '@/lib/utils';
import { QuotaTooltipContent } from '@/components/shared/quota-tooltip-content';
import type { UnifiedQuotaResult } from '@/hooks/use-cliproxy-stats';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  KeyRound,
  Loader2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

type AccountSurfaceMode = 'compact' | 'detailed';

interface QuotaRow {
  id: string;
  label: string;
  compactLabel: string;
  value: number;
}

interface AccountQuotaPanelProps {
  provider: string;
  quota?: UnifiedQuotaResult;
  quotaLoading?: boolean;
  runtimeLastUsed?: string;
  mode: AccountSurfaceMode;
  className?: string;
}

function getQuotaColor(percentage: number): string {
  const clamped = Math.max(0, Math.min(100, percentage));
  if (clamped <= 20) return 'bg-destructive';
  if (clamped <= 50) return 'bg-yellow-500';
  return 'bg-green-500';
}

function getQuotaTextColor(percentage: number): string {
  const clamped = Math.max(0, Math.min(100, percentage));
  if (clamped <= 20) return 'text-red-600 dark:text-red-400';
  if (clamped <= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

function getDisplayQuotaValue(value: number): number {
  return Number(formatQuotaPercent(value));
}

function formatRelativeTime(dateStr: string | undefined): string {
  if (!dateStr) return '';

  try {
    const date = new Date(dateStr);
    const diff = Date.now() - date.getTime();
    if (diff < 0) return 'just now';

    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  } catch {
    return '';
  }
}

function isRecentlyUsed(lastUsedAt: string | undefined): boolean {
  if (!lastUsedAt) return false;

  try {
    return Date.now() - new Date(lastUsedAt).getTime() < 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function AccountQuotaPanel({
  provider,
  quota,
  quotaLoading,
  runtimeLastUsed,
  mode,
  className,
}: AccountQuotaPanelProps) {
  const { t } = useTranslation();
  const normalizedProvider = provider.toLowerCase();
  const isCodexProvider = normalizedProvider === 'codex';
  const isClaudeProvider = normalizedProvider === 'claude' || normalizedProvider === 'anthropic';
  const minQuota = getProviderMinQuota(provider, quota);
  const resetTime = getProviderResetTime(provider, quota);
  const minQuotaLabel = minQuota !== null ? formatQuotaPercent(minQuota) : null;
  const minQuotaValue = minQuotaLabel !== null ? Number(minQuotaLabel) : null;
  const failureInfo = getQuotaFailureInfo(quota);
  const FailureIcon =
    failureInfo?.label === 'Reauth'
      ? KeyRound
      : failureInfo?.tone === 'warning'
        ? AlertTriangle
        : AlertCircle;

  const codexBreakdown =
    isCodexProvider && quota && isCodexQuotaResult(quota)
      ? getCodexQuotaBreakdown(quota.windows)
      : null;
  const compactQuotaRows: QuotaRow[] = isCodexProvider
    ? [
        {
          id: 'five-hour',
          label: t('quotaTooltip.fiveHourLimit'),
          compactLabel: '5h',
          value: codexBreakdown?.fiveHourWindow?.remainingPercent ?? null,
        },
        {
          id: 'weekly',
          label: t('quotaTooltip.weeklyLimit'),
          compactLabel: 'Week',
          value: codexBreakdown?.weeklyWindow?.remainingPercent ?? null,
        },
      ].filter((row): row is QuotaRow => row.value !== null)
    : isClaudeProvider && quota && isClaudeQuotaResult(quota)
      ? quota.success
        ? quota.windows.map((window) => ({
            id: window.rateLimitType,
            label:
              window.rateLimitType === 'five_hour'
                ? t('quotaTooltip.fiveHourLimit')
                : window.rateLimitType === 'seven_day'
                  ? t('quotaTooltip.weeklyLimit')
                  : window.label,
            compactLabel:
              window.rateLimitType === 'five_hour'
                ? '5h'
                : window.rateLimitType === 'seven_day'
                  ? 'Week'
                  : (window.modelLabel ?? window.label),
            value: window.remainingPercent,
          }))
        : []
      : [];
  const quotaRows = compactQuotaRows;

  if (quotaLoading) {
    return (
      <div className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>
          {mode === 'compact' ? t('accountCard.quotaLoading') : t('accountQuotaPanel.loadingQuota')}
        </span>
      </div>
    );
  }

  if (minQuotaValue !== null || quotaRows.length > 0) {
    return (
      <div className={cn(mode === 'compact' ? 'px-0.5' : '', className)}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {mode === 'compact' ? (
                <div className="cursor-help">
                  {quotaRows.length > 0 ? (
                    <div className="space-y-1">
                      {quotaRows.map((row) => (
                        <div
                          key={row.id}
                          className="grid grid-cols-[minmax(2rem,auto)_minmax(0,1fr)_2rem] items-center gap-x-1 text-[7px]"
                        >
                          <span className="font-semibold uppercase leading-none text-muted-foreground/75">
                            {row.compactLabel}
                          </span>
                          <Progress
                            value={getDisplayQuotaValue(row.value)}
                            aria-label={`${row.compactLabel} quota`}
                            className="h-1.5"
                            indicatorClassName={getQuotaColor(row.value)}
                          />
                          <span
                            className={cn(
                              'text-right font-mono text-[10px] font-bold leading-none',
                              getQuotaTextColor(row.value)
                            )}
                          >
                            {formatQuotaPercent(row.value)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[8px] text-muted-foreground/70 uppercase font-bold tracking-tight">
                          {t('accountCard.quota')}
                        </span>
                        <span
                          className={cn(
                            'text-[10px] font-mono font-bold',
                            (minQuotaValue ?? 0) > 50
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : (minQuotaValue ?? 0) > 20
                                ? 'text-amber-500'
                                : 'text-red-500'
                          )}
                        >
                          {minQuotaLabel}%
                        </span>
                      </div>
                      <Progress
                        value={minQuotaValue ?? 0}
                        aria-label="Quota"
                        className="h-1"
                        indicatorClassName={
                          (minQuotaValue ?? 0) > 50
                            ? 'bg-emerald-500'
                            : (minQuotaValue ?? 0) > 20
                              ? 'bg-amber-500'
                              : 'bg-red-500'
                        }
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5 cursor-help">
                  <div className="flex items-center gap-1.5 text-xs">
                    {isRecentlyUsed(runtimeLastUsed) ? (
                      <>
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {/* TODO i18n: missing key for "Active" */}Active ·{' '}
                          {formatRelativeTime(runtimeLastUsed)}
                        </span>
                      </>
                    ) : runtimeLastUsed ? (
                      <>
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {/* TODO i18n: missing key for "Last used" */}Last used{' '}
                          {formatRelativeTime(runtimeLastUsed)}
                        </span>
                      </>
                    ) : (
                      <>
                        <HelpCircle className="w-3 h-3 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {t('accountCardStats.notUsedYet')}
                        </span>
                      </>
                    )}
                  </div>
                  {quotaRows.length > 0 ? (
                    <div className="space-y-2">
                      {quotaRows.map((row) => (
                        <div key={row.id} className="space-y-1">
                          <div className="flex items-center justify-between gap-2 text-[10px]">
                            <span className="min-w-0 truncate text-muted-foreground">
                              {row.label}
                            </span>
                            <span
                              className={cn(
                                'shrink-0 font-mono font-semibold',
                                getQuotaTextColor(row.value)
                              )}
                            >
                              {formatQuotaPercent(row.value)}%
                            </span>
                          </div>
                          <Progress
                            value={getDisplayQuotaValue(row.value)}
                            aria-label={`${row.label} quota`}
                            className="h-2"
                            indicatorClassName={getQuotaColor(row.value)}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Progress
                        value={Math.max(0, Math.min(100, minQuotaValue ?? 0))}
                        aria-label="Quota"
                        className="h-2 flex-1"
                        indicatorClassName={getQuotaColor(minQuotaValue ?? 0)}
                      />
                      <span className="text-xs font-medium w-10 text-right">{minQuotaLabel}%</span>
                    </div>
                  )}
                </div>
              )}
            </TooltipTrigger>
            <TooltipContent side={mode === 'compact' ? 'top' : 'bottom'} className="sm:max-w-sm">
              <QuotaTooltipContent quota={quota} resetTime={resetTime} />
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  if (quota?.success) {
    return mode === 'compact' ? (
      <div className={cn('text-[8px] text-muted-foreground/60', className)}>
        {t('accountCard.quotaUnavailable')}
      </div>
    ) : (
      <div className={className}>
        <Badge
          variant="outline"
          className="text-[10px] h-5 px-2 gap-1 border-muted-foreground/50 text-muted-foreground"
        >
          <HelpCircle className="w-3 h-3" />
          {t('accountCard.quotaUnavailable')}
        </Badge>
      </div>
    );
  }

  if (!failureInfo) {
    return null;
  }

  const failureClass =
    failureInfo.tone === 'warning'
      ? 'text-amber-600 dark:text-amber-400 border-amber-500/50'
      : failureInfo.tone === 'destructive'
        ? 'text-destructive border-destructive/50'
        : 'text-muted-foreground/70 border-muted-foreground/50';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {mode === 'compact' ? (
            <div className={cn('flex items-center gap-1 text-[8px]', failureClass, className)}>
              <FailureIcon className="w-2.5 h-2.5" />
              <span>{failureInfo.label}</span>
            </div>
          ) : (
            <div className={className}>
              <Badge variant="outline" className={cn('text-[10px] h-5 px-2 gap-1', failureClass)}>
                <FailureIcon className="w-3 h-3" />
                {failureInfo.label}
              </Badge>
            </div>
          )}
        </TooltipTrigger>
        <TooltipContent side={mode === 'compact' ? 'top' : 'bottom'} className="sm:max-w-sm">
          <QuotaTooltipContent quota={quota} resetTime={resetTime} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
