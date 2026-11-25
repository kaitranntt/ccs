import { AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type {
  ClaudeExtensionActionTarget,
  ClaudeExtensionBindingStatus,
  ClaudeExtensionHostOption,
  ClaudeExtensionSetupPayload,
} from '@/hooks/use-claude-extension';
import type { BindingDraft } from './binding-utils';
import { DetailRow, TargetStatusCard } from './extension-ui-primitives';

export function BindingOverviewTab({
  selectedHost,
  currentDraft,
  setup,
  status,
  creating,
  isBusyShared,
  isBusyIde,
  isApplyingAll,
  isResettingAll,
  onRunBindingAction,
}: {
  selectedHost?: ClaudeExtensionHostOption;
  currentDraft: BindingDraft;
  setup?: ClaudeExtensionSetupPayload;
  status?: ClaudeExtensionBindingStatus;
  creating: boolean;
  isBusyShared: boolean;
  isBusyIde: boolean;
  isApplyingAll: boolean;
  isResettingAll: boolean;
  onRunBindingAction: (target: ClaudeExtensionActionTarget, action: 'apply' | 'reset') => void;
}) {
  const { t } = useTranslation();
  const hiddenEnvCount = Math.max((setup?.env.length ?? 0) - 6, 0);
  const envPreview = setup?.env.slice(0, 6) ?? [];

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <TargetStatusCard
          title={t('claudeExtensionPage.sharedClaudeSettings', {
            defaultValue: 'Shared Claude settings',
          })}
          description={t('claudeExtensionPage.sharedClaudeSettingsDescription', {
            defaultValue:
              'Writes the managed env block inside ~/.claude/settings.json so CLI and IDE behavior stay aligned.',
          })}
          status={status?.sharedSettings}
          applyLabel={t('claudeExtensionPage.applyShared', {
            defaultValue: 'Apply shared',
          })}
          resetLabel={t('claudeExtensionPage.resetShared', {
            defaultValue: 'Reset shared',
          })}
          onApply={() => onRunBindingAction('shared', 'apply')}
          onReset={() => onRunBindingAction('shared', 'reset')}
          disabled={creating}
          busy={isBusyShared}
        />
        <TargetStatusCard
          title={`${selectedHost?.label || 'IDE'} settings.json`}
          description="Writes only the Anthropic extension keys so unrelated editor preferences stay untouched."
          status={status?.ideSettings}
          applyLabel={t('claudeExtensionPage.applyIde', { defaultValue: 'Apply IDE' })}
          resetLabel={t('claudeExtensionPage.resetIde', { defaultValue: 'Reset IDE' })}
          onApply={() => onRunBindingAction('ide', 'apply')}
          onReset={() => onRunBindingAction('ide', 'reset')}
          disabled={creating}
          busy={isBusyIde}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <Card className="border-border/60 bg-card/80">
          <CardHeader>
            <CardTitle className="text-base">
              {t('settingsPage.thinkingSection.resolvedBinding')}
            </CardTitle>
            <CardDescription>
              {t('claudeExtensionPage.resolvedBindingDescription', {
                defaultValue:
                  'The binding uses the same profile resolution as `ccs persist` and `ccs env`.',
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow
              label={t('claudeExtensionPage.profile', { defaultValue: 'Profile' })}
              value={setup?.profile.label || currentDraft.profile || 'Not selected'}
            />
            <DetailRow
              label={t('claudeExtensionPage.profileType', {
                defaultValue: 'Profile type',
              })}
              value={setup?.profile.profileType || 'Unknown'}
            />
            <DetailRow label="IDE host" value={selectedHost?.label || 'Not selected'} />
            <DetailRow
              label={t('claudeExtensionPage.idePathMode', {
                defaultValue: 'IDE path mode',
              })}
              value={
                currentDraft.ideSettingsPath.trim()
                  ? t('claudeExtensionPage.customPath', { defaultValue: 'Custom path' })
                  : t('claudeExtensionPage.defaultUserPath', {
                      defaultValue: 'Default user path',
                    })
              }
            />
            <DetailRow
              label={t('claudeExtensionPage.effectiveIdePath', {
                defaultValue: 'Effective IDE path',
              })}
              value={
                status?.ideSettings.path ||
                currentDraft.ideSettingsPath.trim() ||
                selectedHost?.defaultSettingsPath ||
                'Unavailable'
              }
              mono
              copyValue={
                status?.ideSettings.path ||
                currentDraft.ideSettingsPath.trim() ||
                selectedHost?.defaultSettingsPath
              }
            />
            <DetailRow
              label={t('claudeExtensionPage.persistCommand', {
                defaultValue: 'Persist command',
              })}
              value={
                setup?.sharedSettings.command ||
                t('claudeExtensionPage.saveValidBindingFirst', {
                  defaultValue: 'Save a valid binding first',
                })
              }
              mono
            />
            {currentDraft.notes.trim() ? (
              <DetailRow
                label={t('settingsPage.thinkingSection.notes')}
                value={currentDraft.notes.trim()}
              />
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/80">
          <CardHeader>
            <CardTitle className="text-base">
              {t('settingsPage.thinkingSection.managedPayload')}
            </CardTitle>
            <CardDescription>
              {t('claudeExtensionPage.managedPayloadDescription', {
                defaultValue: 'Keep the main view short. The full JSON stays in the Advanced tab.',
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {envPreview.map((entry) => (
                <Badge key={entry.name} variant="secondary" className="font-mono text-[10px]">
                  {entry.name}
                </Badge>
              ))}
              {hiddenEnvCount > 0 ? <Badge variant="outline">+{hiddenEnvCount} more</Badge> : null}
            </div>

            <div className="rounded-lg border bg-muted/25 p-4 text-sm">
              {setup?.env.length ? (
                <div className="space-y-2">
                  <div className="font-medium">
                    {t('claudeExtensionPage.envInjected', {
                      count: setup.env.length,
                      defaultValue: 'CCS will inject {{count}} environment values.',
                    })}
                  </div>
                  <div className="text-muted-foreground">
                    {t('claudeExtensionPage.envInjectedDescription', {
                      defaultValue:
                        'The IDE-local target receives the extension schema. The shared target receives the same env block through Claude settings.',
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-muted-foreground">
                  {t('claudeExtensionPage.nativeDefaultsDescription', {
                    defaultValue:
                      'This profile resolves to native Claude defaults, so apply/reset mainly clears existing CCS-managed overrides.',
                  })}
                </div>
              )}
            </div>

            {!creating ? (
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => onRunBindingAction('all', 'apply')}
                  disabled={isApplyingAll}
                >
                  {isApplyingAll ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  {t('claudeExtensionPage.applyBothTargets', {
                    defaultValue: 'Apply both targets',
                  })}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => onRunBindingAction('all', 'reset')}
                  disabled={isResettingAll}
                >
                  {t('claudeExtensionPage.resetBothTargets', {
                    defaultValue: 'Reset both targets',
                  })}
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/15 p-4 text-sm text-muted-foreground">
                {t('claudeExtensionPage.saveDraftToUnlock', {
                  defaultValue: 'Save this draft to unlock apply, reset, and verify actions.',
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {setup && (setup.warnings.length > 0 || setup.notes.length > 0) ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="border-border/60 bg-card/80">
            <CardHeader>
              <CardTitle className="text-base">
                {t('settingsPage.thinkingSection.warnings')}
              </CardTitle>
              <CardDescription>
                Operational details that can break the binding even when JSON is correct.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {setup.warnings.length > 0 ? (
                setup.warnings.map((warning) => (
                  <div
                    key={warning}
                    className="flex items-start gap-3 rounded-lg border border-amber-400/40 bg-amber-50/60 p-3 text-sm dark:bg-amber-950/10"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <span>{warning}</span>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                  No runtime warnings for this binding.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/80">
            <CardHeader>
              <CardTitle className="text-base">{t('settingsPage.thinkingSection.notes')}</CardTitle>
              <CardDescription>
                Short context from CCS about account continuity and host-specific behavior.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {setup.notes.length > 0 ? (
                setup.notes.map((note) => (
                  <div
                    key={note}
                    className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 text-sm"
                  >
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>{note}</span>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                  No extra notes for this binding.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
