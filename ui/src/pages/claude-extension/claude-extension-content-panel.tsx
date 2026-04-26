/**
 * ClaudeExtensionContentPanel — Right-panel main content area.
 *
 * Renders the content header (badges, heading, verify + copy actions),
 * the error banner, and the Overview / Advanced tabs. Composes the
 * individual section components. Pure presentational — all state and
 * callbacks come from the parent index.
 */
import { Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  ClaudeExtensionBinding,
  ClaudeExtensionSetupPayload,
  ClaudeExtensionTargetStatus,
  ClaudeExtensionHostOption,
  ClaudeExtensionProfileOption,
} from '@/hooks/use-claude-extension';
import { ErrorBanner } from './lib/claude-extension-ui-atoms';
import type { BindingDraft } from './lib/claude-extension-draft-utils';
import { TargetsSection } from './sections/targets-section';
import { ResolvedBindingSection } from './sections/resolved-binding-section';
import { DiagnosticsSection } from './sections/diagnostics-section';
import { AdvancedSection } from './sections/advanced-section';

interface ClaudeExtensionContentPanelProps {
  // Identity
  selectedBinding: ClaudeExtensionBinding | null;
  selectedProfile: ClaudeExtensionProfileOption | undefined;
  selectedHost: ClaudeExtensionHostOption | undefined;
  creating: boolean;
  draft: BindingDraft;

  // Data
  setup: ClaudeExtensionSetupPayload | undefined;
  sharedStatus: ClaudeExtensionTargetStatus | undefined;
  ideStatus: ClaudeExtensionTargetStatus | undefined;
  activeError: Error | null;

  // Verify action
  isVerifying: boolean;
  onVerify: () => void;

  // Target actions
  isBusyShared: boolean;
  isBusyIde: boolean;
  isApplyingAll: boolean;
  isResettingAll: boolean;
  onApplyShared: () => void;
  onResetShared: () => void;
  onApplyIde: () => void;
  onResetIde: () => void;
  onApplyAll: () => void;
  onResetAll: () => void;
}

/** Returns true when both targets are in the 'applied' state. */
function isBothInSync(
  shared: ClaudeExtensionTargetStatus | undefined,
  ide: ClaudeExtensionTargetStatus | undefined
): boolean {
  return shared?.state === 'applied' && ide?.state === 'applied';
}

export function ClaudeExtensionContentPanel({
  selectedBinding,
  selectedProfile,
  selectedHost,
  creating,
  draft,
  setup,
  sharedStatus,
  ideStatus,
  activeError,
  isVerifying,
  onVerify,
  isBusyShared,
  isBusyIde,
  isApplyingAll,
  isResettingAll,
  onApplyShared,
  onResetShared,
  onApplyIde,
  onResetIde,
  onApplyAll,
  onResetAll,
}: ClaudeExtensionContentPanelProps) {
  const { t } = useTranslation();
  const inSync = isBothInSync(sharedStatus, ideStatus);

  return (
    <div className="min-w-0 flex-1">
      <ScrollArea className="h-full">
        <div className="w-full space-y-6 p-6 xl:p-7 2xl:p-8">
          {/* Content header */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {selectedProfile ? <Badge variant="outline">{selectedProfile.label}</Badge> : null}
                {selectedHost ? <Badge variant="outline">{selectedHost.label}</Badge> : null}
                {creating ? (
                  <Badge variant="secondary">{t('settingsPage.thinkingSection.draft')}</Badge>
                ) : null}
                {!creating && inSync ? (
                  <Badge className="bg-emerald-600 hover:bg-emerald-600">
                    {t('settingsPage.thinkingSection.inSync')}
                  </Badge>
                ) : null}
              </div>
              <div className="max-w-5xl">
                <h2 className="text-2xl font-semibold tracking-tight">
                  {selectedBinding?.name ??
                    t('claudeExtensionPage.defaultBindingName', {
                      defaultValue: 'Claude extension binding',
                    })}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('claudeExtensionPage.bindingDescription', {
                    defaultValue:
                      'Manage the shared Claude settings file and the IDE-local settings file as two scoped targets.',
                  })}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={onVerify} disabled={creating || isVerifying}>
                {isVerifying ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                )}
                {t('claudeExtensionPage.verify', { defaultValue: 'Verify' })}
              </Button>
              {setup ? (
                <CopyButton value={setup.sharedSettings.command} label="Copy persist command" />
              ) : null}
            </div>
          </div>

          {/* Error banner — replaces tabs when any query errors */}
          {activeError ? <ErrorBanner error={activeError} /> : null}

          {/* Tabs — hidden entirely when there's an active error */}
          {!activeError ? (
            <Tabs defaultValue="overview" className="flex flex-col gap-6">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="overview">
                  {t('claudeExtensionPage.overview', { defaultValue: 'Overview' })}
                </TabsTrigger>{' '}
                <TabsTrigger value="advanced">
                  {t('settingsPage.thinkingSection.advanced')}
                </TabsTrigger>
              </TabsList>

              {/* Overview tab */}
              <TabsContent value="overview" className="mt-0 space-y-6">
                <TargetsSection
                  sharedStatus={sharedStatus}
                  ideStatus={ideStatus}
                  selectedHost={selectedHost}
                  creating={creating}
                  isBusyShared={isBusyShared}
                  isBusyIde={isBusyIde}
                  onApplyShared={onApplyShared}
                  onResetShared={onResetShared}
                  onApplyIde={onApplyIde}
                  onResetIde={onResetIde}
                />

                <ResolvedBindingSection
                  setup={setup}
                  ideStatus={ideStatus}
                  draft={draft}
                  selectedHost={selectedHost}
                  creating={creating}
                  isApplyingAll={isApplyingAll}
                  isResettingAll={isResettingAll}
                  onApplyAll={onApplyAll}
                  onResetAll={onResetAll}
                />

                {setup && (setup.warnings.length > 0 || setup.notes.length > 0) ? (
                  <DiagnosticsSection setup={setup} />
                ) : null}
              </TabsContent>

              {/* Advanced tab */}
              <TabsContent value="advanced" className="mt-0 space-y-6">
                <AdvancedSection
                  setup={setup}
                  sharedStatus={sharedStatus}
                  ideStatus={ideStatus}
                  selectedHost={selectedHost}
                  draft={draft}
                />
              </TabsContent>
            </Tabs>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
