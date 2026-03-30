/**
 * Account Card Component for Flow Visualization
 */

import { AccountSurfaceCard } from '@/components/account/shared/account-surface-card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { GripVertical, Loader2, Pause, Play } from 'lucide-react';
import { useAccountQuota, QUOTA_SUPPORTED_PROVIDERS } from '@/hooks/use-cliproxy-stats';
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
  const normalizedProvider = account.provider.toLowerCase();
  const showQuota =
    QUOTA_SUPPORTED_PROVIDERS.includes(normalizedProvider as QuotaSupportedProvider) ||
    QUOTA_PROVIDER_ALIASES.includes(normalizedProvider);
  const { data: quota, isLoading: quotaLoading } = useAccountQuota(
    normalizedProvider,
    account.id,
    showQuota
  );

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
        paused={account.paused}
        privacyMode={privacyMode}
        showQuota={showQuota}
        quota={quota}
        quotaLoading={quotaLoading}
        runtimeLastUsed={account.lastUsedAt}
        headerEnd={headerEnd}
        footerSlot={
          <AccountCardStats
            success={account.successCount}
            failure={account.failureCount}
            showDetails={showDetails}
          />
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
