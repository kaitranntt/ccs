/**
 * AccountsActionRail — Left rail for the Accounts page (design system ConfigLayout left slot).
 *
 * Contains: primary actions (create, auth, open pool), legacy migration follow-up,
 * quick command snippets. Renders inside a 260px ConfigLayout left aside.
 */

import { AlertTriangle, ArrowRight, Plus, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTranslation } from 'react-i18next';

export interface AccountsActionRailProps {
  legacyContextCount: number;
  legacyContinuityCount: number;
  legacyTargetCount: number;
  hasLegacyFollowUp: boolean;
  isPendingLegacy: boolean;
  onCreateAccount: () => void;
  onAuthClaudeInPool: () => void;
  onOpenClaudePool: () => void;
  onConfirmLegacy: () => void;
}

export function AccountsActionRail({
  legacyContextCount,
  legacyContinuityCount,
  legacyTargetCount,
  hasLegacyFollowUp,
  isPendingLegacy,
  onCreateAccount,
  onAuthClaudeInPool,
  onOpenClaudePool,
  onConfirmLegacy,
}: AccountsActionRailProps) {
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1">
        <div className="space-y-3 p-4">
          {/* Primary actions */}
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t('accountsPage.primaryActions')}
            </p>
            <Button size="sm" className="w-full justify-start" onClick={onCreateAccount}>
              <Plus className="w-4 h-4 mr-2" />
              {t('accountsPage.createAccount')}
            </Button>
            <Button size="sm" className="w-full justify-start" onClick={onAuthClaudeInPool}>
              <Zap className="w-4 h-4 mr-2" />
              {t('accountsPage.authClaudeInPool')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={onOpenClaudePool}
            >
              {t('accountsPage.openClaudePoolSettings')}
              <ArrowRight className="w-4 h-4 ml-auto" />
            </Button>
          </div>

          {/* Legacy migration follow-up */}
          {hasLegacyFollowUp ? (
            <section aria-label={t('accountsPage.migrationFollowup')} className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t('accountsPage.migrationFollowup')}
              </p>
              <div className="space-y-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    aria-hidden="true"
                    className="h-4 w-4 mt-0.5 text-amber-700 dark:text-amber-400 shrink-0"
                  />
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
                  onClick={onConfirmLegacy}
                  disabled={isPendingLegacy || legacyTargetCount === 0}
                >
                  {isPendingLegacy
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

          {/* Quick commands card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('accountsPage.quickCommands')}</CardTitle>
              <CardDescription>{t('accountsPage.quickCommandsDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-start gap-2 rounded-md border bg-background px-2 py-2 font-mono text-[11px]">
                <span className="flex-1 break-all">
                  ccs auth create work --context-group sprint-a --deeper-continuity
                </span>
                <CopyButton
                  value="ccs auth create work --context-group sprint-a --deeper-continuity"
                  size="icon"
                />
              </div>
              <div className="flex items-start gap-2 rounded-md border bg-background px-2 py-2 font-mono text-[11px]">
                <span className="flex-1 break-all">ccs cliproxy auth claude</span>
                <CopyButton value="ccs cliproxy auth claude" size="icon" />
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
