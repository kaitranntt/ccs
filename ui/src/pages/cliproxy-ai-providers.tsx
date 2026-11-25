import { lazy, Suspense, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type {
  AiProviderEntryView,
  AiProviderFamilyId,
  AiProviderFamilyState,
  AiProvidersSourceSummary,
} from '../../../src/cliproxy/ai-providers';
import { ProviderLogo } from '@/components/cliproxy/provider-logo';
import { ProxyStatusWidget } from '@/components/monitoring/proxy-status-widget';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { GlobalEnvIndicator } from '@/components/shared/global-env-indicator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  formatRequestedUpstreamModelRules,
  getAiProviderFamilyVisual,
  getRequestedUpstreamModelRuleErrors,
  getRequestedModelId,
  parseRequestedUpstreamModelRules,
} from '@/lib/provider-config';
import { cn } from '@/lib/utils';
import { FamilyRail, ProviderEntryDialog } from '@/components/cliproxy/ai-providers';
import {
  useCliproxyAiProviders,
  useCreateCliproxyAiProviderEntry,
  useDeleteCliproxyAiProviderEntry,
  useUpdateCliproxyAiProviderEntry,
} from '@/hooks/use-cliproxy-ai-providers';
import {
  AlertCircle,
  Check,
  Code2,
  ExternalLink,
  FileJson2,
  Info,
  KeyRound,
  ListFilter,
  Plus,
  RefreshCw,
  RotateCcw,
  Route,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Workflow,
  Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

const CodeEditor = lazy(() =>
  import('@/components/shared/code-editor').then((m) => ({ default: m.CodeEditor }))
);

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 break-all text-sm font-medium leading-5">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function getFamilyStatusBadge(status: 'empty' | 'partial' | 'ready') {
  switch (status) {
    case 'ready':
      return {
        label: 'Ready',
        className: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-50',
      };
    case 'partial':
      return {
        label: 'Needs attention',
        className: 'bg-amber-50 text-amber-700 hover:bg-amber-50',
      };
    default:
      return {
        label: 'Empty',
        className: 'bg-muted text-muted-foreground hover:bg-muted',
      };
  }
}

function getRoutingMode(entry: AiProviderEntryView) {
  if (entry.proxyUrl) return 'Proxy override';
  if (entry.prefix) return 'Prefixed route';
  if (entry.baseUrl) return 'Direct upstream';
  return 'Default runtime';
}

function getMappedModelCount(models: Array<{ name: string; alias: string }>) {
  return models.filter((item) => item.alias.trim().length > 0).length;
}

function getDirectModelCount(models: Array<{ name: string; alias: string }>) {
  return models.filter((item) => item.name.trim().length > 0 && item.alias.trim().length === 0)
    .length;
}

function renderModelRuleSummary(models: Array<{ name: string; alias: string }>) {
  const mappedCount = getMappedModelCount(models);
  const directCount = getDirectModelCount(models);
  const parts: string[] = [];

  if (mappedCount > 0) {
    parts.push(`${mappedCount} mapped`);
  }
  if (directCount > 0) {
    parts.push(`${directCount} direct`);
  }

  return parts.length > 0 ? parts.join(' + ') : 'No model rules';
}

function EntrySecretBadge({ configured }: { configured: boolean }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        'border-transparent text-[10px]',
        configured
          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-50'
          : 'bg-muted text-muted-foreground hover:bg-muted'
      )}
    >
      {configured ? 'Configured' : 'Missing secret'}
    </Badge>
  );
}

const STORED_SECRET_PLACEHOLDER = '<stored in CLIProxy>';

type EntryEditorDraft = {
  name: string;
  baseUrl: string;
  proxyUrl: string;
  prefix: string;
  headersText: string;
  excludedModelsText: string;
  modelAliasesText: string;
  apiKey: string;
  apiKeysText: string;
};

type FamilyGuide = {
  requiredNow: string[];
  optionalLater: string[];
  emptyStateSummary: string[];
  profileBoundary: string;
  editPrompts: Array<{ label: string; hint: string }>;
};

