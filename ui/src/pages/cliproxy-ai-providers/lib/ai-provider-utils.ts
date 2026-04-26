/**
 * Shared utility functions for cliproxy AI providers page.
 * Pure functions — no side effects, no React.
 */

import {
  formatRequestedUpstreamModelRules,
  getRequestedUpstreamModelRuleErrors,
  getRequestedModelId,
  parseRequestedUpstreamModelRules,
} from '@/lib/provider-config';
import type {
  AiProviderEntryView,
  AiProviderFamilyId,
  AiProviderFamilyState,
} from '../../../../../src/cliproxy/ai-providers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EntryEditorDraft = {
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

export type FamilyGuide = {
  requiredNow: string[];
  optionalLater: string[];
  emptyStateSummary: string[];
  profileBoundary: string;
  editPrompts: Array<{ label: string; hint: string }>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const STORED_SECRET_PLACEHOLDER = '<stored in CLIProxy>';

// ---------------------------------------------------------------------------
// Status / display helpers
// ---------------------------------------------------------------------------

export function getFamilyStatusBadge(status: 'empty' | 'partial' | 'ready') {
  switch (status) {
    case 'ready':
      return { label: 'Ready', className: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-50' };
    case 'partial':
      return {
        label: 'Needs attention',
        className: 'bg-amber-50 text-amber-700 hover:bg-amber-50',
      };
    default:
      return { label: 'Empty', className: 'bg-muted text-muted-foreground hover:bg-muted' };
  }
}

export function getRoutingMode(entry: AiProviderEntryView) {
  if (entry.proxyUrl) return 'Proxy override';
  if (entry.prefix) return 'Prefixed route';
  if (entry.baseUrl) return 'Direct upstream';
  return 'Default runtime';
}

export function getMappedModelCount(models: Array<{ name: string; alias: string }>) {
  return models.filter((m) => m.alias.trim().length > 0).length;
}

export function getDirectModelCount(models: Array<{ name: string; alias: string }>) {
  return models.filter((m) => m.name.trim().length > 0 && m.alias.trim().length === 0).length;
}

export function renderModelRuleSummary(models: Array<{ name: string; alias: string }>) {
  const mapped = getMappedModelCount(models);
  const direct = getDirectModelCount(models);
  const parts: string[] = [];
  if (mapped > 0) parts.push(`${mapped} mapped`);
  if (direct > 0) parts.push(`${direct} direct`);
  return parts.length > 0 ? parts.join(' + ') : 'No model rules';
}

// ---------------------------------------------------------------------------
// Family guide text (per-family copy)
// ---------------------------------------------------------------------------

export function getFamilyGuide(family: AiProviderFamilyState): FamilyGuide {
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

// ---------------------------------------------------------------------------
// Text format / parse helpers
// ---------------------------------------------------------------------------

export function parseDelimitedLines(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function parseKeyValueLines(value: string): Array<{ key: string; value: string }> {
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

export function parseModelAliasLines(value: string) {
  return parseRequestedUpstreamModelRules(value);
}

export { getRequestedUpstreamModelRuleErrors };

export function formatHeaders(entry?: AiProviderEntryView | null): string {
  return (entry?.headers || []).map((item) => `${item.key}: ${item.value}`).join('\n');
}

export function formatExcludedModels(entry?: AiProviderEntryView | null): string {
  return (entry?.excludedModels || []).join('\n');
}

export function formatModelAliases(entry?: AiProviderEntryView | null): string {
  return formatRequestedUpstreamModelRules(entry?.models);
}

export function formatRawConfigModelArray(value: unknown): string {
  return Array.isArray(value)
    ? formatRequestedUpstreamModelRules(value as Array<{ name?: string; alias?: string }>)
    : '';
}

// ---------------------------------------------------------------------------
// Draft builders
// ---------------------------------------------------------------------------

export function buildEntryEditorDraft(entry: AiProviderEntryView): EntryEditorDraft {
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

function buildExcludedModelsArray(value: string) {
  const parsed = parseDelimitedLines(value);
  return parsed.length > 0 ? parsed : undefined;
}

// ---------------------------------------------------------------------------
// Config record builder (for raw JSON pane)
// ---------------------------------------------------------------------------

export function buildEntryConfigRecord(
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

// ---------------------------------------------------------------------------
// JSON → draft parser (bidirectional sync from raw JSON pane)
// ---------------------------------------------------------------------------

export function parseEntryConfigDraft(
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

// ---------------------------------------------------------------------------
// API payload builder
// ---------------------------------------------------------------------------

export function buildEntryPayload(
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

// ---------------------------------------------------------------------------
// Settings preview builder
// ---------------------------------------------------------------------------

import type { AiProvidersSourceSummary } from '../../../../../src/cliproxy/ai-providers';

export function buildSettingsPreview(
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

// ---------------------------------------------------------------------------
// Base URL placeholder per family
// ---------------------------------------------------------------------------

export function getBaseUrlPlaceholder(familyId: AiProviderFamilyId): string {
  switch (familyId) {
    case 'codex-api-key':
      return 'https://api.openai.com/v1';
    case 'claude-api-key':
      return 'https://api.anthropic.com';
    case 'openai-compatibility':
      return 'https://openrouter.ai/api/v1';
    default:
      return 'https://provider.example.com';
  }
}
