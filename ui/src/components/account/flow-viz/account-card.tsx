/**
 * Account Card Component for Flow Visualization
 */

import {
  cn,
  formatQuotaPercent,
  getCodexQuotaBreakdown,
  getQuotaFailureInfo,
  getProviderMinQuota,
  getProviderResetTime,
  isClaudeQuotaResult,
  isCodexQuotaResult,
} from '@/lib/utils';
import { formatAccountVariantLabel } from '@/lib/account-identity';
import { PRIVACY_BLUR_CLASS } from '@/contexts/privacy-context';
import {
  GripVertical,
  Loader2,
  Pause,
  Play,
  KeyRound,
  AlertTriangle,
  AlertCircle,
} from 'lucide-react';
import { useAccountQuota, QUOTA_SUPPORTED_PROVIDERS } from '@/hooks/use-cliproxy-stats';
import type { QuotaSupportedProvider } from '@/hooks/use-cliproxy-stats';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { QuotaTooltipContent } from '@/components/shared/quota-tooltip-content';

import type { AccountData, DragOffset } from './types';
import { cleanEmail } from './utils';
import { AccountCardStats } from './account-card-stats';

type Zone = 'left' | 'right' | 'top' | 'bottom';
const QUOTA_PROVIDER_ALIASES = [
  'antigravity',
  'anthropic',
  'gemini-cli',
  'copilot',
  'github-copilot',
];

interface AccountCardProps {
  account: AccountData;
  zone: Zone;
  originalIndex: number;
  isHovered: boolean;
  isDragging: boolean;
  offset: DragOffset;
  showDetails: boolean;
  privacyMode: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPauseToggle?: (accountId: string, paused: boolean) => void;
  isPausingAccount?: boolean;
}

const BORDER_SIDE_MAP: Record<Zone, string> = {
  left: 'border-l-2',
  right: 'border-r-2',
  top: 'border-t-2',
  bottom: 'border-b-2',
};

const CONNECTOR_POSITION_MAP: Record<Zone, string> = {
  left: 'top-1/2 -right-1.5 -translate-y-1/2',
  right: 'top-1/2 -left-1.5 -translate-y-1/2',
  top: 'left-1/2 -bottom-1.5 -translate-x-1/2',
  bottom: 'left-1/2 -top-1.5 -translate-x-1/2',
};

function getBorderColorStyle(zone: Zone, color: string): React.CSSProperties {
  switch (zone) {
    case 'left':
      return { borderLeftColor: color };
    case 'right':
      return { borderRightColor: color };
    case 'top':
      return { borderTopColor: color };
    case 'bottom':
      return { borderBottomColor: color };
  }
}

