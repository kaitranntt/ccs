/**
 * AccountsMobileFallback — Mobile layout for the Accounts page (<lg breakpoint).
 *
 * Shown via `lg:hidden` when ConfigLayout's desktop 3-pane grid is hidden.
 * Renders a stacked card layout: actions card, ContinuityOverview, AccountsTable.
 */

import { ArrowRight, Plus, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AccountsTable } from '@/components/account/accounts-table';
import { ContinuityOverview } from '@/components/account/continuity-overview';
import type { AuthAccountRow, SharedGroupSummary } from '@/lib/account-continuity';
import type { PlainCcsLane } from '@/lib/api-client';
import { useTranslation } from 'react-i18next';

export interface AccountsMobileFallbackProps {
  authAccounts: AuthAccountRow[];
  isLoading: boolean;
  defaultAccount: string | null;
  sharedCount: number;
  groupSummaries: SharedGroupSummary[];
  plainCcsLane: PlainCcsLane | null;
  legacyTargetCount: number;
  cliproxyCount: number;
  isolatedCount: number;
  sharedStandardCount: number;
  deeperSharedCount: number;
  sharedAloneCount: number;
  sharedPeerAccountCount: number;
  deeperReadyAccountCount: number;
  sharedGroups: string[];
  sharedPeerGroups: string[];
  deeperReadyGroups: string[];
  isPendingLegacy: boolean;
  onCreateAccount: () => void;
  onOpenClaudePool: () => void;
  onAuthClaudeInPool: () => void;
  onConfirmLegacy: () => void;
}

export function AccountsMobileFallback({
  authAccounts,
  isLoading,
  defaultAccount,
  sharedCount,
  groupSummaries,
  plainCcsLane,
  legacyTargetCount,
  cliproxyCount,
  isolatedCount,
  sharedStandardCount,
  deeperSharedCount,
  sharedAloneCount,
  sharedPeerAccountCount,
  deeperReadyAccountCount,
  sharedGroups,
  sharedPeerGroups,
  deeperReadyGroups,
  isPendingLegacy,
  onCreateAccount,
  onOpenClaudePool,
  onAuthClaudeInPool,
  onConfirmLegacy,
}: AccountsMobileFallbackProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 p-4 lg:hidden">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('accountsPage.title')}</CardTitle>
          <CardDescription>
            {t('accountsPage.managePrefix')}
            <code className="mx-1 rounded bg-muted px-1 py-0.5">ccs auth</code>
            {t('accountsPage.mobileManageSuffix')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button className="w-full" onClick={onCreateAccount}>
            <Plus className="w-4 h-4 mr-2" />
            {t('accountsPage.createAccount')}
          </Button>
          <Button variant="outline" className="w-full" onClick={onOpenClaudePool}>
            {t('accountsPage.openCliProxyClaudePool')}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          <Button variant="outline" className="w-full" onClick={onAuthClaudeInPool}>
            {t('accountsPage.authClaudeInPool')}
            <Zap className="w-4 h-4 ml-2" />
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={onConfirmLegacy}
            disabled={isPendingLegacy || legacyTargetCount === 0}
          >
            {isPendingLegacy
              ? t('accountsPage.confirmingLegacy')
              : t('accountsPage.confirmLegacy', { count: legacyTargetCount })}
          </Button>
        </CardContent>
      </Card>

      <ContinuityOverview
        totalAccounts={authAccounts.length}
        primaryAccountName={authAccounts.length === 1 ? authAccounts[0]?.name : null}
        isolatedCount={isolatedCount}
        sharedStandardCount={sharedStandardCount}
        deeperSharedCount={deeperSharedCount}
        sharedAloneCount={sharedAloneCount}
        sharedPeerAccountCount={sharedPeerAccountCount}
        deeperReadyAccountCount={deeperReadyAccountCount}
        sharedGroups={sharedGroups}
        sharedPeerGroups={sharedPeerGroups}
        deeperReadyGroups={deeperReadyGroups}
        legacyTargetCount={legacyTargetCount}
        cliproxyCount={cliproxyCount}
        plainCcsLane={plainCcsLane}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('accountsPage.accountMatrix')}</CardTitle>
          <CardDescription>
            {t('accountsPage.sharedTotalDesc', { count: sharedCount })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-muted-foreground">{t('accountsPage.loadingAccounts')}</div>
          ) : (
            <AccountsTable
              data={authAccounts}
              defaultAccount={defaultAccount}
              groupSummaries={groupSummaries}
              plainCcsLane={plainCcsLane}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
