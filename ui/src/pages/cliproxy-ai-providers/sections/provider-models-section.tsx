/**
 * Provider Models Section — model alias rules textarea + validation errors.
 */

import { Badge } from '@/components/ui/badge';
import { Workflow } from 'lucide-react';
import type { AiProviderFamilyState } from '../../../../../src/cliproxy/ai-providers';
import type { EntryEditorDraft } from '../lib/ai-provider-utils';
import {
  getMappedModelCount,
  getDirectModelCount,
  parseModelAliasLines,
} from '../lib/ai-provider-utils';
import { EntryEditorField, EntryEditorTextArea } from './provider-entry-primitives';

interface ProviderModelsSectionProps {
  family: AiProviderFamilyState;
  draft: EntryEditorDraft;
  parsedModelRules: ReturnType<typeof parseModelAliasLines>;
  modelRuleErrors: string[];
  updateDraft: (updater: (current: EntryEditorDraft) => EntryEditorDraft) => void;
}

export function ProviderModelsSection({
  draft,
  parsedModelRules,
  modelRuleErrors,
  updateDraft,
}: ProviderModelsSectionProps) {
  const mappedCount = getMappedModelCount(parsedModelRules);
  const directCount = getDirectModelCount(parsedModelRules);

  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Workflow className="h-4 w-4 text-primary" />
          Model rules
        </div>
        <div className="flex flex-wrap gap-2">
          {mappedCount > 0 ? <Badge variant="outline">{mappedCount} mapped</Badge> : null}
          {directCount > 0 ? <Badge variant="outline">{directCount} direct</Badge> : null}
          {parsedModelRules.length === 0 ? <Badge variant="outline">Optional</Badge> : null}
        </div>
      </div>

      <EntryEditorField
        label="Requested [= Upstream]"
        helper="Use requested=upstream for remaps. Use a plain model name when you want the route to expose that model directly."
      >
        <EntryEditorTextArea
          value={draft.modelAliasesText}
          onChange={(value) => updateDraft((c) => ({ ...c, modelAliasesText: value }))}
          placeholder={'claude-sonnet-4-5=gpt-5\nglm-5'}
          rows={6}
        />
      </EntryEditorField>

      {modelRuleErrors.length > 0 ? (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {modelRuleErrors[0]}
        </div>
      ) : null}
    </div>
  );
}
