import { useMemo, useState } from 'react';
import {
  Info,
  KeyRound,
  RotateCcw,
  Route,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Workflow,
} from 'lucide-react';
import type {
  AiProviderEntryView,
  AiProviderFamilyState,
  AiProvidersSourceSummary,
} from '../../../../../src/cliproxy/ai-providers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getRequestedUpstreamModelRuleErrors } from '@/lib/provider-config';
import {
  type EntryEditorDraft,
  STORED_SECRET_PLACEHOLDER,
  buildEntryConfigRecord,
  buildEntryEditorDraft,
  buildEntryPayload,
  buildSettingsPreview,
  getDirectModelCount,
  getFamilyGuide,
  getMappedModelCount,
  getRoutingMode,
  parseDelimitedLines,
  parseEntryConfigDraft,
  parseKeyValueLines,
  parseModelAliasLines,
  renderModelRuleSummary,
} from './entry-editor-utils';
import { EntryInspectorRawPane } from './entry-inspector-raw-pane';
import {
  EntryEditorField,
  EntryEditorTextArea,
  EntrySecretBadge,
  SummaryCard,
} from './entry-primitives';

export function EntryInspector({
  family,
  entry,
  source,
  isSaving,
  onSave,
  onDelete,
}: {
  family: AiProviderFamilyState;
  entry: AiProviderEntryView;
  source: AiProvidersSourceSummary;
  isSaving: boolean;
  onSave: (payload: ReturnType<typeof buildEntryPayload>) => Promise<void> | void;
  onDelete: () => void;
}) {
  const guide = getFamilyGuide(family);
  const [draft, setDraft] = useState(() => buildEntryEditorDraft(entry));
  const [rawJsonEdits, setRawJsonEdits] = useState<string | null>(null);
  const [isRawJsonValid, setIsRawJsonValid] = useState(true);
  const [rawJsonError, setRawJsonError] = useState<string | null>(null);
  const [configTab, setConfigTab] = useState('config');
  const [jsonTab, setJsonTab] = useState('raw');

  const initialRawJsonContent = useMemo(
    () =>
      JSON.stringify(buildEntryConfigRecord(family, entry, buildEntryEditorDraft(entry)), null, 2),
    [entry, family]
  );
  const derivedRawJsonContent = useMemo(
    () => JSON.stringify(buildEntryConfigRecord(family, entry, draft), null, 2),
    [draft, entry, family]
  );
  const rawJsonContent = rawJsonEdits ?? derivedRawJsonContent;
  const settingsPreview = useMemo(
    () => buildSettingsPreview(family, draft, source),
    [draft, family, source]
  );
  const parsedModelRules = useMemo(
    () => parseModelAliasLines(draft.modelAliasesText),
    [draft.modelAliasesText]
  );
  const modelRuleErrors = useMemo(
    () => getRequestedUpstreamModelRuleErrors(draft.modelAliasesText),
    [draft.modelAliasesText]
  );
  const headerRules = useMemo(() => parseKeyValueLines(draft.headersText), [draft.headersText]);
  const excludedModelRules = useMemo(
    () => parseDelimitedLines(draft.excludedModelsText),
    [draft.excludedModelsText]
  );
  const settingsPreviewContent = useMemo(
    () => JSON.stringify(settingsPreview, null, 2),
    [settingsPreview]
  );
  const mappedModelCount = getMappedModelCount(parsedModelRules);
  const directModelCount = getDirectModelCount(parsedModelRules);
  const advancedRuleCount =
    headerRules.length +
    excludedModelRules.length +
    (draft.proxyUrl.trim() ? 1 : 0) +
    (draft.prefix.trim() ? 1 : 0);
  const advancedEnabled =
    family.id === 'openai-compatibility'
      ? draft.headersText.trim().length > 0
      : Boolean(
          draft.proxyUrl.trim() ||
          draft.prefix.trim() ||
          draft.headersText.trim() ||
          draft.excludedModelsText.trim()
        );
  const hasChanges =
    rawJsonEdits !== null
      ? rawJsonEdits !== initialRawJsonContent
      : derivedRawJsonContent !== initialRawJsonContent;
  const missingRequiredFields = useMemo(() => {
    if (family.id === 'openai-compatibility') {
      const missing: string[] = [];
      if (!draft.name.trim()) missing.push('name');
      if (!draft.baseUrl.trim()) missing.push('base-url');
      if (!entry.secretConfigured && parseDelimitedLines(draft.apiKeysText).length === 0) {
        missing.push('api-key-entries');
      }
      return missing;
    }
    if (!entry.secretConfigured && !draft.apiKey.trim()) {
      return ['api-key'];
    }
    return [];
  }, [
    draft.apiKey,
    draft.apiKeysText,
    draft.baseUrl,
    draft.name,
    entry.secretConfigured,
    family.id,
  ]);
  const canSave =
    isRawJsonValid &&
    missingRequiredFields.length === 0 &&
    modelRuleErrors.length === 0 &&
    hasChanges;

  const updateDraft = (updater: (current: EntryEditorDraft) => EntryEditorDraft) => {
    setDraft((current) => updater(current));
    setRawJsonEdits(null);
    setIsRawJsonValid(true);
    setRawJsonError(null);
  };

  const handleRawJsonChange = (value: string) => {
    setRawJsonEdits(value);
    try {
      const parsedDraft = parseEntryConfigDraft(family, entry, value);
      setDraft(parsedDraft);
      setIsRawJsonValid(true);
      setRawJsonError(null);
    } catch (error) {
      setIsRawJsonValid(false);
      setRawJsonError(error instanceof Error ? error.message : 'Invalid JSON');
    }
  };

  const handleReset = () => {
    setDraft(buildEntryEditorDraft(entry));
    setRawJsonEdits(null);
    setIsRawJsonValid(true);
    setRawJsonError(null);
  };

  const applyPreset = (preset: 'minimal' | 'clean-routing') => {
    updateDraft((current) => {
      if (preset === 'minimal') {
        return family.id === 'openai-compatibility'
          ? {
              ...current,
              headersText: '',
              modelAliasesText: '',
            }
          : {
              ...current,
              baseUrl: '',
              proxyUrl: '',
              prefix: '',
              headersText: '',
              excludedModelsText: '',
              modelAliasesText: '',
            };
      }

      return {
        ...current,
        proxyUrl: '',
        prefix: '',
        headersText: '',
        excludedModelsText: family.id === 'openai-compatibility' ? current.excludedModelsText : '',
      };
    });
  };

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(360px,0.44fr)_minmax(0,0.56fr)] divide-x overflow-hidden rounded-b-xl border-x border-b bg-card">
      <div className="min-h-0 overflow-hidden bg-muted/5">
        <Tabs value={configTab} onValueChange={setConfigTab} className="flex h-full flex-col">
          <div className="border-b bg-background px-4 pt-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
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
                  <Badge variant="outline" className="text-[11px]">
                    {source.label}
                  </Badge>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleReset}
                  disabled={!hasChanges}
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  Reset
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={onDelete}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Remove
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void onSave(buildEntryPayload(family, entry, draft))}
                  disabled={!canSave || isSaving}
                >
                  <Save className="mr-1 h-3.5 w-3.5" />
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="config" className="gap-2 text-xs">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Config
              </TabsTrigger>
              <TabsTrigger value="usage" className="gap-2 text-xs">
                <Info className="h-3.5 w-3.5" />
                Info & Usage
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="config"
            className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
          >
            <ScrollArea className="h-full">
              <div className="space-y-6 p-5">
                <div className="rounded-xl border bg-background p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-sm font-medium">Workspace presets</div>
                      <div className="text-sm text-muted-foreground">
                        Keep the route lean by default, then layer routing only when this entry
                        actually needs it.
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => applyPreset('minimal')}
                      >
                        Minimal setup
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => applyPreset('clean-routing')}
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
                          ? renderModelRuleSummary(parsedModelRules)
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

                {missingRequiredFields.length > 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
                    Missing required fields:{' '}
                    <span className="font-mono">{missingRequiredFields.join(', ')}</span>
                  </div>
                ) : null}

                <div className="rounded-xl border bg-background p-4">
                  <div className="mb-4 flex items-center gap-2 text-sm font-medium">
                    <KeyRound className="h-4 w-4 text-primary" />
                    Connection
                  </div>
                  <div className="grid gap-4 2xl:grid-cols-2">
                    {family.id === 'openai-compatibility' ? (
                      <EntryEditorField
                        label="Connector Name"
                        helper="This is the saved connector label shown in the entry switcher."
                      >
                        <Input
                          value={draft.name}
                          onChange={(event) =>
                            updateDraft((current) => ({ ...current, name: event.target.value }))
                          }
                          placeholder="openrouter"
                        />
                      </EntryEditorField>
                    ) : (
                      <EntryEditorField
                        label={`${family.displayName} API Key`}
                        helper={
                          entry.secretConfigured
                            ? `Leave blank to keep the stored secret. Enter a new value only to rotate it.`
                            : 'Required before this route can authenticate.'
                        }
                      >
                        <Input
                          type="password"
                          value={draft.apiKey}
                          onChange={(event) =>
                            updateDraft((current) => ({ ...current, apiKey: event.target.value }))
                          }
                          placeholder={
                            entry.secretConfigured
                              ? entry.apiKeyMasked || STORED_SECRET_PLACEHOLDER
                              : 'Paste provider API key'
                          }
                        />
                      </EntryEditorField>
                    )}

                    {family.id === 'openai-compatibility' ? (
                      <EntryEditorField
                        label="API Keys"
                        helper={
                          entry.secretConfigured
                            ? 'One key per line. Leave empty to preserve the stored connector keys.'
                            : 'Add one key per line. A connector needs at least one key.'
                        }
                      >
                        <EntryEditorTextArea
                          value={draft.apiKeysText}
                          onChange={(value) =>
                            updateDraft((current) => ({ ...current, apiKeysText: value }))
                          }
                          placeholder="sk-..."
                          rows={4}
                        />
                      </EntryEditorField>
                    ) : null}

                    <EntryEditorField
                      label="Base URL"
                      helper={
                        family.id === 'openai-compatibility'
                          ? 'Required for connectors. This is the upstream OpenAI-style endpoint.'
                          : 'Leave blank unless this route should target another upstream host.'
                      }
                    >
                      <Input
                        value={draft.baseUrl}
                        onChange={(event) =>
                          updateDraft((current) => ({ ...current, baseUrl: event.target.value }))
                        }
                        placeholder={
                          family.id === 'codex-api-key'
                            ? 'https://api.openai.com/v1'
                            : family.id === 'claude-api-key'
                              ? 'https://api.anthropic.com'
                              : family.id === 'openai-compatibility'
                                ? 'https://openrouter.ai/api/v1'
                                : 'https://provider.example.com'
                        }
                      />
                    </EntryEditorField>

                    {family.id !== 'openai-compatibility' ? (
                      <EntryEditorField
                        label="Proxy URL"
                        helper="Optional intermediary endpoint. Leave blank for direct routing."
                      >
                        <Input
                          value={draft.proxyUrl}
                          onChange={(event) =>
                            updateDraft((current) => ({ ...current, proxyUrl: event.target.value }))
                          }
                          placeholder="https://proxy.example.com/v1"
                        />
                      </EntryEditorField>
                    ) : null}

                    {family.id !== 'openai-compatibility' ? (
                      <EntryEditorField
                        label="Prefix"
                        helper="Optional model prefix rewrite for advanced routing only."
                      >
                        <Input
                          value={draft.prefix}
                          onChange={(event) =>
                            updateDraft((current) => ({ ...current, prefix: event.target.value }))
                          }
                          placeholder="provider/"
                        />
                      </EntryEditorField>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-xl border bg-background p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Workflow className="h-4 w-4 text-primary" />
                      Model rules
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {mappedModelCount > 0 ? (
                        <Badge variant="outline">{mappedModelCount} mapped</Badge>
                      ) : null}
                      {directModelCount > 0 ? (
                        <Badge variant="outline">{directModelCount} direct</Badge>
                      ) : null}
                      {parsedModelRules.length === 0 ? (
                        <Badge variant="outline">Optional</Badge>
                      ) : null}
                    </div>
                  </div>
                  <EntryEditorField
                    label="Requested [= Upstream]"
                    helper="Use requested=upstream for remaps. Use a plain model name when you want the route to expose that model directly."
                  >
                    <EntryEditorTextArea
                      value={draft.modelAliasesText}
                      onChange={(value) =>
                        updateDraft((current) => ({ ...current, modelAliasesText: value }))
                      }
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
                    <EntryEditorField
                      label="Headers"
                      helper="One header per line. Use only when the upstream expects org, project, or secondary auth headers."
                    >
                      <EntryEditorTextArea
                        value={draft.headersText}
                        onChange={(value) =>
                          updateDraft((current) => ({ ...current, headersText: value }))
                        }
                        placeholder="OpenAI-Organization: org_..."
                        rows={5}
                      />
                    </EntryEditorField>

                    {family.id !== 'openai-compatibility' ? (
                      <EntryEditorField
                        label="Excluded Models"
                        helper="One model ID per line. These models will be blocked for this entry."
                      >
                        <EntryEditorTextArea
                          value={draft.excludedModelsText}
                          onChange={(value) =>
                            updateDraft((current) => ({ ...current, excludedModelsText: value }))
                          }
                          placeholder="claude-opus-4-1"
                          rows={5}
                        />
                      </EntryEditorField>
                    ) : (
                      <div className="rounded-xl border border-dashed bg-muted/10 p-4 text-sm text-muted-foreground">
                        OpenAI-compatible connectors keep advanced routing lean. Add headers or
                        model mappings first before introducing extra route layers elsewhere.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent
            value="usage"
            className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
          >
            <ScrollArea className="h-full">
              <div className="space-y-4 p-5">
                <div className="rounded-xl border bg-background p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Route className="h-4 w-4 text-primary" />
                    How this route behaves
                  </div>
                  <div className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground">
                    <div className="rounded-lg border bg-muted/10 p-4">
                      Calls to <span className="font-mono">{family.routePath}</span> use this saved
                      entry inside CLIProxy.
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

                <div className="rounded-xl border bg-background p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Info className="h-4 w-4 text-primary" />
                    When API Profiles fits better
                  </div>
                  <div className="mt-3 text-sm leading-6 text-muted-foreground">
                    {guide.profileBoundary}
                  </div>
                </div>

                <div className="rounded-xl border bg-background p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Editing rule of thumb
                  </div>
                  <div className="mt-3 space-y-3">
                    {guide.editPrompts.map((item) => (
                      <div key={item.label} className="rounded-lg border bg-muted/10 p-4">
                        <div className="text-sm font-medium">{item.label}</div>
                        <div className="mt-1 text-sm leading-6 text-muted-foreground">
                          {item.hint}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>

      <EntryInspectorRawPane
        jsonTab={jsonTab}
        onJsonTabChange={setJsonTab}
        entry={entry}
        source={source}
        rawJsonError={rawJsonError}
        rawJsonContent={rawJsonContent}
        onRawJsonChange={handleRawJsonChange}
        settingsPreviewContent={settingsPreviewContent}
        settingsPreviewEnv={settingsPreview.env}
      />
    </div>
  );
}
