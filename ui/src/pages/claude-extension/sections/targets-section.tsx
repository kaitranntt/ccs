/**
 * TargetsSection — Shared + IDE target status cards.
 *
 * Shows the current file state for both apply targets and provides
 * per-target apply/reset actions. Maps directly to the Overview tab
 * top grid in the original monolith.
 */
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type {
  ClaudeExtensionTargetStatus,
  ClaudeExtensionHostOption,
} from '@/hooks/use-claude-extension';
import { StatusBadge, DetailRow } from '../lib/claude-extension-ui-atoms';

// ---------------------------------------------------------------------------
// TargetStatusCard (private, used only within this section)
// ---------------------------------------------------------------------------

interface TargetStatusCardProps {
  title: string;
  description: string;
  status: ClaudeExtensionTargetStatus | undefined;
  applyLabel: string;
  resetLabel: string;
  onApply: () => void;
  onReset: () => void;
  disabled: boolean;
  busy: boolean;
}

function TargetStatusCard({
  title,
  description,
  status,
  applyLabel,
  resetLabel,
  onApply,
  onReset,
  disabled,
  busy,
}: TargetStatusCardProps) {
  return (
    <Card className="border-border/60 bg-card/80">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
          {status ? <StatusBadge state={status.state} /> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <DetailRow
            label="Path"
            value={status?.path ?? 'Save a binding first'}
            mono
            copyValue={status?.path}
          />
          <DetailRow
            label="File"
            value={status ? (status.exists ? 'Present' : 'Not created yet') : 'Unavailable'}
          />
        </div>

        <div className="rounded-lg border bg-muted/25 p-3 text-sm text-muted-foreground">
          {status?.message ??
            i18n.t('claudeExtensionPage.verifyAfterSaving', {
              defaultValue: 'Verify the binding after saving to inspect the current file state.',
            })}
        </div>

        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={onApply} disabled={disabled || busy}>
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {applyLabel}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={onReset}
            disabled={disabled || busy}
          >
            {resetLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// TargetsSection (public export)
// ---------------------------------------------------------------------------

interface TargetsSectionProps {
  sharedStatus: ClaudeExtensionTargetStatus | undefined;
  ideStatus: ClaudeExtensionTargetStatus | undefined;
  selectedHost: ClaudeExtensionHostOption | undefined;
  creating: boolean;
  isBusyShared: boolean;
  isBusyIde: boolean;
  onApplyShared: () => void;
  onResetShared: () => void;
  onApplyIde: () => void;
  onResetIde: () => void;
}

export function TargetsSection({
  sharedStatus,
  ideStatus,
  selectedHost,
  creating,
  isBusyShared,
  isBusyIde,
  onApplyShared,
  onResetShared,
  onApplyIde,
  onResetIde,
}: TargetsSectionProps) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <TargetStatusCard
        title={t('claudeExtensionPage.sharedClaudeSettings', {
          defaultValue: 'Shared Claude settings',
        })}
        description={t('claudeExtensionPage.sharedClaudeSettingsDescription', {
          defaultValue:
            'Writes the managed env block inside ~/.claude/settings.json so CLI and IDE behavior stay aligned.',
        })}
        status={sharedStatus}
        applyLabel={t('claudeExtensionPage.applyShared', { defaultValue: 'Apply shared' })}
        resetLabel={t('claudeExtensionPage.resetShared', { defaultValue: 'Reset shared' })}
        onApply={onApplyShared}
        onReset={onResetShared}
        disabled={creating}
        busy={isBusyShared}
      />

      <TargetStatusCard
        title={`${selectedHost?.label ?? 'IDE'} settings.json`}
        description="Writes only the Anthropic extension keys so unrelated editor preferences stay untouched."
        status={ideStatus}
        applyLabel={t('claudeExtensionPage.applyIde', { defaultValue: 'Apply IDE' })}
        resetLabel={t('claudeExtensionPage.resetIde', { defaultValue: 'Reset IDE' })}
        onApply={onApplyIde}
        onReset={onResetIde}
        disabled={creating}
        busy={isBusyIde}
      />
    </div>
  );
}
