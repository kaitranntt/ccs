/**
 * AdvancedSection — Raw JSON payloads and target metadata.
 *
 * Renders the Advanced tab content: shared + IDE CodeBlockCards, resolved
 * environment payload, and shared/IDE target metadata cards.
 * Shows a placeholder card when setup data is not yet available.
 */
import { Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import type {
  ClaudeExtensionSetupPayload,
  ClaudeExtensionTargetStatus,
  ClaudeExtensionHostOption,
} from '@/hooks/use-claude-extension';
import { CodeBlockCard, DetailRow } from '../lib/claude-extension-ui-atoms';
import type { BindingDraft } from '../lib/claude-extension-draft-utils';

interface AdvancedSectionProps {
  setup: ClaudeExtensionSetupPayload | undefined;
  sharedStatus: ClaudeExtensionTargetStatus | undefined;
  ideStatus: ClaudeExtensionTargetStatus | undefined;
  selectedHost: ClaudeExtensionHostOption | undefined;
  draft: BindingDraft;
}

export function AdvancedSection({
  setup,
  sharedStatus,
  ideStatus,
  selectedHost,
  draft,
}: AdvancedSectionProps) {
  const { t } = useTranslation();

  if (!setup) {
    return (
      <Card className="border-border/60 bg-card/80">
        <CardContent className="flex min-h-[240px] items-center justify-center gap-3 text-sm text-muted-foreground">
          <Settings2 className="h-5 w-5" />
          Choose a profile and IDE host to preview the generated payload.
        </CardContent>
      </Card>
    );
  }

  // IDE target path resolution order: verified status → draft override → host default → setup
  const ideTargetPath =
    (ideStatus?.path ?? draft.ideSettingsPath.trim()) ||
    selectedHost?.defaultSettingsPath ||
    setup.ideSettings.path;

  return (
    <div className="space-y-6">
      {/* JSON payload cards */}
      <div className="grid gap-6 xl:grid-cols-2">
        <CodeBlockCard
          title={t('claudeExtensionPage.sharedSettingsJson', {
            defaultValue: 'Shared Claude settings JSON',
          })}
          description={t('claudeExtensionPage.sharedSettingsJsonDescription', {
            defaultValue: 'Managed env block for ~/.claude/settings.json.',
          })}
          value={setup.sharedSettings.json}
        />
        <CodeBlockCard
          title={`${selectedHost?.label ?? 'IDE'} settings JSON`}
          description={t('claudeExtensionPage.ideSettingsJsonDescription', {
            label: selectedHost?.settingsTargetLabel ?? 'settings.json',
            defaultValue: 'Anthropic extension snippet for {{label}}.',
          })}
          value={setup.ideSettings.json}
        />
      </div>

      {/* Resolved environment payload */}
      <Card className="border-border/60 bg-card/80">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">
                {t('claudeExtensionPage.resolvedEnvironmentPayload', {
                  defaultValue: 'Resolved environment payload',
                })}
              </CardTitle>
              <CardDescription>
                {t('claudeExtensionPage.resolvedEnvironmentPayloadDescription', {
                  defaultValue:
                    'Exact environment values that the extension receives after CCS expands this profile.',
                })}
              </CardDescription>
            </div>
            <CopyButton
              value={JSON.stringify(setup.env, null, 2)}
              label={t('claudeExtensionPage.copyEnvironmentPayload', {
                defaultValue: 'Copy environment payload',
              })}
            />
          </div>
        </CardHeader>
        <CardContent>
          {setup.env.length > 0 ? (
            <pre className="max-h-[420px] overflow-auto rounded-lg border bg-muted/30 p-4 text-xs leading-6">
              {JSON.stringify(setup.env, null, 2)}
            </pre>
          ) : (
            <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
              No env payload. This binding resolves to native Claude defaults.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Target metadata cards */}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-border/60 bg-card/80">
          <CardHeader>
            <CardTitle className="text-base">Shared target metadata</CardTitle>
            <CardDescription>
              Useful when debugging drift or comparing with manual edits.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow
              label="Target path"
              value={sharedStatus?.path ?? setup.sharedSettings.path}
              mono
              copyValue={sharedStatus?.path ?? setup.sharedSettings.path}
            />
            <DetailRow label="Command" value={setup.sharedSettings.command} mono />
            <DetailRow label="Current state" value={sharedStatus?.state ?? 'Not verified'} />
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/80">
          <CardHeader>
            <CardTitle className="text-base">IDE target metadata</CardTitle>
            <CardDescription>
              Current file path plus the extension setting key used for this host.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Target path" value={ideTargetPath} mono copyValue={ideTargetPath} />
            <DetailRow label="Settings key" value={selectedHost?.settingsKey ?? 'Unknown'} mono />
            <DetailRow label="Current state" value={ideStatus?.state ?? 'Not verified'} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
