/**
 * AccountsWorkspace — Main content area for the Accounts page (ConfigLayout form slot).
 *
 * Renders ContinuityOverview summary cards + AccountsTable. Has its own internal
 * scroll — intentionally NOT wrapped in FormPane to avoid double-scroll nesting.
 */

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AccountsTable } from '@/components/account/accounts-table';
import { ContinuityOverview } from '@/components/account/continuity-overview';
import type { AuthAccountRow, SharedGroupSummary } from '@/lib/account-continuity';
import type { PlainCcsLane } from '@/lib/api-client';
import { useTranslation } from 'react-i18next';

export interface AccountsWorkspaceProps {
  authAccounts: AuthAccountRow[];
  isLoading: boolean;
  defaultAccount: string | null;
  sharedCount: number;
  isolatedCount: number;
  sharedStandardCount: number;
  deeperSharedCount: number;
  sharedAloneCount: number;
  sharedPeerAccountCount: number;
  deeperReadyAccountCount: number;
  sharedGroups: string[];
  sharedPeerGroups: string[];
  deeperReadyGroups: string[];
  legacyTargetCount: number;
  cliproxyCount: number;
  plainCcsLane: PlainCcsLane | null;
  groupSummaries: SharedGroupSummary[];
}

export function AccountsWorkspace({
  authAccounts,
  isLoading,
  defaultAccount,
  sharedCount,
  isolatedCount,
  sharedStandardCount,
  deeperSharedCount,
  sharedAloneCount,
  sharedPeerAccountCount,
  deeperReadyAccountCount,
  sharedGroups,
  sharedPeerGroups,
  deeperReadyGroups,
  legacyTargetCount,
  cliproxyCount,
  plainCcsLane,
  groupSummaries,
}: AccountsWorkspaceProps) {
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Workspace sub-header: badges + section title */}
      <div className="shrink-0 border-b bg-background px-5 py-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{t('accountsPage.workspaceBadge')}</Badge>
          <Badge variant="secondary">{t('accountsPage.historySyncBadge')}</Badge>
        </div>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">
          {t('accountsPage.authAccounts')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('accountsPage.tableScopePrefix')}
          <code className="mx-1 rounded bg-muted px-1 py-0.5">ccs auth</code>
          {t('accountsPage.tableScopeMiddle')}
          <code className="mx-1 rounded bg-muted px-1 py-0.5">{t('accountsTable.sync')}</code>
          {t('accountsPage.tableScopeSuffix')}
        </p>
      </div>

      {/* Scrollable content: overview cards + table */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
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

        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{t('accountsPage.accountMatrix')}</CardTitle>
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
    </div>
  );
}
