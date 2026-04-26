/**
 * ResolvedBindingSection — Resolved binding details + managed payload summary.
 *
 * Corresponds to the two-column grid below the TargetStatusCards in the
 * Overview tab: the wider "Resolved Binding" card and the narrower
 * "Managed Payload" card with the apply-both / reset-both actions.
 */
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type {
  ClaudeExtensionSetupPayload,
  ClaudeExtensionTargetStatus,
  ClaudeExtensionHostOption,
} from '@/hooks/use-claude-extension';
import { DetailRow } from '../lib/claude-extension-ui-atoms';
import type { BindingDraft } from '../lib/claude-extension-draft-utils';

interface ResolvedBindingSectionProps {
  setup: ClaudeExtensionSetupPayload | undefined;
  ideStatus: ClaudeExtensionTargetStatus | undefined;
  draft: BindingDraft;
  selectedHost: ClaudeExtensionHostOption | undefined;
  creating: boolean;
  isApplyingAll: boolean;
  isResettingAll: boolean;
  onApplyAll: () => void;
  onResetAll: () => void;
}

export function ResolvedBindingSection({
  setup,
  ideStatus,
  draft,
  selectedHost,
  creating,
  isApplyingAll,
  isResettingAll,
  onApplyAll,
  onResetAll,
}: ResolvedBindingSectionProps) {
  const { t } = useTranslation();

  // First 6 env entries shown as badges; remainder counted
  const envPreview = setup?.env.slice(0, 6) ?? [];
  const hiddenEnvCount = Math.max((setup?.env.length ?? 0) - 6, 0);

  // Effective IDE path resolution order: verified status → draft override → host default
  const effectiveIdePath =
    (ideStatus?.path ?? draft.ideSettingsPath.trim()) || selectedHost?.defaultSettingsPath;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
      {/* Resolved Binding card */}
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
            value={(setup?.profile.label ?? draft.profile) || 'Not selected'}
          />
          <DetailRow
            label={t('claudeExtensionPage.profileType', { defaultValue: 'Profile type' })}
            value={setup?.profile.profileType ?? 'Unknown'}
          />
          <DetailRow label="IDE host" value={selectedHost?.label ?? 'Not selected'} />
          <DetailRow
            label={t('claudeExtensionPage.idePathMode', { defaultValue: 'IDE path mode' })}
            value={
              draft.ideSettingsPath.trim()
                ? t('claudeExtensionPage.customPath', { defaultValue: 'Custom path' })
                : t('claudeExtensionPage.defaultUserPath', { defaultValue: 'Default user path' })
            }
          />
          <DetailRow
            label={t('claudeExtensionPage.effectiveIdePath', {
              defaultValue: 'Effective IDE path',
            })}
            value={effectiveIdePath ?? 'Unavailable'}
            mono
            copyValue={effectiveIdePath}
          />
          <DetailRow
            label={t('claudeExtensionPage.persistCommand', { defaultValue: 'Persist command' })}
            value={
              setup?.sharedSettings.command ??
              t('claudeExtensionPage.saveValidBindingFirst', {
                defaultValue: 'Save a valid binding first',
              })
            }
            mono
          />
          {draft.notes.trim() ? (
            <DetailRow label={t('settingsPage.thinkingSection.notes')} value={draft.notes.trim()} />
          ) : null}
        </CardContent>
      </Card>

      {/* Managed Payload card */}
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
          {/* Env badges preview */}
          <div className="flex flex-wrap gap-2">
            {envPreview.map((entry) => (
              <Badge key={entry.name} variant="secondary" className="font-mono text-[10px]">
                {entry.name}
              </Badge>
            ))}
            {hiddenEnvCount > 0 ? <Badge variant="outline">+{hiddenEnvCount} more</Badge> : null}
          </div>

          {/* Env count info block */}
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

          {/* Apply/Reset both — only when not in create mode */}
          {!creating ? (
            <div className="flex gap-2">
              <Button className="flex-1" onClick={onApplyAll} disabled={isApplyingAll}>
                {isApplyingAll ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                {t('claudeExtensionPage.applyBothTargets', {
                  defaultValue: 'Apply both targets',
                })}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={onResetAll}
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
  );
}
