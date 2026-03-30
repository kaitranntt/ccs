/**
 * Account Item Component
 * Displays a single OAuth account with actions and quota bar
 */

import { AccountSurfaceCard } from '@/components/account/shared/account-surface-card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PRIVACY_BLUR_CLASS } from '@/contexts/privacy-context';
import { getAccountStats } from '@/lib/cliproxy-account-stats';
import { cn } from '@/lib/utils';
import { useAccountQuota, useCliproxyStats } from '@/hooks/use-cliproxy-stats';
import {
  AlertTriangle,
  Check,
  FolderCode,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  Star,
  Trash2,
} from 'lucide-react';

import type { AccountItemProps } from './types';

function renderProjectId(projectId: string | undefined, privacyMode: boolean | undefined) {
  if (projectId) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <FolderCode className="w-3 h-3" aria-hidden="true" />
              <span
                className={cn(
                  'font-mono max-w-[180px] truncate',
                  privacyMode && PRIVACY_BLUR_CLASS
                )}
                title={projectId}
              >
                {projectId}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">GCP Project ID (read-only)</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
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
            <p>This may cause errors. Remove the account and re-add it to fetch the project ID.</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
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
  const normalizedProvider = account.provider.toLowerCase();
  const { data: stats } = useCliproxyStats(showQuota);
  const { data: quota, isLoading: quotaLoading } = useAccountQuota(
    normalizedProvider,
    account.id,
    showQuota
  );
  const runtimeLastUsed = getAccountStats(stats, account)?.lastUsedAt;

  const beforeIdentity =
    selectable || onPauseToggle ? (
      <div className="flex items-center gap-2 shrink-0">
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
      </div>
    ) : undefined;

  const headerEnd = (
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
  );

  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-colors overflow-hidden',
        account.isDefault ? 'border-primary/30 bg-primary/5' : 'border-border hover:bg-muted/30',
        account.paused && 'opacity-75',
        selected && 'ring-2 ring-primary/50 bg-primary/5'
      )}
    >
      <AccountSurfaceCard
        mode="detailed"
        provider={account.provider}
        accountId={account.id}
        email={account.email}
        displayEmail={account.email || account.id}
        tokenFile={account.tokenFile}
        tier={account.tier}
        isDefault={account.isDefault}
        paused={account.paused}
        privacyMode={privacyMode}
        showQuota={showQuota}
        quota={quota}
        quotaLoading={quotaLoading}
        runtimeLastUsed={runtimeLastUsed}
        beforeIdentity={beforeIdentity}
        headerEnd={headerEnd}
        bodySlot={
          account.provider === 'agy' ? renderProjectId(account.projectId, privacyMode) : null
        }
        quotaInsetClassName="pl-11"
      />
    </div>
  );
}