function getFamilyGuide(family: AiProviderFamilyState): FamilyGuide {
  switch (family.id) {
    case 'gemini-api-key':
      return {
        requiredNow: [
          'Save the Gemini API key.',
          'Leave Base URL blank unless you use a custom Gemini gateway.',
          'Add model mappings only when Gemini model names differ from the requested ones.',
        ],
        optionalLater: [
          'Headers for provider-specific project routing.',
          'Base URL override for a proxy or regional endpoint.',
          'Mappings such as claude-sonnet-4-5 -> gemini-2.5-pro.',
        ],
        emptyStateSummary: [
          `Requests to ${family.routePath} use CLIProxy-managed Gemini credentials.`,
          'The default upstream is enough for most Gemini setups.',
          'Model mappings and headers are optional, not step one.',
        ],
        profileBoundary:
          'Use API Profiles when you want a CCS-native Anthropic-compatible profile instead of this CLIProxy-managed Gemini route.',
        editPrompts: [
          {
            label: 'Base URL',
            hint: 'Change it only for a custom Gemini gateway or regional endpoint.',
          },
          {
            label: 'Model mappings',
            hint: 'Add them only when requested names and Gemini names differ.',
          },
          {
            label: 'Headers',
            hint: 'Keep them empty unless the provider requires project or org routing.',
          },
        ],
      };
    case 'codex-api-key':
      return {
        requiredNow: [
          'Save the Codex or OpenAI API key.',
          'Leave Base URL blank unless this route should hit a different OpenAI-style host.',
          'Add mappings only when the upstream model name differs from what CCS requests.',
        ],
        optionalLater: [
          'Base URL override for a gateway, proxy, or self-hosted endpoint.',
          'Headers for org or project routing.',
          'Mappings such as claude-sonnet-4-5 -> gpt-5.',
        ],
        emptyStateSummary: [
          `Requests to ${family.routePath} use CLIProxy-managed Codex credentials.`,
          'Most setups can keep the default upstream and skip extra routing.',
          'Mappings are only needed when the upstream model naming does not match the requested one.',
        ],
        profileBoundary:
          'Use API Profiles when you want a CCS-native Anthropic-compatible profile rather than this CLIProxy-managed Codex route.',
        editPrompts: [
          {
            label: 'Base URL',
            hint: 'Change it only when Codex should resolve through another OpenAI-style endpoint.',
          },
          {
            label: 'Model mappings',
            hint: 'Map requested model names to the exact upstream model ID only when needed.',
          },
          { label: 'Headers', hint: 'Use headers sparingly for project routing or extra auth.' },
        ],
      };
    case 'claude-api-key':
      return {
        requiredNow: [
          'Save the Anthropic or compatible API key.',
          'Leave Base URL blank unless this route should point at a custom Claude-compatible endpoint.',
          'Add mappings only when the upstream model ID differs from the requested Claude model name.',
        ],
        optionalLater: [
          'Prefix or proxy overrides for advanced route rewriting.',
          'Excluded models when a route should block specific model IDs.',
          'Headers for project-scoped routing.',
        ],
        emptyStateSummary: [
          `Requests to ${family.routePath} use a CLIProxy-managed Claude-compatible key.`,
          'Base URL, proxy, and prefix rewrites are advanced options, not the minimum setup.',
          'Most users can start with a key only, then add mappings or filters if routing needs it.',
        ],
        profileBoundary:
          'Use API Profiles when you want a CCS-native Anthropic-compatible profile or preset instead of this CLIProxy-managed Claude route.',
        editPrompts: [
          {
            label: 'Base URL',
            hint: 'Change it only when Claude traffic should target another compatible endpoint.',
          },
          {
            label: 'Mappings',
            hint: 'Add them only when the requested Claude model name should route to a different upstream ID.',
          },
          {
            label: 'Advanced routing',
            hint: 'Proxy, prefix, headers, and exclusions are for edge cases. Leave them blank when unsure.',
          },
        ],
      };
    case 'vertex-api-key':
      return {
        requiredNow: [
          'Save the Vertex API key.',
          'Leave Base URL blank unless a regional or gateway endpoint is required.',
          'Add mappings only when the upstream model name differs from the requested name.',
        ],
        optionalLater: [
          'Base URL override for a regional gateway.',
          'Headers for provider-specific routing.',
          'Mappings for translating requested names to Vertex model IDs.',
        ],
        emptyStateSummary: [
          `Requests to ${family.routePath} use CLIProxy-managed Vertex credentials.`,
          'Most setups start with the key only and keep the default endpoint.',
          'Mappings and headers are optional follow-up steps.',
        ],
        profileBoundary:
          'Use API Profiles when you need a CCS-native Anthropic-compatible profile rather than this CLIProxy-managed Vertex route.',
        editPrompts: [
          {
            label: 'Base URL',
            hint: 'Use it only for a regional gateway or managed Vertex endpoint.',
          },
          {
            label: 'Model mappings',
            hint: 'Add them only when the requested names need translating upstream.',
          },
          {
            label: 'Headers',
            hint: 'Keep them empty unless the provider requires extra routing context.',
          },
        ],
      };
    case 'openai-compatibility':
      return {
        requiredNow: [
          'Name the connector, for example openrouter or together.',
          'Set the connector Base URL.',
          'Add at least one API key before saving.',
        ],
        optionalLater: [
          'Headers for provider-specific auth or project routing.',
          'Model mappings such as claude-sonnet-4-5 -> gpt-4.1.',
          'Additional API keys for the same connector.',
        ],
        emptyStateSummary: [
          `Requests to ${family.routePath} resolve through a named OpenAI-compatible connector.`,
          'This flow needs a connector name, a Base URL, and one or more API keys.',
          'Headers and mappings come after the connector is already working.',
        ],
        profileBoundary:
          'Use API Profiles when you want a CCS-native Anthropic-compatible profile, preset, or provider outside the CLIProxy connector flow.',
        editPrompts: [
          {
            label: 'Connector identity',
            hint: 'Keep the connector name and Base URL stable once clients depend on it.',
          },
          {
            label: 'Model mappings',
            hint: 'Only add them when the connector expects a different upstream model ID.',
          },
          {
            label: 'Headers',
            hint: 'Use them for provider-specific auth or project routing, not as a default.',
          },
        ],
      };
  }
}

