/**
 * Provider Advanced Routing Section — headers textarea + excluded models textarea.
 */

import { Badge } from '@/components/ui/badge';
import { SlidersHorizontal } from 'lucide-react';
import type { AiProviderFamilyState } from '../../../../../src/cliproxy/ai-providers';
import type { EntryEditorDraft } from '../lib/ai-provider-utils';
import { EntryEditorField, EntryEditorTextArea } from './provider-entry-primitives';

interface ProviderAdvancedRoutingSectionProps {
  family: AiProviderFamilyState;
  draft: EntryEditorDraft;
  advancedEnabled: boolean;
  advancedRuleCount: number;
  updateDraft: (updater: (current: EntryEditorDraft) => EntryEditorDraft) => void;
}

export function ProviderAdvancedRoutingSection({
  family,
  draft,
  advancedEnabled,
  advancedRuleCount,
  updateDraft,
}: ProviderAdvancedRoutingSectionProps) {
  const isConnector = family.id === 'openai-compatibility';

  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          Advanced routing
        </div>
        <Badge variant="outline">
          {advancedEnabled ? `${advancedRuleCount} active` : 'Optional'}
        </Badge>
      </div>

      <div className="grid gap-4 2xl:grid-cols-2">
        {/* Headers — all families */}
        <EntryEditorField
          label="Headers"
          helper="One header per line. Use only when the upstream expects org, project, or secondary auth headers."
        >
          <EntryEditorTextArea
            value={draft.headersText}
            onChange={(value) => updateDraft((c) => ({ ...c, headersText: value }))}
            placeholder="OpenAI-Organization: org_..."
            rows={5}
          />
        </EntryEditorField>

        {/* Excluded models — non-connector families only */}
        {!isConnector ? (
          <EntryEditorField
            label="Excluded Models"
            helper="One model ID per line. These models will be blocked for this entry."
          >
            <EntryEditorTextArea
              value={draft.excludedModelsText}
              onChange={(value) => updateDraft((c) => ({ ...c, excludedModelsText: value }))}
              placeholder="claude-opus-4-1"
              rows={5}
            />
          </EntryEditorField>
        ) : (
          <div className="rounded-xl border border-dashed bg-muted/10 p-4 text-sm text-muted-foreground">
            OpenAI-compatible connectors keep advanced routing lean. Add headers or model mappings
            first before introducing extra route layers elsewhere.
          </div>
        )}
      </div>
    </div>
  );
}
