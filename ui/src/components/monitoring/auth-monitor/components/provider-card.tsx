/**
 * ProviderCard - Provider status card with account color dots and stats
 */

import type React from 'react';
import { ChevronRight, AlertTriangle } from 'lucide-react';
import { formatAccountDisplayName } from '@/lib/account-identity';
import { cn, STATUS_COLORS } from '@/lib/utils';
import { PROVIDER_COLORS } from '@/lib/provider-config';
import { ProviderIcon } from '@/components/shared/provider-icon';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ProviderStats } from '../types';
import { getSuccessRate } from '../utils';
import { InlineStatsBadge } from './inline-stats-badge';

interface ProviderCardProps {
  stats: ProviderStats;
  isHovered: boolean;
  privacyMode: boolean;
  onSelect: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function ProviderCard({
  stats,
  isHovered,
  privacyMode,
  onSelect,
  onMouseEnter,
  onMouseLeave,
}: ProviderCardProps) {
  const successRate = getSuccessRate(stats.successCount, stats.failureCount);
  const providerColor = PROVIDER_COLORS[stats.provider.toLowerCase()] || '#6b7280';

  return (
    <button
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        'group relative rounded-xl p-4 text-left transition-all duration-300',
        'bg-muted/30 dark:bg-zinc-900/60 backdrop-blur-sm',
        'border border-border/50 dark:border-white/[0.08]',
        'hover:border-opacity-50 hover:scale-[1.02] hover:shadow-lg',
        isHovered && 'ring-1'
      )}
      style={
        {
          borderColor: isHovered ? providerColor : undefined,
          '--ring-color': providerColor,
        } as React.CSSProperties
      }
    >
      <div className="flex items-center gap-3 mb-3">
        <ProviderIcon provider={stats.provider} size={36} withBackground />
        <div>
          <h3 className="text-sm font-semibold text-foreground tracking-tight">
            {stats.displayName}
          </h3>
          <p className="text-[10px] text-muted-foreground">
            {stats.accountCount} account{stats.accountCount !== 1 ? 's' : ''}
          </p>
        </div>
        <ChevronRight
          className={cn(
            'w-4 h-4 ml-auto text-muted-foreground transition-all',
            isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'
          )}
        />
      </div>

      <div className="space-y-2">
        {/* Inline success/failure stats - immediately visible */}
        <div className="flex justify-between items-center text-xs">
          <span className="text-muted-foreground">Stats</span>
          <InlineStatsBadge success={stats.successCount} failure={stats.failureCount} />
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Success Rate</span>
          <span
            className="font-mono font-semibold"
            style={{
              color:
                successRate === 100
                  ? STATUS_COLORS.success
                  : successRate >= 95
                    ? STATUS_COLORS.degraded
                    : STATUS_COLORS.failed,
            }}
          >
            {successRate}%
          </span>
        </div>
        {/* Progress bar */}
        <div className="w-full bg-muted dark:bg-zinc-800/50 h-1 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${successRate}%`,
              backgroundColor: providerColor,
            }}
          />
        </div>
      </div>

      {/* Account color dots with warning for agy accounts missing projectId */}
      <div className="flex gap-1 mt-3 items-center">
        {stats.accounts.slice(0, 5).map((acc) => {
          const isMissingProjectId = stats.provider === 'agy' && !acc.projectId;
          return (
            <div key={acc.id} className="relative">
              <div
                className={cn('w-2 h-2 rounded-full', acc.paused && 'opacity-50')}
                style={{ backgroundColor: acc.color }}
                title={
                  privacyMode
                    ? '••••••'
                    : formatAccountDisplayName(acc.id, acc.email, acc.tokenFile)
                }
              />
              {isMissingProjectId && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertTriangle
                        className="absolute -top-1 -right-1 w-2.5 h-2.5 text-amber-500"
                        aria-label="Missing Project ID"
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      Missing Project ID - re-add account to fix
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          );
        })}
        {stats.accounts.length > 5 && (
          <span className="text-[10px] text-muted-foreground ml-1">
            +{stats.accounts.length - 5}
          </span>
        )}
      </div>
    </button>
  );
}