function parseDelimitedLines(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseKeyValueLines(value: string): Array<{ key: string; value: string }> {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const separator = line.includes(':') ? ':' : '=';
      const [key, ...rest] = line.split(separator);
      return { key: key.trim(), value: rest.join(separator).trim() };
    })
    .filter((item) => item.key.length > 0);
}

function parseModelAliasLines(value: string) {
  return parseRequestedUpstreamModelRules(value);
}

function formatHeaders(entry?: AiProviderEntryView | null): string {
  return (entry?.headers || []).map((item) => `${item.key}: ${item.value}`).join('\n');
}

function formatExcludedModels(entry?: AiProviderEntryView | null): string {
  return (entry?.excludedModels || []).join('\n');
}

function formatModelAliases(entry?: AiProviderEntryView | null): string {
  return formatRequestedUpstreamModelRules(entry?.models);
}

function buildEntryEditorDraft(entry: AiProviderEntryView): EntryEditorDraft {
  return {
    name: entry.name || '',
    baseUrl: entry.baseUrl || '',
    proxyUrl: entry.proxyUrl || '',
    prefix: entry.prefix || '',
    headersText: formatHeaders(entry),
    excludedModelsText: formatExcludedModels(entry),
    modelAliasesText: formatModelAliases(entry),
    apiKey: '',
    apiKeysText: '',
  };
}

function buildHeaderRecord(value: string) {
  const parsed = parseKeyValueLines(value);
  if (parsed.length === 0) return undefined;
  return Object.fromEntries(parsed.map((item) => [item.key, item.value]));
}

function buildRawConfigModelArray(value: string) {
  const parsed = parseModelAliasLines(value).map((item) =>
    item.alias.trim() ? { name: item.name, alias: item.alias } : { name: item.name }
  );
  return parsed.length > 0 ? parsed : undefined;
}

function formatRawConfigModelArray(value: unknown): string {
  return Array.isArray(value)
    ? formatRequestedUpstreamModelRules(value as Array<{ name?: string; alias?: string }>)
    : '';
}

