/**
 * Account Item Component
 * Displays a single OAuth account with actions and quota bar
 */

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  User,
  Star,
  MoreHorizontal,
  Clock,
  Trash2,
  Loader2,
  CheckCircle2,
  HelpCircle,
  Pause,
  Play,
  AlertCircle,
  AlertTriangle,
  FolderCode,
  Check,
  KeyRound,
} from 'lucide-react';
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
import { getAccountStats } from '@/lib/cliproxy-account-stats';
import { PRIVACY_BLUR_CLASS } from '@/contexts/privacy-context';
import { useAccountQuota, useCliproxyStats } from '@/hooks/use-cliproxy-stats';
import { QuotaTooltipContent } from '@/components/shared/quota-tooltip-content';
import { useTranslation } from 'react-i18next';
import type { AccountItemProps } from './types';

/**
 * Get color class based on quota percentage
 */
function getQuotaColor(percentage: number): string {
  const clamped = Math.max(0, Math.min(100, percentage));
  if (clamped <= 20) return 'bg-destructive';
  if (clamped <= 50) return 'bg-yellow-500';
  return 'bg-green-500';
}

/**
 * Format relative time (e.g., "5m ago", "2h ago")
 */
function formatRelativeTime(dateStr: string | undefined): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
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

/**
 * Check if account was used recently (within last hour = token likely refreshed)
 */
function isRecentlyUsed(lastUsedAt: string | undefined): boolean {
  if (!lastUsedAt) return false;
  try {
    const lastUsed = new Date(lastUsedAt);
    const now = new Date();
    const diff = now.getTime() - lastUsed.getTime();
    return diff < 60 * 60 * 1000; // Within last hour
  } catch {
    return false;
  }
}