export function AccountCard({
  account,
  zone,
  originalIndex,
  isHovered,
  isDragging,
  offset,
  showDetails,
  privacyMode,
  onMouseEnter,
  onMouseLeave,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPauseToggle,
  isPausingAccount,
}: AccountCardProps) {
  const { t } = useTranslation();
  const borderSide = BORDER_SIDE_MAP[zone];
  const borderColor = getBorderColorStyle(zone, account.color);
  const connectorPosition = CONNECTOR_POSITION_MAP[zone];

  // Quota for CLIProxy accounts (agy, codex, claude, gemini, ghcp)
  const normalizedProvider = account.provider.toLowerCase();
  const isCliproxyProvider =
    QUOTA_SUPPORTED_PROVIDERS.includes(normalizedProvider as QuotaSupportedProvider) ||
    QUOTA_PROVIDER_ALIASES.includes(normalizedProvider);
  const isCodexProvider = normalizedProvider === 'codex';
  const isClaudeProvider = normalizedProvider === 'claude' || normalizedProvider === 'anthropic';
  const { data: quota, isLoading: quotaLoading } = useAccountQuota(
    normalizedProvider,
    account.id,
    isCliproxyProvider
  );

  // Use shared helper for provider-specific minimum quota
  const minQuota = getProviderMinQuota(account.provider, quota);
  const resetTime = getProviderResetTime(account.provider, quota);
  const codexBreakdown =
    isCodexProvider && quota && isCodexQuotaResult(quota)
      ? getCodexQuotaBreakdown(quota.windows)
      : null;
  const codexQuotaRows = [
    { label: '5h', value: codexBreakdown?.fiveHourWindow?.remainingPercent ?? null },
    { label: 'Wk', value: codexBreakdown?.weeklyWindow?.remainingPercent ?? null },
  ].filter((row): row is { label: string; value: number } => row.value !== null);
  const claudeQuotaRows =
    isClaudeProvider && quota && isClaudeQuotaResult(quota)
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
            label: 'Wk',
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
        ].filter((row): row is { label: string; value: number } => row.value !== null)
      : [];
  const compactQuotaRows = isCodexProvider
    ? codexQuotaRows
    : isClaudeProvider
      ? claudeQuotaRows
      : [];
  const minQuotaLabel = minQuota !== null ? formatQuotaPercent(minQuota) : null;
  const minQuotaValue = minQuotaLabel !== null ? Number(minQuotaLabel) : null;
  const failureInfo = getQuotaFailureInfo(quota);
  const FailureIcon =
    failureInfo?.label === 'Reauth'
      ? KeyRound
      : failureInfo?.tone === 'warning'
        ? AlertTriangle
        : AlertCircle;
  const failureTextClass =
    failureInfo?.tone === 'warning'
      ? 'text-amber-600 dark:text-amber-400'
      : failureInfo?.tone === 'destructive'
        ? 'text-destructive'
        : 'text-muted-foreground/70';

  // Tier badge (AGY only) - show P for Pro, U for Ultra
  const showTierBadge =
    account.provider === 'agy' &&
    account.tier &&
    account.tier !== 'unknown' &&
    account.tier !== 'free';
  const variantLabel = formatAccountVariantLabel(account.id, account.email);

  return (
    <div
      data-account-index={originalIndex}
      data-zone={zone}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={cn(
        'group/card relative rounded-lg p-3 w-44 cursor-grab transition-shadow duration-200',
        'bg-muted/30 dark:bg-zinc-900/60 backdrop-blur-sm',
        'border border-border/50 dark:border-white/[0.08]',
        borderSide,
        'select-none touch-none',
        isHovered && 'bg-muted/50 dark:bg-zinc-800/60',
        isDragging && 'cursor-grabbing shadow-xl scale-105 z-50',
        account.paused && 'opacity-60'
      )}
      style={{
        ...borderColor,
        transform: `translate(${offset.x}px, ${offset.y}px)${isDragging ? ' scale(1.05)' : ''}`,
      }}
    >
      {/* Header row: Email + Tier | Pause button | Drag handle */}
      <div className="flex items-center gap-1.5 mb-1">
        {/* Email with tier badge inline */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span
            className={cn(
              'text-xs font-semibold text-foreground tracking-tight truncate',
              privacyMode && PRIVACY_BLUR_CLASS
            )}
          >
            {cleanEmail(account.email)}
          </span>
          {variantLabel && (
            <span className="text-[7px] font-bold uppercase tracking-wide px-1 py-px rounded shrink-0 bg-muted text-muted-foreground">
              {variantLabel}
            </span>
          )}
          {showTierBadge && (
            <span
              className={cn(
                'text-[7px] font-bold uppercase tracking-wide px-1 py-px rounded shrink-0',
                account.tier === 'ultra'
                  ? 'bg-violet-500/15 text-violet-600 dark:bg-violet-500/25 dark:text-violet-300'
                  : 'bg-yellow-500/15 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400'
              )}
            >
              {account.tier}
            </span>
          )}
        </div>

        {/* Pause/Resume button */}
        {onPauseToggle && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'h-4 w-4 shrink-0',
                    'transition-all rounded-full',
                    account.paused ? 'bg-amber-500/20 hover:bg-amber-500/30' : 'hover:bg-muted'
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPauseToggle(account.id, !account.paused);
                  }}
                  disabled={isPausingAccount}
                >
                  {isPausingAccount ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  ) : account.paused ? (
                    <Play className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                  ) : (
                    <Pause className="w-2.5 h-2.5 text-muted-foreground/50 hover:text-foreground" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {account.paused ? t('accountCard.resumeAccount') : t('accountCard.pauseAccount')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Drag handle */}
        <GripVertical className="w-4 h-4 text-muted-foreground/40 shrink-0" />
      </div>

      <AccountCardStats
        success={account.successCount}
        failure={account.failureCount}
        showDetails={showDetails}
      />
      {/* Quota bar for CLIProxy accounts */}
      {isCliproxyProvider && (
        <div className="mt-2 px-0.5">
          {quotaLoading ? (
            <div className="flex items-center gap-1 text-[8px] text-muted-foreground">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              <span>{t('accountCard.quotaLoading')}</span>
            </div>
          ) : minQuotaValue !== null ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
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
                    {compactQuotaRows.length > 0 && (
                      <div className="flex items-center justify-between text-[7px] text-muted-foreground/70">
                        {compactQuotaRows.map((row) => (
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
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <QuotaTooltipContent quota={quota} resetTime={resetTime} />
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : quota?.success ? (
            <div className="text-[8px] text-muted-foreground/60">
              {t('accountCard.quotaUnavailable')}
            </div>
          ) : failureInfo ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={cn('flex items-center gap-1 text-[8px]', failureTextClass)}>
                    <FailureIcon className="w-2.5 h-2.5" />
                    <span>{failureInfo.label}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px]">
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
          ) : null}
        </div>
      )}
      <div
        className={cn(
          'absolute w-3 h-3 rounded-full transform z-20 transition-colors border',
          'bg-muted dark:bg-zinc-800 border-border dark:border-zinc-600',
          connectorPosition,
          isHovered && 'bg-foreground dark:bg-white border-transparent'
        )}
      />
    </div>
  );
}
