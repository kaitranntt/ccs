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
} from 'lucide-react';
import {
  cn,
  sortModelsByPriority,
  formatResetTime,
  getEarliestResetTime,
  getMinClaudeQuota,
} from '@/lib/utils';
import { PRIVACY_BLUR_CLASS } from '@/contexts/privacy-context';
import { useAccountQuota, useCliproxyStats } from '@/hooks/use-cliproxy-stats';
import type { AccountItemProps } from './types';

/**
 * Get color class based on quota percentage
 */
function getQuotaColor(percentage: number): string {
  if (percentage <= 20) return 'bg-destructive';
  if (percentage <= 50) return 'bg-yellow-500';
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
}: AccountItemProps) {
  // Fetch runtime stats to get actual lastUsedAt (more accurate than file state)
  const { data: stats } = useCliproxyStats(showQuota && account.provider === 'agy');

  // Fetch quota for 'agy' provider accounts
  const { data: quota, isLoading: quotaLoading } = useAccountQuota(
    account.provider,
    account.id,
    showQuota && account.provider === 'agy'
  );

  // Get last used time from runtime stats (more accurate than file)
  const runtimeLastUsed = stats?.accountStats?.[account.email || account.id]?.lastUsedAt;
  const wasRecentlyUsed = isRecentlyUsed(runtimeLastUsed);

  // Show minimum quota of Claude models (primary), fallback to min of all models
  const minQuota = quota?.success ? getMinClaudeQuota(quota.models) : null;

  // Get earliest reset time
  const nextReset =
    quota?.success && quota.models.length > 0 ? getEarliestResetTime(quota.models) : null;

  return (
    <div
      className={cn(
        'flex flex-col gap-2 p-3 rounded-lg border transition-colors',
        account.isDefault ? 'border-primary/30 bg-primary/5' : 'border-border hover:bg-muted/30'
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex items-center justify-center w-8 h-8 rounded-full',
              account.isDefault ? 'bg-primary/10' : 'bg-muted'
            )}
          >
            <User className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={cn('font-medium text-sm', privacyMode && PRIVACY_BLUR_CLASS)}>
                {account.email || account.id}
              </span>
              {account.isDefault && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5 gap-0.5">
                  <Star className="w-2.5 h-2.5 fill-current" />
                  Default
                </Badge>
              )}
              {account.tier && account.tier !== 'unknown' && (
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px] h-4 px-1.5 uppercase',
                    account.tier === 'paid' && 'border-blue-500 text-blue-600',
                    account.tier === 'free' && 'border-gray-400 text-gray-500'
                  )}
                >
                  {account.tier}
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
            <Button variant="ghost" size="icon" className="h-7 w-7">
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
            {onPauseToggle && (
              <DropdownMenuItem
                onClick={() => onPauseToggle(!account.paused)}
                disabled={isPausingAccount}
              >
                {account.paused ? (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    {isPausingAccount ? 'Resuming...' : 'Resume account'}
                  </>
                ) : (
                  <>
                    <Pause className="w-4 h-4 mr-2" />
                    {isPausingAccount ? 'Pausing...' : 'Pause account'}
                  </>
                )}
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

      {/* Quota bar - only for 'agy' provider */}
      {showQuota && account.provider === 'agy' && (
        <div className="pl-11">
          {quotaLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Loading quota...</span>
            </div>
          ) : minQuota !== null ? (
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
                    <div className="flex items-center gap-2">
                      <Progress
                        value={minQuota}
                        className="h-2 flex-1"
                        indicatorClassName={getQuotaColor(minQuota)}
                      />
                      <span className="text-xs font-medium w-10 text-right">{minQuota}%</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <div className="text-xs space-y-1">
                      <p className="font-medium">Model Quotas:</p>
                      {sortModelsByPriority(quota?.models || []).map((m) => (
                        <div key={m.name} className="flex justify-between gap-4">
                          <span className="truncate">{m.displayName || m.name}</span>
                          <span className="font-mono">{m.percentage}%</span>
                        </div>
                      ))}
                      {nextReset && (
                        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border/50">
                          <Clock className="w-3 h-3 text-blue-400" />
                          <span className="text-blue-400 font-medium">
                            Resets {formatResetTime(nextReset)}
                          </span>
                        </div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          ) : quota?.error ? (
            <div className="text-xs text-muted-foreground">{quota.error}</div>
          ) : null}
        </div>
      )}
    </div>
  );
}
