/**
 * Provider Info & Usage Section — route behavior, profile boundary, edit prompts.
 * Rendered in the "Info & Usage" tab of the entry editor.
 */

import { Info, Route, ShieldCheck } from 'lucide-react';
import type { AiProviderFamilyState } from '../../../../../src/cliproxy/ai-providers';
import type { EntryEditorDraft } from '../lib/ai-provider-utils';
import {
  getFamilyGuide,
  parseModelAliasLines,
  renderModelRuleSummary,
} from '../lib/ai-provider-utils';

interface ProviderInfoSectionProps {
  family: AiProviderFamilyState;
  draft: EntryEditorDraft;
  parsedModelRules: ReturnType<typeof parseModelAliasLines>;
}

export function ProviderInfoSection({ family, draft, parsedModelRules }: ProviderInfoSectionProps) {
  const guide = getFamilyGuide(family);

  return (
    <div className="space-y-4 p-5">
      {/* How this route behaves */}
      <div className="rounded-xl border bg-background p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Route className="h-4 w-4 text-primary" />
          How this route behaves
        </div>
        <div className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground">
          <div className="rounded-lg border bg-muted/10 p-4">
            Calls to <span className="font-mono">{family.routePath}</span> use this saved entry
            inside CLIProxy.
          </div>
          <div className="rounded-lg border bg-muted/10 p-4">
            {draft.baseUrl.trim()
              ? `Traffic resolves to ${draft.baseUrl.trim()} unless you layer another proxy in front.`
              : 'Traffic keeps the family default upstream unless you add a custom base URL.'}
          </div>
          <div className="rounded-lg border bg-muted/10 p-4">
            {parsedModelRules.length > 0
              ? `${renderModelRuleSummary(parsedModelRules)} rule${parsedModelRules.length === 1 ? '' : 's'} active for this entry.`
              : 'Requested model names pass through unchanged until you add explicit model rules.'}
          </div>
        </div>
      </div>

      {/* When API Profiles fits better */}
      <div className="rounded-xl border bg-background p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Info className="h-4 w-4 text-primary" />
          When API Profiles fits better
        </div>
        <div className="mt-3 text-sm leading-6 text-muted-foreground">{guide.profileBoundary}</div>
      </div>

      {/* Editing rule of thumb */}
      <div className="rounded-xl border bg-background p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Editing rule of thumb
        </div>
        <div className="mt-3 space-y-3">
          {guide.editPrompts.map((item) => (
            <div key={item.label} className="rounded-lg border bg-muted/10 p-4">
              <div className="text-sm font-medium">{item.label}</div>
              <div className="mt-1 text-sm leading-6 text-muted-foreground">{item.hint}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
