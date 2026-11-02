import { Children, cloneElement, isValidElement, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { PRIVACY_BLUR_CLASS } from '@/contexts/privacy-context';
import type { UnifiedQuotaResult } from '@/hooks/use-cliproxy-stats';
import {
  getAccountIdentityPresentation,
  getAccountDisplayLabels,
  getCodexIdentityBadge,
  type CodexIdentityBadge,
} from '@/lib/account-identity';
import { cn } from '@/lib/utils';
import { Pause, Star, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AccountQuotaPanel } from './account-quota-panel';

type AccountSurfaceMode = 'compact' | 'detailed';
type AccountAudience = 'business' | 'free' | 'personal' | 'unknown';
type AccountTier = 'free' | 'pro' | 'ultra' | 'unknown';

interface AccountSurfaceCardProps {
  mode: AccountSurfaceMode;
  provider: string;
  accountId: string;
  email?: string;
  nickname?: string;
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

// Grouped identity badges arrive through a slot; hide their hover titles as well as their labels.
function maskCompactIdentityMetadata(content: ReactNode): ReactNode {
  return Children.map(content, (child) => {
    if (!isValidElement<{ title?: string; className?: string; children?: ReactNode }>(child)) {
      return child;
    }
    return cloneElement(child, {
      ...(child.props.title !== undefined && {
        title: undefined,
        className: cn(child.props.className, PRIVACY_BLUR_CLASS),
      }),
      ...(child.props.children !== undefined && {
        children: maskCompactIdentityMetadata(child.props.children),
      }),
    });
  });
}

function getAudienceBadgeClass(audience: AccountAudience) {
  if (audience === 'business') {
    return 'bg-sky-500/12 text-sky-700 dark:text-sky-300';
  }

  if (audience === 'free') {
    return 'bg-slate-200/70 text-slate-700 dark:bg-slate-700/40 dark:text-slate-200';
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

function getCompactAudienceBadgeLabel(audience: AccountAudience, t: (key: string) => string) {
  if (audience === 'business') return t('accountSurfaceCard.business');
  if (audience === 'free') return t('accountSurfaceCard.free');
  if (audience === 'personal') return t('accountSurfaceCard.personal');
  return '?';
}

function getCompactDetailBadgeClass(audience: AccountAudience) {
  if (audience === 'business') {
    return 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:border-sky-400/30 dark:bg-sky-500/15 dark:text-sky-200';
  }

  if (audience === 'free') {
    return 'border-slate-300/70 bg-slate-100/80 text-slate-700 dark:border-slate-500/40 dark:bg-slate-700/30 dark:text-slate-200';
  }

  if (audience === 'personal') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-200';
  }

  return 'border-border/60 bg-muted/60 text-muted-foreground';
}

function resolveEffectiveTier(
  tier: AccountTier | undefined,
  quota: UnifiedQuotaResult | undefined
): AccountTier | undefined {
  if (quota && 'entitlement' in quota) {
    const entitlementTier = quota.entitlement?.normalizedTier;
    if (entitlementTier && entitlementTier !== 'unknown') {
      return entitlementTier;
    }
  }
  return tier;
}

function getCodexQuotaBadge(quota: UnifiedQuotaResult | undefined): CodexIdentityBadge {
  if (!quota || !('planType' in quota) || !quota.planType) {
    return { audience: 'unknown', label: null };
  }

  if (quota.planType === 'team') {
    return { audience: 'business', label: 'Business' };
  }

  if (quota.planType === 'free') {
    return { audience: 'free', label: 'Free' };
  }

  if (quota.planType === 'plus') {
    return { audience: 'personal', label: 'Plus' };
  }

  if (quota.planType === 'pro') {
    return { audience: 'personal', label: 'Pro' };
  }

  return { audience: 'unknown', label: null };
}

function resolveCodexBadge(
  identityBadge: CodexIdentityBadge,
  quotaBadge: CodexIdentityBadge
): CodexIdentityBadge {
  if (!quotaBadge.label) {
    return identityBadge;
  }

  if (
    quotaBadge.label === 'Business' ||
    quotaBadge.label === 'Plus' ||
    quotaBadge.label === 'Pro'
  ) {
    return quotaBadge;
  }

  if (quotaBadge.label === 'Free' && identityBadge.label && identityBadge.label !== 'Free') {
    return identityBadge;
  }

  return quotaBadge;
}

export function AccountSurfaceCard({
  mode,
  provider,
  accountId,
  email,
  nickname,
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
  const { t } = useTranslation();
  const identity = getAccountIdentityPresentation(accountId, email, tokenFile);
  const { primary: title, secondary } = getAccountDisplayLabels(
    accountId,
    email,
    tokenFile,
    nickname,
    displayEmail
  );
  const sensitiveTitle = (value: string | null | undefined) =>
    privacyMode ? undefined : (value ?? undefined);
  const normalizedProvider = provider.toLowerCase();
  const effectiveTier = resolveEffectiveTier(tier, quota);
  const effectiveCodexBadge =
    normalizedProvider === 'codex'
      ? resolveCodexBadge(getCodexIdentityBadge(identity), getCodexQuotaBadge(quota))
      : null;
  const showTierBadge =
    (normalizedProvider === 'agy' ||
      normalizedProvider === 'antigravity' ||
      normalizedProvider === 'gemini') &&
    effectiveTier &&
    effectiveTier !== 'unknown' &&
    effectiveTier !== 'free';
  const isCompact = mode === 'compact';
  const defaultCompactMetaBadges = (
    <>
      {showTierBadge && (
        <span
          className={cn(
            'text-[8px] font-semibold px-1.5 py-0.5 rounded-md shrink-0',
            privacyMode && PRIVACY_BLUR_CLASS,
            getTierBadgeClass(effectiveTier)
          )}
        >
          {effectiveTier}
        </span>
      )}
      {normalizedProvider === 'codex'
        ? effectiveCodexBadge?.label && (
            <span
              title={sensitiveTitle(effectiveCodexBadge.label)}
              className={cn(
                'text-[8px] font-semibold px-1.5 py-0.5 rounded-md border shrink-0',
                privacyMode && PRIVACY_BLUR_CLASS,
                getCompactDetailBadgeClass(effectiveCodexBadge.audience)
              )}
            >
              {effectiveCodexBadge.label}
            </span>
          )
        : identity.audienceLabel && (
            <span
              title={sensitiveTitle(identity.audienceLabel)}
              className={cn(
                'text-[8px] font-semibold px-1.5 py-0.5 rounded-md shrink-0',
                privacyMode && PRIVACY_BLUR_CLASS,
                getAudienceBadgeClass(identity.audience)
              )}
            >
              {getCompactAudienceBadgeLabel(identity.audience, t)}
            </span>
          )}
      {paused && (
        <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 bg-amber-500/15 text-amber-700 dark:bg-amber-500/25 dark:text-amber-300">
          {/* TODO i18n: missing key for compact "Paused" badge */}
          Paused
        </span>
      )}
    </>
  );
  const compactBadges = compactMetaBadges ?? defaultCompactMetaBadges;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className={cn('flex gap-2', isCompact ? 'flex-col' : 'items-start justify-between')}>
        <div className={cn('flex min-w-0 flex-1', isCompact ? 'w-full gap-2' : 'gap-3')}>
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
                    privacyMode && PRIVACY_BLUR_CLASS,
                    effectiveTier === 'ultra'
                      ? 'bg-violet-500/20 text-violet-600 dark:bg-violet-500/30 dark:text-violet-300'
                      : 'bg-yellow-500/20 text-yellow-700 dark:bg-yellow-500/25 dark:text-yellow-400'
                  )}
                >
                  {effectiveTier === 'ultra' ? 'U' : 'P'}
                </span>
              )}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className={cn('min-w-0', !isCompact && 'flex items-center gap-2 flex-wrap')}>
              <span
                title={sensitiveTitle(title)}
                className={cn(
                  isCompact
                    ? 'block w-full min-w-0 text-xs font-semibold tracking-tight whitespace-normal wrap-anywhere leading-snug'
                    : 'font-medium text-sm truncate',
                  privacyMode && PRIVACY_BLUR_CLASS
                )}
              >
                {title}
              </span>
              {!isCompact && normalizedProvider === 'codex' && effectiveCodexBadge?.label && (
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px] h-4 px-1.5 border-transparent',
                    privacyMode && PRIVACY_BLUR_CLASS,
                    getAudienceBadgeClass(effectiveCodexBadge.audience)
                  )}
                >
                  {effectiveCodexBadge.label}
                </Badge>
              )}
              {!isCompact && normalizedProvider !== 'codex' && identity.audienceLabel && (
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px] h-4 px-1.5 border-transparent',
                    privacyMode && PRIVACY_BLUR_CLASS,
                    getAudienceBadgeClass(identity.audience)
                  )}
                >
                  {identity.audienceLabel}
                </Badge>
              )}
              {!isCompact && normalizedProvider !== 'codex' && identity.detailLabel && (
                <Badge
                  variant="outline"
                  className={cn('text-[10px] h-4 px-1.5', privacyMode && PRIVACY_BLUR_CLASS)}
                >
                  {identity.detailLabel}
                </Badge>
              )}
              {!isCompact && isDefault && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5 gap-0.5">
                  <Star className="w-2.5 h-2.5 fill-current" />
                  {/* TODO i18n: missing key for "Default" badge */}
                  Default
                </Badge>
              )}
              {!isCompact && paused && (
                <Badge
                  variant="outline"
                  className="text-[10px] h-4 px-1.5 border-yellow-500 text-yellow-600"
                >
                  <Pause className="w-2 h-2 mr-0.5" />
                  {/* TODO i18n: missing key for "Paused" badge */}
                  Paused
                </Badge>
              )}
            </div>

            {secondary && (
              <div
                title={sensitiveTitle(secondary)}
                className={cn(
                  'mt-1 text-muted-foreground',
                  isCompact ? 'text-[9px] whitespace-normal wrap-anywhere' : 'text-xs truncate',
                  privacyMode && PRIVACY_BLUR_CLASS
                )}
              >
                {secondary}
              </div>
            )}
            {isCompact &&
              !secondary &&
              normalizedProvider !== 'codex' &&
              identity.compactDetailLabel && (
                <div
                  title={sensitiveTitle(identity.detailLabel ?? identity.compactDetailLabel)}
                  className={cn(
                    'mt-1 text-[9px] text-muted-foreground whitespace-normal wrap-anywhere',
                    privacyMode && PRIVACY_BLUR_CLASS
                  )}
                >
                  {identity.compactDetailLabel}
                </div>
              )}
            {bodySlot && <div className="mt-1">{bodySlot}</div>}
          </div>
        </div>

        {isCompact ? (
          <div className="flex min-w-0 w-full items-start justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {privacyMode ? maskCompactIdentityMetadata(compactBadges) : compactBadges}
            </div>
            {headerEnd && <div className="flex shrink-0 items-center gap-0.5">{headerEnd}</div>}
          </div>
        ) : (
          headerEnd && <div className="flex items-center shrink-0 gap-1">{headerEnd}</div>
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