function buildExcludedModelsArray(value: string) {
  const parsed = parseDelimitedLines(value);
  return parsed.length > 0 ? parsed : undefined;
}

function buildEntryConfigRecord(
  family: AiProviderFamilyState,
  entry: AiProviderEntryView,
  draft: EntryEditorDraft
) {
  const headers = buildHeaderRecord(draft.headersText);
  const models = buildRawConfigModelArray(draft.modelAliasesText);
  const excludedModels = buildExcludedModelsArray(draft.excludedModelsText);
  const secretValue =
    draft.apiKey.trim() || (entry.secretConfigured ? STORED_SECRET_PLACEHOLDER : '');

  if (family.id === 'openai-compatibility') {
    const apiKeys = parseDelimitedLines(draft.apiKeysText);
    const existingKeyCount = entry.apiKeysMasked?.length || 1;

    return {
      name: draft.name.trim() || entry.name || 'connector',
      'base-url': draft.baseUrl.trim(),
      ...(headers ? { headers } : {}),
      'api-key-entries':
        apiKeys.length > 0
          ? apiKeys.map((value) => ({ 'api-key': value }))
          : entry.secretConfigured
            ? Array.from({ length: existingKeyCount }, () => ({
                'api-key': STORED_SECRET_PLACEHOLDER,
              }))
            : [],
      ...(models ? { models } : {}),
    };
  }

  return {
    'api-key': secretValue,
    ...(draft.baseUrl.trim() ? { 'base-url': draft.baseUrl.trim() } : {}),
    ...(draft.proxyUrl.trim() ? { 'proxy-url': draft.proxyUrl.trim() } : {}),
    ...(draft.prefix.trim() ? { prefix: draft.prefix.trim() } : {}),
    ...(headers ? { headers } : {}),
    ...(excludedModels ? { 'excluded-models': excludedModels } : {}),
    ...(models ? { models } : {}),
  };
}

function parseEntryConfigDraft(
  family: AiProviderFamilyState,
  entry: AiProviderEntryView,
  rawValue: string
): EntryEditorDraft {
  const parsed = JSON.parse(rawValue);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Raw config must be a JSON object.');
  }

  if (family.id === 'openai-compatibility') {
    const record = parsed as Record<string, unknown>;
    const apiKeyEntries = Array.isArray(record['api-key-entries']) ? record['api-key-entries'] : [];
    const apiKeys = apiKeyEntries
      .map((item) => {
        if (typeof item === 'string') return item;
        if (
          item &&
          typeof item === 'object' &&
          typeof (item as { 'api-key'?: unknown })['api-key'] === 'string'
        ) {
          return (item as { 'api-key': string })['api-key'];
        }
        return '';
      })
      .filter((value) => value && value !== STORED_SECRET_PLACEHOLDER);

    return {
      name: typeof record.name === 'string' ? record.name : entry.name || '',
      baseUrl: typeof record['base-url'] === 'string' ? record['base-url'] : '',
      proxyUrl: '',
      prefix: '',
      headersText:
        record.headers && typeof record.headers === 'object' && !Array.isArray(record.headers)
          ? Object.entries(record.headers as Record<string, string>)
              .map(([key, value]) => `${key}: ${value}`)
              .join('\n')
          : '',
      excludedModelsText: '',
      modelAliasesText: formatRawConfigModelArray(record.models),
      apiKey: '',
      apiKeysText: apiKeys.join('\n'),
    };
  }

  const record = parsed as Record<string, unknown>;

  return {
    name: '',
    baseUrl: typeof record['base-url'] === 'string' ? record['base-url'] : '',
    proxyUrl: typeof record['proxy-url'] === 'string' ? record['proxy-url'] : '',
    prefix: typeof record.prefix === 'string' ? record.prefix : '',
    headersText:
      record.headers && typeof record.headers === 'object' && !Array.isArray(record.headers)
        ? Object.entries(record.headers as Record<string, string>)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n')
        : '',
    excludedModelsText: Array.isArray(record['excluded-models'])
      ? (record['excluded-models'] as string[]).join('\n')
      : '',
    modelAliasesText: formatRawConfigModelArray(record.models),
    apiKey:
      typeof record['api-key'] === 'string' && record['api-key'] !== STORED_SECRET_PLACEHOLDER
        ? record['api-key']
        : '',
    apiKeysText: '',
  };
}

