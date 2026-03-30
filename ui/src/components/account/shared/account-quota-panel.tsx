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
  const compactQuotaRows = isCodexProvider
    ? [
        { label: '5h', value: codexBreakdown?.fiveHourWindow?.remainingPercent ?? null },
        {
          label: mode === 'compact' ? 'Wk' : 'Weekly',
          value: codexBreakdown?.weeklyWindow?.remainingPercent ?? null,
        },
      ]
    : isClaudeProvider && quota && isClaudeQuotaResult(quota)
      ? [
          {
            label: '5h',
            value:
              quota.coreUsage?.fiveHour?.remainingPercent ??
              quota.windows.find((window) => window.rateLimitType === 'five_hour')
                ?.remainingPercent ??
              null,
          },
          {
            label: mode === 'compact' ? 'Wk' : 'Weekly',
            value:
              quota.coreUsage?.weekly?.remainingPercent ??
              quota.windows.find((window) =>
                [
                  'seven_day',
                  'seven_day_opus',
                  'seven_day_sonnet',
                  'seven_day_oauth_apps',
                  'seven_day_cowork',
                ].includes(window.rateLimitType)
              )?.remainingPercent ??
              null,
          },
        ]
      : [];
  const quotaRows = compactQuotaRows.filter(
    (row): row is { label: string; value: number } => row.value !== null
  );

  if (quotaLoading) {
    return (
      <div className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>{mode === 'compact' ? t('accountCard.quotaLoading') : 'Loading quota...'}</span>
      </div>
    );
  }

  if (minQuotaValue !== null) {
    return (
      <div className={cn(mode === 'compact' ? 'px-0.5' : '', className)}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {mode === 'compact' ? (
                <div className="space-y-0.5 cursor-help">
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] text-muted-foreground/70 uppercase font-bold tracking-tight">
                      {t('accountCard.quota')}
                    </span>
                    <span
                      className={cn(
                        'text-[10px] font-mono font-bold',
                        minQuotaValue > 50
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : minQuotaValue > 20
                            ? 'text-amber-500'
                            : 'text-red-500'
                      )}
                    >
                      {minQuotaLabel}%
                    </span>
                  </div>
                  {quotaRows.length > 0 && (
                    <div className="flex items-center justify-between text-[7px] text-muted-foreground/70">
                      {quotaRows.map((row) => (
                        <span key={row.label}>
                          {row.label} {row.value}%
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="w-full bg-muted dark:bg-zinc-800/50 h-1 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        minQuotaValue > 50
                          ? 'bg-emerald-500'
                          : minQuotaValue > 20
                            ? 'bg-amber-500'
                            : 'bg-red-500'
                      )}
                      style={{ width: `${minQuotaValue}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5 cursor-help">
                  <div className="flex items-center gap-1.5 text-xs">
                    {isRecentlyUsed(runtimeLastUsed) ? (
                      <>
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        <span className="text-emerald-600 dark:text-emerald-400">
                          Active · {formatRelativeTime(runtimeLastUsed)}
                        </span>
                      </>
                    ) : runtimeLastUsed ? (
                      <>
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          Last used {formatRelativeTime(runtimeLastUsed)}
                        </span>
                      </>
                    ) : (
                      <>
                        <HelpCircle className="w-3 h-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Not used yet</span>
                      </>
                    )}
                  </div>
                  {quotaRows.length > 0 ? (
                    <div className="space-y-1.5">
                      {quotaRows.map((row) => (
                        <div key={row.label} className="flex items-center gap-2">
                          <span className="w-10 text-[10px] text-muted-foreground">
                            {row.label}
                          </span>
                          <Progress
                            value={Math.max(0, Math.min(100, row.value))}
                            className="h-2 flex-1"
                            indicatorClassName={getQuotaColor(row.value)}
                          />
                          <span className="text-xs font-medium w-10 text-right">{row.value}%</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Progress
                        value={Math.max(0, Math.min(100, minQuotaValue))}
                        className="h-2 flex-1"
                        indicatorClassName={getQuotaColor(minQuotaValue)}
                      />
                      <span className="text-xs font-medium w-10 text-right">{minQuotaLabel}%</span>
                    </div>
                  )}
                </div>
              )}
            </TooltipTrigger>
            <TooltipContent side={mode === 'compact' ? 'top' : 'bottom'} className="max-w-xs">
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
        <TooltipContent side={mode === 'compact' ? 'top' : 'bottom'} className="max-w-[260px]">
          <div className="space-y-1 text-xs">
            <p>{failureInfo.summary}</p>
            {failureInfo.actionHint && (
              <p className="text-muted-foreground">{failureInfo.actionHint}</p>
            )}
            {failureInfo.technicalDetail && (
              <p className="font-mono text-[11px] text-muted-foreground">
                {failureInfo.technicalDetail}
              </p>
            )}
            {failureInfo.rawDetail && (
              <pre className="whitespace-pre-wrap break-all rounded bg-muted/40 px-2 py-1 font-mono text-[10px] text-muted-foreground">
                {failureInfo.rawDetail}
              </pre>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
