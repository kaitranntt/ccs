/**
 * Account Card Component for Flow Visualization
 */

import { AccountSurfaceCard } from '@/components/account/shared/account-surface-card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatQuotaPercent, getProviderMinQuota, getQuotaFailureInfo, cn } from '@/lib/utils';
import { GripVertical, Loader2, Pause, Play } from 'lucide-react';
import {
  useAccountQuota,
  useAccountQuotas,
  QUOTA_SUPPORTED_PROVIDERS,
} from '@/hooks/use-cliproxy-stats';
import type { QuotaSupportedProvider } from '@/hooks/use-cliproxy-stats';
import { useTranslation } from 'react-i18next';

import type { AccountData, DragOffset } from './types';
import { AccountCardStats } from './account-card-stats';
import { cleanEmail } from './utils';

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
  onPauseToggle?: (accountIds: string[], paused: boolean) => void;
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

function getCompactQuotaColor(percentage: number) {
  if (percentage > 50) return 'bg-emerald-500';
  if (percentage > 20) return 'bg-amber-500';
  return 'bg-red-500';
}

function getVariantMarkerLabel(audience: string, fallbackLabel?: string | null) {
  if (audience === 'business') return 'Biz';
  if (audience === 'personal') return 'Pers';

  const normalizedFallback = fallbackLabel?.trim();
  return normalizedFallback?.[0]?.toUpperCase() ?? '?';
}

function getGroupedVariantSummaryLabel(
  variants: Array<{ audience: string; audienceLabel?: string | null; detailLabel?: string | null }>
) {
  const audiences = new Set(variants.map((variant) => variant.audience));

  if (audiences.size === 2 && audiences.has('business') && audiences.has('personal')) {
    return 'B|P';
  }

  if (variants.length === 1) {
    const [variant] = variants;
    return getVariantMarkerLabel(
      variant.audience,
      variant.audienceLabel ?? variant.detailLabel ?? null
    );
  }

  return null;
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
  const normalizedProvider = account.provider.toLowerCase();
  const showQuota =
    QUOTA_SUPPORTED_PROVIDERS.includes(normalizedProvider as QuotaSupportedProvider) ||
    QUOTA_PROVIDER_ALIASES.includes(normalizedProvider);
  const hasGroupedVariants = (account.variants?.length ?? 0) > 1;
  const { data: quota, isLoading: quotaLoading } = useAccountQuota(
    normalizedProvider,
    account.id,
    showQuota && !hasGroupedVariants
  );
  const variantQuotaQueries = useAccountQuotas(
    (account.variants ?? []).map((variant) => ({
      provider: account.provider,
      accountId: variant.id,
    })),
    showQuota && hasGroupedVariants
  );
  const groupedHeaderVariants = hasGroupedVariants
    ? Array.from(
        new Map(
          (account.variants ?? [])
            .slice()
            .sort((left, right) => {
              const order = { business: 0, personal: 1, unknown: 2 } as const;
              return order[left.audience] - order[right.audience];
            })
            .map((variant) => [variant.audienceLabel ?? variant.detailLabel ?? variant.id, variant])
        ).values()
      )
    : [];
  const groupedVariantSummaryLabel = getGroupedVariantSummaryLabel(groupedHeaderVariants);

  const compactMetaBadges = hasGroupedVariants ? (
    <>
      <div
        className="inline-flex shrink-0 items-center overflow-hidden rounded-md border border-border/60 bg-muted/60 shadow-sm shadow-black/5 dark:bg-zinc-900/80"
        title={groupedHeaderVariants
          .map((variant) => variant.audienceLabel ?? variant.detailLabel ?? 'Variant')
          .join(' • ')}
      >
        {groupedVariantSummaryLabel ? (
          <span className="inline-flex min-w-[2.2rem] items-center justify-center px-1.5 py-1 text-[9px] font-semibold leading-none text-foreground/80">
            {groupedVariantSummaryLabel}
          </span>
        ) : (
          groupedHeaderVariants.map((variant, index) => (
            <span
              key={variant.id}
              className={cn(
                'inline-flex min-w-[1.9rem] items-center justify-center px-1.5 py-1 text-[9px] font-semibold leading-none',
                index > 0 && 'border-l border-border/50',
                variant.audience === 'business'
                  ? 'bg-sky-500/12 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300'
                  : variant.audience === 'personal'
                    ? 'bg-emerald-500/12 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                    : 'bg-muted text-muted-foreground'
              )}
            >
              {getVariantMarkerLabel(
                variant.audience,
                variant.audienceLabel ?? variant.detailLabel ?? null
              )}
            </span>
          ))
        )}
      </div>
      {account.paused && (
        <span className="text-[7px] font-bold uppercase tracking-wide px-1 py-px rounded shrink-0 bg-amber-500/15 text-amber-700 dark:bg-amber-500/25 dark:text-amber-300">
          Paused
        </span>
      )}
    </>
  ) : undefined;

  const groupedQuotaRows =
    hasGroupedVariants && showQuota
      ? (account.variants ?? []).map((variant, index) => {
          const quotaQuery = variantQuotaQueries[index];
          const minQuota = getProviderMinQuota(account.provider, quotaQuery?.data);
          const quotaLabel = minQuota !== null ? formatQuotaPercent(minQuota) : null;
          const quotaValue = quotaLabel !== null ? Number(quotaLabel) : null;
          const failureInfo = getQuotaFailureInfo(quotaQuery?.data);
          const label = variant.audienceLabel ?? variant.detailLabel ?? cleanEmail(variant.email);

          return (
            <div key={variant.id} className="space-y-0.5">
              <div className="flex items-center justify-between gap-2 text-[8px]">
                <span className="text-muted-foreground/80 truncate">{label}</span>
                <span className="font-mono text-foreground/80 shrink-0">
                  {quotaQuery?.isLoading
                    ? t('accountCard.quotaLoading')
                    : quotaValue !== null
                      ? `${quotaLabel}%`
                      : failureInfo?.label || t('accountCard.quotaUnavailable')}
                </span>
              </div>
              {quotaValue !== null && (
                <div className="w-full bg-muted dark:bg-zinc-800/50 h-1 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      getCompactQuotaColor(quotaValue)
                    )}
                    style={{ width: `${quotaValue}%` }}
                  />
                </div>
              )}
            </div>
          );
        })
      : null;

  const headerEnd = (
    <>
      {onPauseToggle && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-4 w-4 shrink-0 transition-all rounded-full',
                  account.paused ? 'bg-amber-500/20 hover:bg-amber-500/30' : 'hover:bg-muted'
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onPauseToggle(account.memberIds ?? [account.id], !account.paused);
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
      <GripVertical className="w-4 h-4 text-muted-foreground/40 shrink-0" />
    </>
  );

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
      <AccountSurfaceCard
        mode="compact"
        provider={account.provider}
        accountId={account.id}
        email={account.email}
        displayEmail={cleanEmail(account.email)}
        tokenFile={account.tokenFile}
        tier={account.tier}
        isDefault={account.isDefault}
        paused={account.paused}
        privacyMode={privacyMode}
        showQuota={showQuota && !hasGroupedVariants}
        quota={quota}
        quotaLoading={quotaLoading}
        runtimeLastUsed={account.lastUsedAt}
        headerEnd={headerEnd}
        compactMetaBadges={compactMetaBadges}
        footerSlot={
          <>
            <AccountCardStats
              success={account.successCount}
              failure={account.failureCount}
              showDetails={showDetails}
            />
            {groupedQuotaRows && <div className="mt-2 px-0.5 space-y-1">{groupedQuotaRows}</div>}
          </>
        }
      />

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