function buildEntryPayload(
  family: AiProviderFamilyState,
  entry: AiProviderEntryView,
  draft: EntryEditorDraft
) {
  if (family.id === 'openai-compatibility') {
    const apiKeys = parseDelimitedLines(draft.apiKeysText);
    const preserveSecrets = entry.secretConfigured && apiKeys.length === 0;
    return {
      name: draft.name.trim(),
      baseUrl: draft.baseUrl.trim(),
      headers: parseKeyValueLines(draft.headersText),
      models: parseModelAliasLines(draft.modelAliasesText),
      preserveSecrets,
      ...(apiKeys.length > 0 ? { apiKeys } : {}),
    };
  }

  const apiKey = draft.apiKey.trim();
  const preserveSecrets = entry.secretConfigured && apiKey.length === 0;

  return {
    baseUrl: draft.baseUrl.trim(),
    proxyUrl: draft.proxyUrl.trim(),
    prefix: draft.prefix.trim(),
    headers: parseKeyValueLines(draft.headersText),
    excludedModels: parseDelimitedLines(draft.excludedModelsText),
    models: parseModelAliasLines(draft.modelAliasesText),
    preserveSecrets,
    ...(apiKey.length > 0 ? { apiKey } : {}),
  };
}

function buildSettingsPreview(
  family: AiProviderFamilyState,
  draft: EntryEditorDraft,
  source: AiProvidersSourceSummary
) {
  const env: Record<string, string> = {
    ANTHROPIC_BASE_URL: `${source.target}${family.routePath}`,
    ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
  };
  const primaryModel = parseModelAliasLines(draft.modelAliasesText).find((item) =>
    item.name.trim()
  );
  if (primaryModel?.name) {
    env.ANTHROPIC_MODEL = getRequestedModelId(primaryModel);
  }

  return { env };
}

