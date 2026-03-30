import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { PRIVACY_BLUR_CLASS } from '@/contexts/privacy-context';
import type { UnifiedQuotaResult } from '@/hooks/use-cliproxy-stats';
import { getAccountIdentityPresentation } from '@/lib/account-identity';
import { cn } from '@/lib/utils';
import { Pause, Star, User } from 'lucide-react';

import { AccountQuotaPanel } from './account-quota-panel';

type AccountSurfaceMode = 'compact' | 'detailed';
type AccountTier = 'free' | 'pro' | 'ultra' | 'unknown';

interface AccountSurfaceCardProps {
  mode: AccountSurfaceMode;
  provider: string;
  accountId: string;
  email?: string;
  displayEmail?: string;
  tokenFile?: string;
  tier?: AccountTier;
  isDefault?: boolean;
  paused?: boolean;
  privacyMode?: boolean;
  showQuota?: boolean;
  quota?: UnifiedQuotaResult;
  quotaLoading?: boolean;
  runtimeLastUsed?: string;
  beforeIdentity?: ReactNode;
  headerEnd?: ReactNode;
  compactMetaBadges?: ReactNode;
  bodySlot?: ReactNode;
  footerSlot?: ReactNode;
  quotaInsetClassName?: string;
  className?: string;
}

function getAudienceBadgeClass(audience: 'business' | 'personal' | 'unknown') {
  if (audience === 'business') {
    return 'bg-sky-500/12 text-sky-700 dark:text-sky-300';
  }

  if (audience === 'personal') {
    return 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300';
  }

  return 'bg-muted text-muted-foreground';
}

function getTierBadgeClass(tier: AccountTier | undefined) {
  return tier === 'ultra'
    ? 'bg-violet-500/15 text-violet-600 dark:bg-violet-500/25 dark:text-violet-300'
    : 'bg-yellow-500/15 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400';
}

function getCompactAudienceBadgeLabel(audience: 'business' | 'personal' | 'unknown') {
  if (audience === 'business') return 'Biz';
  if (audience === 'personal') return 'Pers';
  return '?';
}

export function AccountSurfaceCard({
  mode,
  provider,
  accountId,
  email,
  displayEmail,
  tokenFile,
  tier,
  isDefault,
  paused,
  privacyMode,
  showQuota,
  quota,
  quotaLoading,
  runtimeLastUsed,
  beforeIdentity,
  headerEnd,
  compactMetaBadges,
  bodySlot,
  footerSlot,
  quotaInsetClassName,
  className,
}: AccountSurfaceCardProps) {
  const identity = getAccountIdentityPresentation(accountId, email, tokenFile);
  const title = displayEmail || identity.email || accountId;
  const normalizedProvider = provider.toLowerCase();
  const showTierBadge =
    (normalizedProvider === 'agy' || normalizedProvider === 'antigravity') &&
    tier &&
    tier !== 'unknown' &&
    tier !== 'free';
  const isCompact = mode === 'compact';
  const defaultCompactMetaBadges = (
    <>
      {showTierBadge && (
        <span
          className={cn(
            'text-[8px] font-semibold px-1.5 py-0.5 rounded-md shrink-0',
            getTierBadgeClass(tier)
          )}
        >
          {tier}
        </span>
      )}
      {identity.audienceLabel && (
        <span
          title={identity.audienceLabel}
          className={cn(
            'text-[8px] font-semibold px-1.5 py-0.5 rounded-md shrink-0',
            identity.audience === 'business'
              ? 'bg-sky-500/15 text-sky-700 dark:bg-sky-500/25 dark:text-sky-300'
              : 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-300'
          )}
        >
          {getCompactAudienceBadgeLabel(identity.audience)}
        </span>
      )}
      {paused && (
        <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 bg-amber-500/15 text-amber-700 dark:bg-amber-500/25 dark:text-amber-300">
          Paused
        </span>
      )}
    </>
  );

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className={cn('flex min-w-0 flex-1', isCompact ? 'gap-2' : 'gap-3')}>
          {beforeIdentity}
          {!isCompact && (
            <div className="relative shrink-0">
              <div
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-full',
                  isDefault ? 'bg-primary/10' : 'bg-muted'
                )}
              >
                <User className="w-4 h-4" />
              </div>
              {showTierBadge && (
                <span
                  className={cn(
                    'absolute -bottom-0.5 -right-0.5 text-[7px] font-bold uppercase px-1 py-px rounded ring-1 ring-background',
                    tier === 'ultra'
                      ? 'bg-violet-500/20 text-violet-600 dark:bg-violet-500/30 dark:text-violet-300'
                      : 'bg-yellow-500/20 text-yellow-700 dark:bg-yellow-500/25 dark:text-yellow-400'
                  )}
                >
                  {tier === 'ultra' ? 'U' : 'P'}
                </span>
              )}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div
              className={cn('flex items-center min-w-0', isCompact ? 'gap-1.5' : 'gap-2 flex-wrap')}
            >
              <span
                title={title}
                className={cn(
                  isCompact
                    ? 'flex-1 min-w-0 text-xs font-semibold tracking-tight truncate leading-none'
                    : 'font-medium text-sm truncate',
                  privacyMode && PRIVACY_BLUR_CLASS
                )}
              >
                {title}
              </span>
              {isCompact && (compactMetaBadges ?? defaultCompactMetaBadges)}
              {!isCompact && identity.audienceLabel && (
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px] h-4 px-1.5 border-transparent',
                    getAudienceBadgeClass(identity.audience)
                  )}
                >
                  {identity.audienceLabel}
                </Badge>
              )}
              {!isCompact && identity.detailLabel && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                  {identity.detailLabel}
                </Badge>
              )}
              {!isCompact && isDefault && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5 gap-0.5">
                  <Star className="w-2.5 h-2.5 fill-current" />
                  Default
                </Badge>
              )}
              {!isCompact && paused && (
                <Badge
                  variant="outline"
                  className="text-[10px] h-4 px-1.5 border-yellow-500 text-yellow-600"
                >
                  <Pause className="w-2 h-2 mr-0.5" />
                  Paused
                </Badge>
              )}
            </div>

            {bodySlot && <div className="mt-1">{bodySlot}</div>}
          </div>
        </div>

        {headerEnd && (
          <div className={cn('flex items-center shrink-0', isCompact ? 'gap-0.5' : 'gap-1')}>
            {headerEnd}
          </div>
        )}
      </div>

      {footerSlot}

      {showQuota && (
        <AccountQuotaPanel
          provider={provider}
          quota={quota}
          quotaLoading={quotaLoading}
          runtimeLastUsed={runtimeLastUsed}
          mode={mode}
          className={quotaInsetClassName}
        />
      )}
    </div>
  );
}
