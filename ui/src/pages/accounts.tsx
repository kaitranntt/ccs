/**
 * Accounts Page
 * Dashboard parity: Auth profile CRUD operations
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Plus, Users, Zap } from 'lucide-react';
import { AccountsTable } from '@/components/account/accounts-table';
import { AccountRouteGuideCard } from '@/components/account/account-route-guide-card';
import { ContinuityOverview } from '@/components/account/continuity-overview';
import { CreateAuthProfileDialog } from '@/components/account/create-auth-profile-dialog';
import { CopyButton } from '@/components/ui/copy-button';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAccounts, useConfirmLegacyAccountPolicies } from '@/hooks/use-accounts';
import { useTranslation } from 'react-i18next';

export function AccountsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading } = useAccounts();
  const confirmLegacyMutation = useConfirmLegacyAccountPolicies();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const authAccounts = data?.accounts || [];
  const cliproxyCount = data?.cliproxyCount || 0;
  const legacyContextCount = data?.legacyContextCount || 0;
  const legacyContinuityCount = data?.legacyContinuityCount || 0;
  const sharedCount = data?.sharedCount || 0;
  const sharedStandardCount = data?.sharedStandardCount || 0;
  const deeperSharedCount = data?.deeperSharedCount || 0;
  const isolatedCount = data?.isolatedCount || 0;
  const sharedAloneCount = data?.sharedAloneCount || 0;
  const sharedPeerAccountCount = data?.sharedPeerAccountCount || 0;
  const deeperReadyAccountCount = data?.deeperReadyAccountCount || 0;
  const sharedPeerGroups = data?.sharedPeerGroups || [];
  const deeperReadyGroups = data?.deeperReadyGroups || [];
  const sharedGroups = data?.sharedGroups || [];
  const groupSummaries = data?.groupSummaries || [];
  const plainCcsLane = data?.plainCcsLane || null;

  const legacyTargets = authAccounts.filter(
    (account) => account.context_inferred || account.continuity_inferred
  );
  const legacyTargetCount = legacyTargets.length;
  const hasLegacyFollowUp = legacyTargetCount > 0;

  const handleOpenClaudePool = () => navigate('/cliproxy?provider=claude');
  const handleOpenClaudePoolAuth = () => navigate('/cliproxy?provider=claude&action=auth');
  const handleConfirmLegacy = () => confirmLegacyMutation.mutate(legacyTargets);

  return (
    <>
      <div className="hidden h-full min-h-0 lg:flex">
        {/* Left action column */}
        <div className="w-80 border-r flex flex-col bg-muted/20 shrink-0">
          <div className="p-4 border-b bg-background space-y-2">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <h1 className="font-semibold">{t('accountsPage.title')}</h1>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('accountsPage.managePrefix')}
              <code className="mx-1 rounded bg-muted px-1 py-0.5">ccs auth</code>
              {t('accountsPage.manageSuffix')}
            </p>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3">
              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t('accountsPage.primaryActions')}
                </p>
                <Button
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => setCreateDialogOpen(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {t('accountsPage.createAccount')}
                </Button>
                <Button
                  size="sm"
                  className="w-full justify-start"
                  onClick={handleOpenClaudePoolAuth}
                >
                  <Zap className="w-4 h-4 mr-2" />
                  {t('accountsPage.authClaudeInPool')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={handleOpenClaudePool}
                >
                  {t('accountsPage.openClaudePoolSettings')}
                  <ArrowRight className="w-4 h-4 ml-auto" />
                </Button>
              </div>

              {hasLegacyFollowUp ? (
                <section className="space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t('accountsPage.migrationFollowup')}
                  </p>
                  <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 space-y-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-700 dark:text-amber-400 shrink-0" />
                      <div className="space-y-1 text-xs">
                        {legacyContextCount > 0 && (
                          <p className="text-amber-800 dark:text-amber-300">
                            {t('accountsPage.legacyContextPending', { count: legacyContextCount })}
                          </p>
                        )}
                        {legacyContinuityCount > 0 && (
                          <p className="text-amber-800 dark:text-amber-300">
                            {t('accountsPage.legacyContinuityPending', {
                              count: legacyContinuityCount,
                            })}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full justify-start"
                      onClick={handleConfirmLegacy}
                      disabled={confirmLegacyMutation.isPending || legacyTargetCount === 0}
                    >
                      {confirmLegacyMutation.isPending
                        ? t('accountsPage.confirmingLegacy')
                        : t('accountsPage.confirmLegacy', { count: legacyTargetCount })}
                    </Button>
                  </div>
                </section>
              ) : (
                <div className="rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
                  {t('accountsPage.noLegacyFollowup')}
                </div>
              )}

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{t('accountsPage.quickCommands')}</CardTitle>
                  <CardDescription>{t('accountsPage.quickCommandsDesc')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="rounded-md border bg-background px-2 py-2 font-mono text-[11px] flex items-start gap-2">
                    <span className="flex-1 break-all">
                      ccs auth create work --share-context --context-group sprint-a
                      --deeper-continuity
                    </span>
                    <CopyButton
                      value="ccs auth create work --share-context --context-group sprint-a --deeper-continuity"
                      size="icon"
                    />
                  </div>
                  <div className="rounded-md border bg-background px-2 py-2 font-mono text-[11px] flex items-start gap-2">
                    <span className="flex-1 break-all">ccs cliproxy auth claude</span>
                    <CopyButton value="ccs cliproxy auth claude" size="icon" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </div>

        {/* Main workspace */}
        <div className="flex-1 min-w-0 flex flex-col bg-background">
          <div className="px-5 py-4 border-b bg-background">
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

          <div className="flex-1 min-h-0 p-5 space-y-4 overflow-y-auto">
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

            <AccountRouteGuideCard
              totalAccounts={authAccounts.length}
              isolatedCount={isolatedCount}
              sharedPeerGroups={sharedPeerGroups}
              deeperReadyGroups={deeperReadyGroups}
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
                    defaultAccount={data?.default ?? null}
                    groupSummaries={groupSummaries}
                    plainCcsLane={plainCcsLane}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Mobile fallback */}
      <div className="p-4 space-y-4 lg:hidden">
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
            <Button className="w-full" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              {t('accountsPage.createAccount')}
            </Button>
            <Button variant="outline" className="w-full" onClick={handleOpenClaudePool}>
              {t('accountsPage.openCliProxyClaudePool')}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button variant="outline" className="w-full" onClick={handleOpenClaudePoolAuth}>
              {t('accountsPage.authClaudeInPool')}
              <Zap className="w-4 h-4 ml-2" />
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleConfirmLegacy}
              disabled={confirmLegacyMutation.isPending || legacyTargetCount === 0}
            >
              {confirmLegacyMutation.isPending
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

        <AccountRouteGuideCard
          totalAccounts={authAccounts.length}
          isolatedCount={isolatedCount}
          sharedPeerGroups={sharedPeerGroups}
          deeperReadyGroups={deeperReadyGroups}
        />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('accountsPage.accountMatrix')}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-muted-foreground">{t('accountsPage.loadingAccounts')}</div>
            ) : (
              <AccountsTable
                data={authAccounts}
                defaultAccount={data?.default ?? null}
                groupSummaries={groupSummaries}
                plainCcsLane={plainCcsLane}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <CreateAuthProfileDialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} />
    </>
  );
}