function SetupStepSection({
  badge,
  title,
  items,
}: {
  badge: string;
  title: string;
  items: string[];
}) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="text-[11px]">
          {badge}
        </Badge>
        <div className="text-sm font-medium">{title}</div>
      </div>
      <div className="mt-4 space-y-3">
        {items.map((item, index) => (
          <div
            key={`${title}:${item}`}
            className="flex items-start gap-3 rounded-lg border bg-muted/10 px-3 py-3"
          >
            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border bg-background text-[11px] font-semibold text-muted-foreground">
              {index + 1}
            </div>
            <div className="text-sm leading-6 text-muted-foreground">{item}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EntryEditorField({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {children}
      {helper ? <div className="text-xs leading-5 text-muted-foreground">{helper}</div> : null}
    </div>
  );
}

function EntryEditorTextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      rows={rows}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
    />
  );
}

function EntryInspector({
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

      <div className="min-h-0 overflow-hidden">
        <Tabs value={jsonTab} onValueChange={setJsonTab} className="flex h-full flex-col">
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
              {rawJsonError ? (
                <div className="mx-6 mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {rawJsonError}
                </div>
              ) : null}
              <div className="min-h-0 flex-1 px-6 pb-4 pt-4">
                <div className="h-full overflow-hidden rounded-md border bg-background">
                  <Suspense
                    fallback={
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <RefreshCw className="h-5 w-5 animate-spin" />
                      </div>
                    }
                  >
                    <CodeEditor
                      value={rawJsonContent}
                      onChange={handleRawJsonChange}
                      language="json"
                      minHeight="100%"
                      heightMode="fill-parent"
                    />
                  </Suspense>
                </div>
              </div>
            </div>
          </TabsContent>

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
                  <Suspense
                    fallback={
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <RefreshCw className="h-5 w-5 animate-spin" />
                      </div>
                    }
                  >
                    <CodeEditor
                      value={settingsPreviewContent}
                      onChange={() => {}}
                      language="json"
                      readonly
                      minHeight="100%"
                      heightMode="fill-parent"
                    />
                  </Suspense>
                </div>
              </div>
              <div className="mx-6 mb-4 overflow-hidden rounded-md border">
                <GlobalEnvIndicator profileEnv={settingsPreview.env} />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function EmptyEntryWorkspace({
  family,
  onAddEntry,
  onOpenControlPanel,
  onOpenProfiles,
}: {
  family: AiProviderFamilyState;
  onAddEntry: () => void;
  onOpenControlPanel: () => void;
  onOpenProfiles: () => void;
}) {
  const guide = getFamilyGuide(family);
  const addLabel = family.supportsNamedEntries
    ? 'Create connector'
    : `Add ${family.displayName} entry`;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-xl border bg-card">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <KeyRound className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Set up {family.displayName}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Start with the smallest working setup. Add routing rules only after the route is
                  already working.
                </p>
              </div>
            </div>

            <Button type="button" onClick={onAddEntry}>
              <Plus className="mr-1 h-4 w-4" />
              {addLabel}
            </Button>
          </div>

          <div className="space-y-4 p-5">
            <div className="rounded-xl border bg-muted/10 p-4">
              <div className="text-sm font-medium">Recommended setup flow</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Finish the left section first. Treat the right section as optional follow-up.
              </div>
              <div className="mt-4 space-y-4">
                <SetupStepSection
                  badge="Do this first"
                  title="Minimum working setup"
                  items={guide.requiredNow}
                />
                <SetupStepSection
                  badge="Only if needed"
                  title="Optional later"
                  items={guide.optionalLater}
                />
              </div>
            </div>

            <div className="rounded-xl border bg-muted/15 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Need the other pages?
              </div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">
                Use Overview or Control Panel for OAuth sign-ins. Use API Profiles only for
                CCS-native Anthropic-compatible profiles and presets.
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={onOpenControlPanel}>
                  Control Panel
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={onOpenProfiles}>
                  API Profiles
                  <ExternalLink className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Route className="h-4 w-4 text-primary" />
              What this route does
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline" className="font-mono text-[11px]">
                {family.routePath}
              </Badge>
              <Badge variant="outline" className="uppercase text-[11px]">
                {family.authMode}
              </Badge>
            </div>
            <div className="mt-4 space-y-3">
              {guide.emptyStateSummary.map((item) => (
                <div
                  key={item}
                  className="rounded-lg border bg-muted/10 p-4 text-sm leading-6 text-muted-foreground"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Workflow className="h-4 w-4 text-primary" />
              When API Profiles is the better fit
            </div>
            <div className="mt-3 text-sm leading-6 text-muted-foreground">
              {guide.profileBoundary}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CliproxyAiProvidersPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data, error, isLoading, isFetching, refetch } = useCliproxyAiProviders();
  const createMutation = useCreateCliproxyAiProviderEntry();
  const updateMutation = useUpdateCliproxyAiProviderEntry();
  const deleteMutation = useDeleteCliproxyAiProviderEntry();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<AiProviderEntryView | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<AiProviderEntryView | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  const families = useMemo(() => data?.families ?? [], [data?.families]);
  const requestedFamily = useMemo(
    () => (new URLSearchParams(location.search).get('family') as AiProviderFamilyId | null) || null,
    [location.search]
  );
  const selectedFamily = useMemo<AiProviderFamilyId>(() => {
    if (requestedFamily && families.some((family) => family.id === requestedFamily)) {
      return requestedFamily;
    }

    return families[0]?.id ?? 'gemini-api-key';
  }, [families, requestedFamily]);

  const selectedFamilyState = useMemo(
    () => families.find((family) => family.id === selectedFamily) || null,
    [families, selectedFamily]
  );

  const effectiveSelectedEntryId = useMemo(() => {
    const entries = selectedFamilyState?.entries ?? [];
    if (entries.length === 0) {
      return null;
    }

    if (selectedEntryId && entries.some((entry) => entry.id === selectedEntryId)) {
      return selectedEntryId;
    }

    return entries[0]?.id ?? null;
  }, [selectedEntryId, selectedFamilyState?.entries]);

  const handleFamilySelect = (family: AiProviderFamilyId) => {
    navigate({ pathname: location.pathname, search: `?family=${family}` }, { replace: true });
  };

  const openCreateDialog = () => {
    setEditingEntry(null);
    setDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 overflow-hidden">
        <Skeleton className="h-full w-80 rounded-none" />
        <Skeleton className="h-full flex-1 rounded-none" />
      </div>
    );
  }

  if (error || !data || !selectedFamilyState) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to load CLIProxy AI providers. Check the local server and try again.';

    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-muted/10 p-6">
        <div className="w-full max-w-2xl rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-destructive/10">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-lg font-semibold">{t('aiProvidersPage.unableToLoad')}</div>
              <div className="mt-2 text-sm text-muted-foreground">{message}</div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" onClick={() => void refetch()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/cliproxy/control-panel')}
                >
                  Control Panel
                </Button>
                <Button type="button" variant="outline" onClick={() => navigate('/providers')}>
                  API Profiles
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const configuredEntries = selectedFamilyState.entries.filter((entry) => entry.secretConfigured);
  const readyFamilies = families.filter((family) => family.status === 'ready').length;
  const selectedEntry =
    selectedFamilyState.entries.find((entry) => entry.id === effectiveSelectedEntryId) ?? null;
  const hasMultipleEntries = selectedFamilyState.entries.length > 1;
  const statusBadge = getFamilyStatusBadge(selectedFamilyState.status);
  const hasEntries = selectedFamilyState.entries.length > 0;
  const setupStatusCard = (
    <div className="rounded-xl border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Setup status
          </div>
          <div className="mt-1 text-sm font-medium">{selectedFamilyState.routePath}</div>
        </div>
        <Badge variant="secondary" className={statusBadge.className}>
          {statusBadge.label}
        </Badge>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <SummaryCard
          label="Entries"
          value={`${selectedFamilyState.entries.length}`}
          hint="configured rows"
        />
        <SummaryCard
          label="Secrets"
          value={`${configuredEntries.length}/${selectedFamilyState.entries.length || 0}`}
          hint="stored in CLIProxy"
        />
      </div>

      <div className="mt-3 rounded-lg border bg-muted/15 p-3 text-xs leading-5 text-muted-foreground">
        Overview handles OAuth sign-ins. This page stores CLIProxy-managed keys and connectors. API
        Profiles remains for CCS-native Anthropic-compatible profiles.
      </div>
    </div>
  );
  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="flex w-80 flex-col border-r bg-muted/30">
        <div className="border-b bg-background p-4">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              <h1 className="font-semibold">CLIProxy Plus</h1>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            </Button>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">AI Providers</p>

          <Button
            variant="default"
            size="sm"
            className="w-full gap-2"
            type="button"
            onClick={openCreateDialog}
          >
            <Plus className="h-4 w-4" />
            {selectedFamilyState.supportsNamedEntries
              ? 'Create Connector'
              : `Add ${selectedFamilyState.displayName} Entry`}
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            <div className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Provider Families
            </div>
            <FamilyRail
              families={families}
              selectedFamily={selectedFamily}
              onSelect={handleFamilySelect}
            />
          </div>
        </ScrollArea>

        <div className="border-t p-3">
          <ProxyStatusWidget />
        </div>

        <div className="border-t bg-background p-3 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>{families.length} families</span>
            <span className="flex items-center gap-1">
              <Check className="h-3 w-3 text-emerald-600" />
              {readyFamilies} ready
            </span>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <div className="shrink-0 border-b bg-background px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <ProviderLogo
                provider={getAiProviderFamilyVisual(selectedFamilyState.id)}
                size="lg"
              />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{selectedFamilyState.displayName}</h2>
                  <Badge variant="secondary" className={statusBadge.className}>
                    {statusBadge.label}
                  </Badge>
                  <Badge variant="outline" className="uppercase">
                    {selectedFamilyState.authMode}
                  </Badge>
                  <Badge variant="outline" className="font-mono text-[11px]">
                    {selectedFamilyState.routePath}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {selectedFamilyState.description}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/cliproxy/control-panel')}
              >
                Control Panel
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate('/providers')}>
                API Profiles
                <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {hasEntries ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 border-b bg-muted/5 px-6 py-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <ListFilter className="h-3 w-3" />
                  {hasMultipleEntries ? 'Saved entries' : 'Saved entry'}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-[11px]">
                    {selectedFamilyState.entries.length} entries
                  </Badge>
                  <Badge variant="outline" className="text-[11px]">
                    {configuredEntries.length}/{selectedFamilyState.entries.length} secrets stored
                  </Badge>
                </div>
              </div>

              {hasMultipleEntries ? (
                <div className="flex flex-wrap gap-3">
                  {selectedFamilyState.entries.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setSelectedEntryId(entry.id)}
                      className={cn(
                        'min-w-[220px] max-w-[280px] flex-1 rounded-xl border bg-background px-4 py-3 text-left transition-colors',
                        entry.id === effectiveSelectedEntryId
                          ? 'border-primary/30 bg-primary/5 shadow-sm'
                          : 'border-border/60 hover:bg-muted/50'
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-sm font-medium">{entry.label}</div>
                        <EntrySecretBadge configured={entry.secretConfigured} />
                      </div>
                      <div className="mt-2 truncate text-xs text-muted-foreground">
                        {entry.baseUrl || selectedFamilyState.routePath}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="text-[10px]">
                          {getRoutingMode(entry)}
                        </Badge>
                        {entry.models.length > 0 ? (
                          <Badge variant="outline" className="text-[10px]">
                            {renderModelRuleSummary(entry.models)}
                          </Badge>
                        ) : null}
                        <Badge variant="outline" className="text-[10px]">
                          {entry.headers.length} hdr
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              ) : selectedEntry ? (
                <div className="rounded-xl border bg-background px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-sm font-medium">{selectedEntry.label}</div>
                        <EntrySecretBadge configured={selectedEntry.secretConfigured} />
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {selectedEntry.baseUrl || selectedFamilyState.routePath}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="text-[10px]">
                        {getRoutingMode(selectedEntry)}
                      </Badge>
                      {selectedEntry.models.length > 0 ? (
                        <Badge variant="outline" className="text-[10px]">
                          {renderModelRuleSummary(selectedEntry.models)}
                        </Badge>
                      ) : null}
                      <Badge variant="outline" className="text-[10px]">
                        {selectedEntry.headers.length} hdr
                      </Badge>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {selectedEntry ? (
              <EntryInspector
                key={selectedEntry.id}
                family={selectedFamilyState}
                entry={selectedEntry}
                source={data.source}
                isSaving={updateMutation.isPending}
                onSave={async (payload) => {
                  await updateMutation.mutateAsync({
                    family: selectedFamily,
                    entryId: selectedEntry.id,
                    data: payload,
                  });
                  void refetch();
                }}
                onDelete={() => setDeleteEntry(selectedEntry)}
              />
            ) : null}
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="space-y-6 p-6">
              {setupStatusCard}
              <EmptyEntryWorkspace
                family={selectedFamilyState}
                onAddEntry={openCreateDialog}
                onOpenControlPanel={() => navigate('/cliproxy/control-panel')}
                onOpenProfiles={() => navigate('/providers')}
              />
            </div>
          </ScrollArea>
        )}
      </div>

      <ProviderEntryDialog
        key={`${selectedFamily}:${editingEntry?.id ?? 'new'}:${dialogOpen ? 'open' : 'closed'}`}
        family={selectedFamily}
        entry={editingEntry}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={async (payload) => {
          if (editingEntry) {
            await updateMutation.mutateAsync({
              family: selectedFamily,
              entryId: editingEntry.id,
              data: payload,
            });
          } else {
            await createMutation.mutateAsync({ family: selectedFamily, data: payload });
          }
          setDialogOpen(false);
          setEditingEntry(null);
          void refetch();
        }}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />

      <ConfirmDialog
        open={deleteEntry !== null}
        title="Remove provider entry?"
        description={
          deleteEntry
            ? `This removes ${deleteEntry.label} from ${selectedFamilyState.displayName}.`
            : ''
        }
        confirmText="Remove"
        variant="destructive"
        onConfirm={async () => {
          if (!deleteEntry) return;
          await deleteMutation.mutateAsync({
            family: selectedFamily,
            entryId: deleteEntry.id,
          });
          setDeleteEntry(null);
        }}
        onCancel={() => setDeleteEntry(null)}
      />
    </div>
  );
}