export function AccountItem({
  account,
  onSetDefault,
  onRemove,
  onPauseToggle,
  isRemoving,
  isPausingAccount,
  privacyMode,
  showQuota,
  selectable,
  selected,
  onSelectChange,
}: AccountItemProps) {
  const { t } = useTranslation();
  const normalizedProvider = account.provider.toLowerCase();
  const isCodexProvider = normalizedProvider === 'codex';
  const isClaudeProvider = normalizedProvider === 'claude' || normalizedProvider === 'anthropic';

  // Fetch runtime stats to get actual lastUsedAt (more accurate than file state)
  const { data: stats } = useCliproxyStats(showQuota);

  // Fetch quota for all provider accounts
  const { data: quota, isLoading: quotaLoading } = useAccountQuota(
    normalizedProvider,
    account.id,
    showQuota
  );

  // Get last used time from runtime stats (more accurate than file)
  const runtimeLastUsed = getAccountStats(stats, account)?.lastUsedAt;
  const wasRecentlyUsed = isRecentlyUsed(runtimeLastUsed);

  // Use shared utility functions for provider-specific quota handling
  const minQuota = getProviderMinQuota(account.provider, quota);
  const nextReset = getProviderResetTime(account.provider, quota);
  const codexBreakdown =
    isCodexProvider && quota && isCodexQuotaResult(quota)
      ? getCodexQuotaBreakdown(quota.windows)
      : null;
  const codexQuotaRows = [
    { label: '5h', value: codexBreakdown?.fiveHourWindow?.remainingPercent ?? null },
    { label: 'Weekly', value: codexBreakdown?.weeklyWindow?.remainingPercent ?? null },
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
            label: 'Weekly',
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
  const dualWindowQuotaRows = isCodexProvider
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
  const failureBadgeClass =
    failureInfo?.tone === 'warning'
      ? 'border-amber-500/50 text-amber-600 dark:text-amber-400'
      : failureInfo?.tone === 'destructive'
        ? 'border-destructive/50 text-destructive'
        : 'border-muted-foreground/50 text-muted-foreground';
  const variantLabel = formatAccountVariantLabel(account.id, account.email);

  return (
    <div
      className={cn(
        'flex flex-col gap-2 p-3 rounded-lg border transition-colors overflow-hidden',
        account.isDefault ? 'border-primary/30 bg-primary/5' : 'border-border hover:bg-muted/30',
        account.paused && 'opacity-75',
        selected && 'ring-2 ring-primary/50 bg-primary/5'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Selection checkbox for bulk actions */}
          {selectable && (
            <button
              type="button"
              onClick={() => onSelectChange?.(!selected)}
              className={cn(
                'flex items-center justify-center w-5 h-5 rounded border-2 transition-colors shrink-0',
                selected
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'border-muted-foreground/30 hover:border-primary/50'
              )}
              aria-label={selected ? 'Deselect account' : 'Select account'}
            >
              {selected && <Check className="w-3 h-3" />}
            </button>
          )}
          {/* Pause/Resume toggle button - visible left of avatar */}
          {onPauseToggle && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => onPauseToggle(!account.paused)}
                    disabled={isPausingAccount}
                  >
                    {isPausingAccount ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : account.paused ? (
                      <Play className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Pause className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {account.paused ? 'Resume account' : 'Pause account'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {/* Avatar with tier badge overlay */}
          <div className="relative shrink-0">
            <div
              className={cn(
                'flex items-center justify-center w-8 h-8 rounded-full',
                account.isDefault ? 'bg-primary/10' : 'bg-muted'
              )}
            >
              <User className="w-4 h-4" />
            </div>
            {/* Tier badge - fixed position on avatar */}
            {account.tier && account.tier !== 'unknown' && account.tier !== 'free' && (
              <span
                className={cn(
                  'absolute -bottom-0.5 -right-0.5 text-[7px] font-bold uppercase px-1 py-px rounded',
                  'ring-1 ring-background',
                  account.tier === 'ultra'
                    ? 'bg-violet-500/20 text-violet-600 dark:bg-violet-500/30 dark:text-violet-300'
                    : 'bg-yellow-500/20 text-yellow-700 dark:bg-yellow-500/25 dark:text-yellow-400'
                )}
              >
                {account.tier === 'ultra' ? 'U' : 'P'}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={cn('font-medium text-sm truncate', privacyMode && PRIVACY_BLUR_CLASS)}
              >
                {account.email || account.id}
              </span>
              {variantLabel && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                  {variantLabel}
                </Badge>
              )}
              {account.isDefault && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5 gap-0.5">
                  <Star className="w-2.5 h-2.5 fill-current" />
                  Default
                </Badge>
              )}
              {account.paused && (
                <Badge
                  variant="outline"
                  className="text-[10px] h-4 px-1.5 border-yellow-500 text-yellow-600"
                >
                  <Pause className="w-2 h-2 mr-0.5" />
                  Paused
                </Badge>
              )}
            </div>
            {/* Project ID for Antigravity accounts - read-only */}
            {account.provider === 'agy' && (
              <div className="flex items-center gap-1.5 mt-1">
                {account.projectId ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <FolderCode className="w-3 h-3" aria-hidden="true" />
                          <span
                            className={cn(
                              'font-mono max-w-[180px] truncate',
                              privacyMode && PRIVACY_BLUR_CLASS
                            )}
                            title={account.projectId}
                          >
                            {account.projectId}
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p className="text-xs">GCP Project ID (read-only)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500">
                          <AlertTriangle className="w-3 h-3" aria-label="Warning" />
                          <span>Project ID: N/A</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[250px]">
                        <div className="text-xs space-y-1">
                          <p className="font-medium text-amber-600">Missing Project ID</p>
                          <p>
                            This may cause errors. Remove the account and re-add it to fetch the
                            project ID.
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            )}
            {account.lastUsedAt && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                <Clock className="w-3 h-3" />
                Last used: {new Date(account.lastUsedAt).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!account.isDefault && (
              <DropdownMenuItem onClick={onSetDefault}>
                <Star className="w-4 h-4 mr-2" />
                Set as default
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={onRemove}
              disabled={isRemoving}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {isRemoving ? 'Removing...' : 'Remove account'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Quota bar - supports all providers with quota API */}
      {showQuota && (
        <div className="pl-11">
          {quotaLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Loading quota...</span>
            </div>
          ) : minQuotaValue !== null ? (
            <div className="space-y-1.5">
              {/* Status indicator based on runtime usage, not file state */}
              <div className="flex items-center gap-1.5 text-xs">
                {wasRecentlyUsed ? (
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
              {/* Quota bar */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    {dualWindowQuotaRows.length > 0 ? (
                      <div className="space-y-1.5">
                        {dualWindowQuotaRows.map((row) => (
                          <div key={row.label} className="flex items-center gap-2">
                            <span className="w-10 text-[10px] text-muted-foreground">
                              {row.label}
                            </span>
                            <Progress
                              value={Math.max(0, Math.min(100, row.value))}
                              className="h-2 flex-1"
                              indicatorClassName={getQuotaColor(row.value)}
                            />
                            <span className="text-xs font-medium w-10 text-right">
                              {row.value}%
                            </span>
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
                        <span className="text-xs font-medium w-10 text-right">
                          {minQuotaLabel}%
                        </span>
                      </div>
                    )}
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <QuotaTooltipContent quota={quota} resetTime={nextReset} />
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          ) : quota?.success ? (
            <div className="flex items-center gap-1.5">
              <Badge
                variant="outline"
                className="text-[10px] h-5 px-2 gap-1 border-muted-foreground/50 text-muted-foreground"
              >
                <HelpCircle className="w-3 h-3" />
                {t('accountCard.quotaUnavailable')}
              </Badge>
            </div>
          ) : failureInfo ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={cn('text-[10px] h-5 px-2 gap-1', failureBadgeClass)}
                    >
                      <FailureIcon className="w-3 h-3" />
                      {failureInfo.label}
                    </Badge>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[260px]">
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
    </div>
  );
}
