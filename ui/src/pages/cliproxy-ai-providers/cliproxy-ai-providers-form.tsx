/**
 * AiProviderForm — entry editor orchestrator.
 *
 * Composes:
 *  - useEntryEditor (all draft / validation state)
 *  - Config tab: ProviderOverviewSection + ProviderAuthSection + ProviderModelsSection + ProviderAdvancedRoutingSection
 *  - Info tab: ProviderInfoSection
 *  - Raw JSON pane: CodeEditor (editable, bidirectional) + settings.json preview + GlobalEnvIndicator
 *
 * Layout: two sub-panes side-by-side (config/info | raw json), matching the original EntryInspector grid.
 */

import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CodeEditor } from '@/components/shared/code-editor';
import { GlobalEnvIndicator } from '@/components/shared/global-env-indicator';
import { Code2, FileJson2, Info, SlidersHorizontal } from 'lucide-react';
import type {
  AiProviderEntryView,
  AiProviderFamilyState,
  AiProvidersSourceSummary,
} from '../../../../src/cliproxy/ai-providers';
import { STORED_SECRET_PLACEHOLDER } from './lib/ai-provider-utils';
import { useEntryEditor } from './hooks/use-entry-editor';
import { ProviderOverviewSection } from './sections/provider-overview-section';
import { ProviderAuthSection } from './sections/provider-auth-section';
import { ProviderModelsSection } from './sections/provider-models-section';
import { ProviderAdvancedRoutingSection } from './sections/provider-advanced-routing-section';
import { ProviderInfoSection } from './sections/provider-info-section';

interface AiProviderFormProps {
  family: AiProviderFamilyState;
  entry: AiProviderEntryView;
  source: AiProvidersSourceSummary;
  isSaving: boolean;
  onSave: (
    payload: ReturnType<ReturnType<typeof useEntryEditor>['getPayload']>
  ) => Promise<void> | void;
  onDelete: () => void;
}

export function AiProviderForm({
  family,
  entry,
  source,
  isSaving,
  onSave,
  onDelete,
}: AiProviderFormProps) {
  const editor = useEntryEditor(family, entry, source);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(360px,0.44fr)_minmax(0,0.56fr)] divide-x overflow-hidden rounded-b-xl border-x border-b bg-card">
      {/* ------------------------------------------------------------------ */}
      {/* Left sub-pane: Config / Info tabs                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="min-h-0 overflow-hidden bg-muted/5">
        <Tabs
          value={editor.configTab}
          onValueChange={editor.setConfigTab}
          className="flex h-full flex-col"
        >
          <div className="border-b bg-background px-4 pt-4">
            <ProviderOverviewSection
              family={family}
              entry={entry}
              draft={editor.draft}
              parsedModelRules={editor.parsedModelRules}
              advancedRuleCount={editor.advancedRuleCount}
              hasChanges={editor.hasChanges}
              isSaving={isSaving}
              canSave={editor.canSave}
              missingRequiredFields={editor.missingRequiredFields}
              onReset={editor.handleReset}
              onDelete={onDelete}
              onSave={() => void onSave(editor.getPayload())}
              onApplyPreset={editor.applyPreset}
            />

            <TabsList className="mt-3 grid w-full grid-cols-2">
              <TabsTrigger value="config" className="gap-2 text-xs">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Config
              </TabsTrigger>
              <TabsTrigger value="usage" className="gap-2 text-xs">
                <Info className="h-3.5 w-3.5" />
                Info &amp; Usage
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Config tab */}
          <TabsContent
            value="config"
            className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
          >
            <ScrollArea className="h-full">
              <div className="space-y-6 p-5">
                <ProviderAuthSection
                  family={family}
                  entry={entry}
                  draft={editor.draft}
                  updateDraft={editor.updateDraft}
                />
                <ProviderModelsSection
                  family={family}
                  draft={editor.draft}
                  parsedModelRules={editor.parsedModelRules}
                  modelRuleErrors={editor.modelRuleErrors}
                  updateDraft={editor.updateDraft}
                />
                <ProviderAdvancedRoutingSection
                  family={family}
                  draft={editor.draft}
                  advancedEnabled={editor.advancedEnabled}
                  advancedRuleCount={editor.advancedRuleCount}
                  updateDraft={editor.updateDraft}
                />
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Info & Usage tab */}
          <TabsContent
            value="usage"
            className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
          >
            <ScrollArea className="h-full">
              <ProviderInfoSection
                family={family}
                draft={editor.draft}
                parsedModelRules={editor.parsedModelRules}
              />
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Right sub-pane: Raw JSON / Settings preview                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="min-h-0 overflow-hidden">
        <Tabs
          value={editor.jsonTab}
          onValueChange={editor.setJsonTab}
          className="flex h-full flex-col"
        >
          <div className="border-b bg-background px-4 pt-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-medium">Raw configuration</div>
              <div className="text-xs text-muted-foreground">
                Target <span className="font-mono">{source.target}</span>
              </div>
            </div>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="raw" className="gap-2 text-xs">
                <Code2 className="h-3.5 w-3.5" />
                Raw Entry Config
              </TabsTrigger>
              <TabsTrigger value="preview" className="gap-2 text-xs">
                <FileJson2 className="h-3.5 w-3.5" />
                settings.json Preview
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Raw Entry Config tab — editable, bidirectional sync */}
          <TabsContent
            value="raw"
            className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
          >
            <div className="flex h-full flex-col">
              <div className="border-b bg-muted/10 px-6 py-3 text-sm text-muted-foreground">
                {entry.secretConfigured
                  ? `Stored secrets are shown as ${STORED_SECRET_PLACEHOLDER}. Replace the placeholder only when you want to rotate the secret.`
                  : 'Add secrets directly in the JSON or use the form on the left.'}
              </div>
              {editor.rawJsonError ? (
                <div className="mx-6 mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {editor.rawJsonError}
                </div>
              ) : null}
              <div className="min-h-0 flex-1 px-6 pb-4 pt-4">
                <div className="h-full overflow-hidden rounded-md border bg-background">
                  <CodeEditor
                    value={editor.rawJsonContent}
                    onChange={editor.handleRawJsonChange}
                    language="json"
                    minHeight="100%"
                    heightMode="fill-parent"
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* settings.json Preview tab — read-only derived view */}
          <TabsContent
            value="preview"
            className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
          >
            <div className="flex h-full flex-col">
              <div className="border-b bg-muted/10 px-6 py-3 text-sm text-muted-foreground">
                Derived preview for a CCS profile that points to this CLIProxy route. The route
                stays local; the upstream key remains managed here.
              </div>
              <div className="min-h-0 flex-1 px-6 pb-4 pt-4">
                <div className="h-full overflow-hidden rounded-md border bg-background">
                  <CodeEditor
                    value={editor.settingsPreviewContent}
                    onChange={() => {}}
                    language="json"
                    readonly
                    minHeight="100%"
                    heightMode="fill-parent"
                  />
                </div>
              </div>
              <div className="mx-6 mb-4 overflow-hidden rounded-md border">
                <GlobalEnvIndicator profileEnv={editor.settingsPreview.env} />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
