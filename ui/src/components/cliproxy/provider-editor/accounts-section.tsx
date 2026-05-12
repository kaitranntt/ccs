/**
 * Accounts Section Component
 * Manages connected OAuth accounts for a provider with multi-select bulk actions
 */

import { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { User, Plus, Globe } from 'lucide-react';
import { AccountItem } from './account-item';
import { BulkActionBar } from './bulk-action-bar';
import type { OAuthAccount } from '@/lib/api-client';
import { useTranslation } from 'react-i18next';

interface AccountsSectionProps {
  accounts: OAuthAccount[];
  onAddAccount: () => void;
  onSetDefault: (accountId: string) => void;
  onRemoveAccount: (accountId: string) => void;
  onPauseToggle?: (accountId: string, paused: boolean) => void;
  /** Solo mode: activate one account, pause all others */
  onSoloMode?: (accountId: string) => void;
  /** Bulk pause multiple accounts */
  onBulkPause?: (accountIds: string[]) => void;
  /** Bulk resume multiple accounts */
  onBulkResume?: (accountIds: string[]) => void;
  isRemovingAccount?: boolean;
  /** Pause/resume mutation in progress */
  isPausingAccount?: boolean;
  /** Solo mode mutation in progress */
  isSoloingAccount?: boolean;
  /** Bulk pause mutation in progress */
  isBulkPausing?: boolean;
  /** Bulk resume mutation in progress */
  isBulkResuming?: boolean;
  privacyMode?: boolean;
  /** Show quota bars for accounts when provider supports quota API */
  showQuota?: boolean;
  /** Kiro-specific: show "use normal browser" toggle */
  isKiro?: boolean;
  kiroNoIncognito?: boolean;
  onKiroNoIncognitoChange?: (enabled: boolean) => void;
  kiroSettingsLoading?: boolean;
}

export function AccountsSection({
  accounts,
  onAddAccount,
  onSetDefault,
  onRemoveAccount,
  onPauseToggle,
  onSoloMode,
  onBulkPause,
  onBulkResume,
  isRemovingAccount,
  isPausingAccount,
  isSoloingAccount,
  isBulkPausing,
  isBulkResuming,
  privacyMode,
  showQuota,
  isKiro,
  kiroNoIncognito,
  onKiroNoIncognitoChange,
  kiroSettingsLoading,
}: AccountsSectionProps) {
  const { t } = useTranslation();
  // Multi-select state - raw selection (may contain stale IDs)
  const [rawSelectedIds, setRawSelectedIds] = useState<Set<string>>(new Set());

  // Derive valid selections by filtering out stale IDs
  const accountIds = useMemo(() => new Set(accounts.map((a) => a.id)), [accounts]);
  const selectedIds = useMemo(
    () => new Set([...rawSelectedIds].filter((id) => accountIds.has(id))),
    [rawSelectedIds, accountIds]
  );

  // Enable multi-select when bulk actions are available
  const isSelectable = !!(onBulkPause && onBulkResume);

  // Computed selection state
  const selectedCount = selectedIds.size;
  const allSelected = accounts.length > 0 && selectedIds.size === accounts.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < accounts.length;

  // Selection handlers
  const toggleSelect = useCallback((id: string) => {
    setRawSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setRawSelectedIds(new Set(accounts.map((a) => a.id)));
  }, [accounts]);

  const deselectAll = useCallback(() => {
    setRawSelectedIds(new Set());
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      deselectAll();
    } else {
      selectAll();
    }
  }, [allSelected, selectAll, deselectAll]);

  // Bulk action handlers
  const handleBulkPause = useCallback(() => {
    if (onBulkPause && selectedIds.size > 0) {
      onBulkPause(Array.from(selectedIds));
      // Clear selection after action (will be invalidated by mutation success)
      setRawSelectedIds(new Set());
    }
  }, [onBulkPause, selectedIds]);

  const handleBulkResume = useCallback(() => {
    if (onBulkResume && selectedIds.size > 0) {
      onBulkResume(Array.from(selectedIds));
      setRawSelectedIds(new Set());
    }
  }, [onBulkResume, selectedIds]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium flex items-center gap-2">
          {/* Select All checkbox */}
          {isSelectable && accounts.length > 0 && (
            <Checkbox
              checked={allSelected}
              onCheckedChange={toggleSelectAll}
              aria-label="Select all accounts"
              className={someSelected ? 'data-[state=checked]:bg-primary/50' : ''}
              {...(someSelected ? { 'data-state': 'indeterminate' } : {})}
            />
          )}
          <User className="w-4 h-4" />
          {t('providerEditor.accounts')}
          {accounts.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {accounts.length}
            </Badge>
          )}
        </h3>
        <Button variant="default" size="sm" className="h-7 text-xs gap-1" onClick={onAddAccount}>
          <Plus className="w-3 h-3" />
          {t('providerEditor.addAccount')}
        </Button>
      </div>

      {/* Bulk Action Bar - shows when accounts selected (positioned at TOP for visibility) */}
      {isSelectable && selectedCount > 0 && (
        <BulkActionBar
          selectedCount={selectedCount}
          onPauseSelected={handleBulkPause}
          onResumeSelected={handleBulkResume}
          onClearSelection={deselectAll}
          isPausing={!!isBulkPausing}
          isResuming={!!isBulkResuming}
        />
      )}

      {accounts.length > 0 ? (
        <div className="space-y-2">
          {accounts.map((account) => (
            <AccountItem
              key={account.id}
              account={account}
              onSetDefault={() => onSetDefault(account.id)}
              onRemove={() => onRemoveAccount(account.id)}
              onPauseToggle={
                onPauseToggle ? (paused) => onPauseToggle(account.id, paused) : undefined
              }
              onSoloMode={onSoloMode ? () => onSoloMode(account.id) : undefined}
              isRemoving={isRemovingAccount}
              isPausingAccount={isPausingAccount}
              isSoloingAccount={isSoloingAccount}
              privacyMode={privacyMode}
              showQuota={showQuota}
              selectable={isSelectable}
              selected={selectedIds.has(account.id)}
              onSelectChange={() => toggleSelect(account.id)}
            />
          ))}
        </div>
      ) : (
        <div className="py-6 text-center text-muted-foreground bg-muted/30 rounded-lg border border-dashed">
          <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{t('providerEditor.noAccountsConnected')}</p>
          <p className="text-xs opacity-70">{t('providerEditor.addAccountToStart')}</p>
        </div>
      )}

      {/* Kiro-specific: Incognito browser setting - users complain "it keeps opening incognito" */}
      {isKiro && onKiroNoIncognitoChange && (
        <div className="mt-3 pt-3 border-t border-dashed">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Globe className="w-3.5 h-3.5" />
              <span>{t('providerEditor.useIncognito')}</span>
            </div>
            <Switch
              checked={!kiroNoIncognito}
              onCheckedChange={(v) => onKiroNoIncognitoChange(!v)}
              disabled={kiroSettingsLoading}
              className="scale-90"
            />
          </div>
        </div>
      )}
    </div>
  );
}
