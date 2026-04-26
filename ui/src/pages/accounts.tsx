/**
 * Accounts Page
 * Design system: PageShell + PageHeader + ConfigLayout (action-rail + workspace)
 * Archetype: Multi-entity Config — identity strip: PageHeader (1c)
 *
 * Left rail: AccountsActionRail (actions, legacy warning, quick commands)
 * Form slot: AccountsWorkspace (ContinuityOverview + AccountsTable, own scroll)
 * No json pane — accounts data is tabular, not config-as-JSON.
 * No FormPane wrapper — AccountsWorkspace has its own scroll to avoid double-scroll.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { PageShell } from '@/components/page-shell/page-shell';
import { PageHeader } from '@/components/page-shell/page-header';
import { ConfigLayout } from '@/components/config-layout/config-layout';
import { AccountsActionRail } from '@/components/account/accounts-action-rail';
import { AccountsWorkspace } from '@/components/account/accounts-workspace';
import { AccountsMobileFallback } from '@/components/account/accounts-mobile-fallback';
import { CreateAuthProfileDialog } from '@/components/account/create-auth-profile-dialog';
import { useAccounts, useConfirmLegacyAccountPolicies } from '@/hooks/use-accounts';
import { useTranslation } from 'react-i18next';

export function AccountsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading } = useAccounts();
  const confirmLegacyMutation = useConfirmLegacyAccountPolicies();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Flatten data to avoid repeated nullish coalescing in JSX
  const authAccounts = data?.accounts ?? [];
  const cliproxyCount = data?.cliproxyCount ?? 0;
  const legacyContextCount = data?.legacyContextCount ?? 0;
  const legacyContinuityCount = data?.legacyContinuityCount ?? 0;
  const sharedCount = data?.sharedCount ?? 0;
  const sharedStandardCount = data?.sharedStandardCount ?? 0;
  const deeperSharedCount = data?.deeperSharedCount ?? 0;
  const isolatedCount = data?.isolatedCount ?? 0;
  const sharedAloneCount = data?.sharedAloneCount ?? 0;
  const sharedPeerAccountCount = data?.sharedPeerAccountCount ?? 0;
  const deeperReadyAccountCount = data?.deeperReadyAccountCount ?? 0;
  const sharedPeerGroups = data?.sharedPeerGroups ?? [];
  const deeperReadyGroups = data?.deeperReadyGroups ?? [];
  const sharedGroups = data?.sharedGroups ?? [];
  const groupSummaries = data?.groupSummaries ?? [];
  const plainCcsLane = data?.plainCcsLane ?? null;

  const legacyTargets = authAccounts.filter(
    (account) => account.context_inferred || account.continuity_inferred
  );
  const legacyTargetCount = legacyTargets.length;
  const hasLegacyFollowUp = legacyTargetCount > 0;

  const handleOpenClaudePool = () => navigate('/cliproxy?provider=claude');
  const handleOpenClaudePoolAuth = () => navigate('/cliproxy?provider=claude&action=auth');
  const handleConfirmLegacy = () => confirmLegacyMutation.mutate(legacyTargets);

  // Shared props for both desktop rail and mobile fallback
  const actionProps = {
    legacyContextCount,
    legacyContinuityCount,
    legacyTargetCount,
    hasLegacyFollowUp,
    isPendingLegacy: confirmLegacyMutation.isPending,
    onCreateAccount: () => setCreateDialogOpen(true),
    onAuthClaudeInPool: handleOpenClaudePoolAuth,
    onOpenClaudePool: handleOpenClaudePool,
    onConfirmLegacy: handleConfirmLegacy,
  };

  // Shared props for both desktop workspace and mobile fallback
  const workspaceProps = {
    authAccounts,
    isLoading,
    defaultAccount: data?.default ?? null,
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
  };

  return (
    <>
      {/* Desktop: 3-pane ConfigLayout inside PageShell */}
      <div className="hidden h-full min-h-0 lg:flex lg:flex-col">
        <PageShell>
          <PageHeader
            title={
              <span className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                {t('accountsPage.title')}
              </span>
            }
            description={
              <>
                {t('accountsPage.managePrefix')}
                <code className="mx-1 rounded bg-muted px-1 py-0.5">ccs auth</code>
                {t('accountsPage.manageSuffix')}
              </>
            }
          />
          <ConfigLayout
            left={<AccountsActionRail {...actionProps} />}
            form={<AccountsWorkspace {...workspaceProps} />}
          />
        </PageShell>
      </div>

      {/* Mobile fallback: stacked cards, shown below lg breakpoint */}
      <AccountsMobileFallback {...workspaceProps} {...actionProps} />

      <CreateAuthProfileDialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} />
    </>
  );
}
