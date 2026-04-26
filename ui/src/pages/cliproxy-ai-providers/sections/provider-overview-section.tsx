/**
 * Provider Overview Section — workspace presets, summary cards, missing-fields banner.
 */

import { Button } from '@/components/ui/button';
import { RotateCcw, Save } from 'lucide-react';
import type {
  AiProviderEntryView,
  AiProviderFamilyState,
} from '../../../../../src/cliproxy/ai-providers';
import type { EntryEditorDraft } from '../lib/ai-provider-utils';
import {
  getMappedModelCount,
  getDirectModelCount,
  renderModelRuleSummary,
  parseModelAliasLines,
} from '../lib/ai-provider-utils';
import { EntrySecretBadge, SummaryCard } from './provider-entry-primitives';
import { Badge } from '@/components/ui/badge';
import { getRoutingMode } from '../lib/ai-provider-utils';

interface ProviderOverviewSectionProps {
  family: AiProviderFamilyState;
  entry: AiProviderEntryView;
  draft: EntryEditorDraft;
  parsedModelRules: ReturnType<typeof parseModelAliasLines>;
  advancedRuleCount: number;
  hasChanges: boolean;
  isSaving: boolean;
  canSave: boolean;
  missingRequiredFields: string[];
  onReset: () => void;
  onDelete: () => void;
  onSave: () => void;
  onApplyPreset: (preset: 'minimal' | 'clean-routing') => void;
}

export function ProviderOverviewSection({
  family,
  entry,
  parsedModelRules,
  advancedRuleCount,
  hasChanges,
  isSaving,
  canSave,
  missingRequiredFields,
  onReset,
  onDelete,
  onSave,
  onApplyPreset,
}: ProviderOverviewSectionProps) {
  const mappedCount = getMappedModelCount(parsedModelRules);
  const directCount = getDirectModelCount(parsedModelRules);

  return (
    <div className="space-y-4">
      {/* Entry header: label + badges + action buttons */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-lg font-semibold">{entry.label}</h3>
            <EntrySecretBadge configured={entry.secretConfigured} />
            <Badge variant="outline" className="uppercase">
              {family.authMode}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="font-mono text-[11px]">
              {family.routePath}
            </Badge>
            <Badge variant="outline" className="text-[11px]">
              {getRoutingMode(entry)}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onReset}
            disabled={!hasChanges}
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            Reset
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onDelete}>
            <span className="mr-1 text-xs">✕</span>
            Remove
          </Button>
          <Button type="button" size="sm" onClick={onSave} disabled={!canSave || isSaving}>
            <Save className="mr-1 h-3.5 w-3.5" />
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Workspace presets */}
      <div className="rounded-xl border bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-sm font-medium">Workspace presets</div>
            <div className="text-sm text-muted-foreground">
              Keep the route lean by default, then layer routing only when this entry actually needs
              it.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onApplyPreset('minimal')}
            >
              Minimal setup
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onApplyPreset('clean-routing')}
            >
              Clear routing noise
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 2xl:grid-cols-3">
          <SummaryCard
            label="Secret"
            value={entry.secretConfigured ? 'Stored in CLIProxy' : 'Missing'}
            hint={entry.secretConfigured ? 'Rotate only when needed' : 'Required to save'}
          />
          <SummaryCard
            label="Model Rules"
            value={
              parsedModelRules.length > 0
                ? renderModelRuleSummary([
                    ...Array(mappedCount).fill({ name: 'x', alias: 'y' }),
                    ...Array(directCount).fill({ name: 'x', alias: '' }),
                  ])
                : 'No model rules'
            }
            hint="Requested model names stay direct unless remapped"
          />
          <SummaryCard
            label="Advanced"
            value={advancedRuleCount > 0 ? `${advancedRuleCount} active` : 'Optional'}
            hint="Proxy, prefix, headers, and exclusions"
          />
        </div>
      </div>

      {/* Missing required fields banner */}
      {missingRequiredFields.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
          Missing required fields:{' '}
          <span className="font-mono">{missingRequiredFields.join(', ')}</span>
        </div>
      ) : null}
    </div>
  );
}
