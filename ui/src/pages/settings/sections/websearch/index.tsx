/**
 * WebSearch Section
 * Settings section for real WebSearch backends and legacy fallbacks.
 */

import { useEffect, useMemo, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { MaskedInput } from '@/components/ui/masked-input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Globe,
  KeyRound,
  RefreshCw,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useRawConfig, useWebSearchConfig } from '../../hooks';
import type {
  CliStatus,
  WebSearchApiKeyProviderId,
  WebSearchApiKeyState,
  WebSearchProvidersConfig,
} from '../../types';
import { ProviderCard, type ProviderFieldConfig } from './provider-card';

type ProviderId =
  | 'exa'
  | 'tavily'
  | 'brave'
  | 'searxng'
  | 'parallel'
  | 'duckduckgo'
  | 'gemini'
  | 'opencode'
  | 'grok';
type ProviderFieldKey = 'model' | 'timeout' | 'max_results' | 'url';

interface ProviderFieldDefinition {
  key: ProviderFieldKey;
  label: string;
  type: 'text' | 'number';
  placeholder: string;
  helpText: string;
  defaultValue: string | number;
  min?: number;
  max?: number;
}

interface ProviderDefinition {
  id: ProviderId;
  title: string;
  description: string;
  badge: string;
  badgeTone: 'green' | 'blue' | 'amber' | 'cyan' | 'slate';
  defaultEnabled: boolean;
  fallbackDetail: string;
  footerNote: string;
  fields?: ProviderFieldDefinition[];
}

// TODO i18n: missing keys for CHAIN_STEPS titles
const CHAIN_STEPS = [
  { id: 'exa', title: 'Exa', defaultEnabled: false },
  { id: 'tavily', title: 'Tavily', defaultEnabled: false },
  { id: 'brave', title: 'Brave', defaultEnabled: false },
  { id: 'searxng', title: 'SearXNG', defaultEnabled: false },
  { id: 'parallel', title: 'Parallel', defaultEnabled: false },
  { id: 'duckduckgo', title: 'DuckDuckGo', defaultEnabled: true },
  { id: 'legacy', title: 'Legacy CLI', defaultEnabled: false },
] as const;

// TODO i18n: missing keys for BACKEND_PROVIDERS titles, descriptions, badges, footerNotes, field labels, helpTexts, placeholders
const BACKEND_PROVIDERS: ProviderDefinition[] = [
  {
    id: 'exa',
    title: 'Exa',
    description:
      'Highest-priority API backend when enabled. Best for strong relevance and extracted text.',
    badge: 'EXA_API_KEY',
    badgeTone: 'amber',
    defaultEnabled: false,
    fallbackDetail: 'Set EXA_API_KEY',
    footerNote: 'Runs before every other provider in the chain when enabled and ready.',
    fields: [
      {
        key: 'max_results',
        label: 'Max results',
        type: 'number',
        placeholder: '5',
        helpText: 'Clamp between 1 and 10 results.',
        defaultValue: 5,
        min: 1,
        max: 10,
      },
    ],
  },
  {
    id: 'tavily',
    title: 'Tavily',
    description: 'Agent-oriented API backend with concise web result content.',
    badge: 'TAVILY_API_KEY',
    badgeTone: 'cyan',
    defaultEnabled: false,
    fallbackDetail: 'Set TAVILY_API_KEY',
    footerNote: 'Runs after Exa and before Brave when enabled and ready.',
    fields: [
      {
        key: 'max_results',
        label: 'Max results',
        type: 'number',
        placeholder: '5',
        helpText: 'Clamp between 1 and 10 results.',
        defaultValue: 5,
        min: 1,
        max: 10,
      },
    ],
  },
  {
    id: 'brave',
    title: 'Brave Search',
    description: 'API-backed search with clean metadata and broad web coverage.',
    badge: 'BRAVE_API_KEY',
    badgeTone: 'blue',
    defaultEnabled: false,
    fallbackDetail: 'Set BRAVE_API_KEY',
    footerNote: 'Runs after Exa and Tavily, before DuckDuckGo.',
    fields: [
      {
        key: 'max_results',
        label: 'Max results',
        type: 'number',
        placeholder: '5',
        helpText: 'Clamp between 1 and 10 results.',
        defaultValue: 5,
        min: 1,
        max: 10,
      },
    ],
  },
  {
    id: 'searxng',
    title: 'SearXNG',
    description: 'Configurable JSON backend for self-hosted or public SearXNG instances.',
    badge: 'SELF-HOSTED',
    badgeTone: 'cyan',
    defaultEnabled: false,
    fallbackDetail: 'Set a valid base URL',
    footerNote: 'Runs after Brave and before Parallel when enabled and ready.',
    fields: [
      {
        key: 'url',
        label: 'Base URL',
        type: 'text',
        placeholder: 'https://search.example.com',
        helpText:
          'Paste the instance base URL only. CCS appends /search?format=json for you and rejects embedded credentials.',
        defaultValue: '',
      },
      {
        key: 'max_results',
        label: 'Max results',
        type: 'number',
        placeholder: '5',
        helpText: 'Clamp between 1 and 10 results.',
        defaultValue: 5,
        min: 1,
        max: 10,
      },
    ],
  },
  {
    id: 'parallel',
    title: 'Parallel',
    description: 'Opt-in public web search through Parallel Unified MCP. No key required.',
    badge: 'MCP',
    badgeTone: 'cyan',
    defaultEnabled: false,
    fallbackDetail: 'Disabled by default',
    footerNote:
      'Runs after SearXNG and before DuckDuckGo. Send only public queries you authorize for this service; keyless access is rate limited.',
    fields: [
      {
        key: 'url',
        label: 'MCP URL',
        type: 'text',
        placeholder: 'https://mcp.parallel.ai/mcp',
        helpText:
          'Full Streamable HTTP endpoint without credentials, query parameters, or fragments.',
        defaultValue: 'https://mcp.parallel.ai/mcp',
      },
      {
        key: 'max_results',
        label: 'Max results',
        type: 'number',
        placeholder: '5',
        helpText: 'Display between 1 and 10 results.',
        defaultValue: 5,
        min: 1,
        max: 10,
      },
    ],
  },
  {
    id: 'duckduckgo',
    title: 'DuckDuckGo',
    description: 'Zero-setup floor. Keep this on unless you want no built-in fallback at all.',
    badge: 'DEFAULT',
    badgeTone: 'green',
    defaultEnabled: true,
    fallbackDetail: 'Built-in',
    footerNote: 'Last real backend in the chain. No API key needed.',
    fields: [
      {
        key: 'max_results',
        label: 'Max results',
        type: 'number',
        placeholder: '5',
        helpText: 'Clamp between 1 and 10 results.',
        defaultValue: 5,
        min: 1,
        max: 10,
      },
    ],
  },
];

// TODO i18n: missing keys for LEGACY_PROVIDERS titles, descriptions, badges, footerNotes, field labels, helpTexts, placeholders
const LEGACY_PROVIDERS: ProviderDefinition[] = [
  {
    id: 'gemini',
    title: 'Gemini CLI',
    description: 'Optional legacy LLM fallback. Used only if every enabled real backend fails.',
    badge: 'LEGACY',
    badgeTone: 'slate',
    defaultEnabled: false,
    fallbackDetail: 'Optional fallback',
    footerNote: 'Legacy path. Useful for compatibility, not the preferred search backend.',
    fields: [
      {
        key: 'model',
        label: 'Model',
        type: 'text',
        placeholder: 'gemini-2.5-flash',
        helpText: 'CLI model passed to Gemini when this fallback runs.',
        defaultValue: 'gemini-2.5-flash',
      },
      {
        key: 'timeout',
        label: 'Timeout (seconds)',
        type: 'number',
        placeholder: '55',
        helpText: 'Clamp between 5 and 300 seconds.',
        defaultValue: 55,
        min: 5,
        max: 300,
      },
    ],
  },
  {
    id: 'opencode',
    title: 'OpenCode',
    description: 'Optional legacy LLM fallback via OpenCode.',
    badge: 'LEGACY',
    badgeTone: 'slate',
    defaultEnabled: false,
    fallbackDetail: 'Optional fallback',
    footerNote: 'Legacy path. Runs after Gemini in the fallback portion of the chain.',
    fields: [
      {
        key: 'model',
        label: 'Model',
        type: 'text',
        placeholder: 'opencode/grok-code',
        helpText: 'OpenCode model passed to the CLI runner.',
        defaultValue: 'opencode/grok-code',
      },
      {
        key: 'timeout',
        label: 'Timeout (seconds)',
        type: 'number',
        placeholder: '90',
        helpText: 'Clamp between 5 and 300 seconds.',
        defaultValue: 90,
        min: 5,
        max: 300,
      },
    ],
  },
  {
    id: 'grok',
    title: 'Grok CLI',
    description: 'Optional legacy xAI fallback. Requires the Grok CLI and GROK_API_KEY.',
    badge: 'LEGACY',
    badgeTone: 'slate',
    defaultEnabled: false,
    fallbackDetail: 'Optional fallback',
    footerNote: 'Last step in the full fallback chain.',
    fields: [
      {
        key: 'timeout',
        label: 'Timeout (seconds)',
        type: 'number',
        placeholder: '55',
        helpText: 'Clamp between 5 and 300 seconds.',
        defaultValue: 55,
        min: 5,
        max: 300,
      },
    ],
  },
];

function getStatusTone(
  provider: CliStatus | undefined,
  enabled: boolean
): 'ready' | 'setup' | 'idle' {
  if (enabled && provider?.available) {
    return 'ready';
  }
  if (enabled) {
    return 'setup';
  }
  return 'idle';
}

// TODO i18n: missing keys for getStatusLabel return values ("Ready", "Needs setup", "Disabled")
function getStatusLabel(provider: CliStatus | undefined, enabled: boolean): string {
  if (enabled && provider?.available) {
    return 'Ready';
  }
  if (enabled) {
    return 'Needs setup';
  }
  return 'Disabled';
}

function getToneChipClass(tone: 'ready' | 'setup' | 'idle'): string {
  switch (tone) {
    case 'ready':
      return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200';
    case 'setup':
      return 'border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200';
    case 'idle':
      return 'border-border/80 bg-background/85 text-muted-foreground';
  }
}

function getToneIndicatorClass(tone: 'ready' | 'setup' | 'idle'): string {
  switch (tone) {
    case 'ready':
      return 'bg-emerald-500';
    case 'setup':
      return 'bg-amber-500';
    case 'idle':
      return 'bg-border';
  }
}

function getToneRailDotClass(tone: 'ready' | 'setup' | 'idle'): string {
  switch (tone) {
    case 'ready':
      return 'bg-emerald-500 shadow-[0_0_0_6px_rgba(16,185,129,0.12)]';
    case 'setup':
      return 'bg-amber-500 shadow-[0_0_0_6px_rgba(245,158,11,0.12)]';
    case 'idle':
      return 'bg-border';
  }
}

function getToneLineClass(tone: 'ready' | 'setup' | 'idle'): string {
  switch (tone) {
    case 'ready':
      return 'bg-gradient-to-b from-emerald-500/55 to-border';
    case 'setup':
      return 'bg-gradient-to-b from-amber-500/55 to-border';
    case 'idle':
      return 'bg-border';
  }
}

function normalizeFieldValue(field: ProviderFieldDefinition, rawValue: string): string | number {
  if (field.type === 'number') {
    const parsed = Number.parseInt(rawValue.trim(), 10);
    if (!Number.isFinite(parsed)) {
      return field.defaultValue;
    }

    const min = field.min ?? parsed;
    const max = field.max ?? parsed;
    return Math.min(max, Math.max(min, parsed));
  }

  const trimmed = rawValue.trim();
  return trimmed || String(field.defaultValue);
}

function getConfiguredValue(
  config: WebSearchProvidersConfig | undefined,
  providerId: ProviderId,
  field: ProviderFieldDefinition
): string {
  const configured = config?.[providerId]?.[field.key];
  return String(configured ?? field.defaultValue);
}

function isApiKeyProvider(providerId: ProviderId): providerId is WebSearchApiKeyProviderId {
  return providerId === 'exa' || providerId === 'tavily' || providerId === 'brave';
}

// TODO i18n: missing keys for getApiKeySummary return values
function getApiKeySummary(apiKeyState: WebSearchApiKeyState | undefined): string {
  if (!apiKeyState?.configured) {
    return 'Not stored';
  }

  if (!apiKeyState.available && apiKeyState.source === 'global_env') {
    return 'Stored in dashboard, but Global Env is disabled';
  }

  switch (apiKeyState.source) {
    case 'global_env':
      return 'Stored in dashboard';
    case 'process_env':
      return 'Detected from shell env';
    case 'both':
      return 'Stored in dashboard + shell env';
    case 'none':
      return 'Not stored';
  }
}

export default function WebSearchSection() {
  const { t } = useTranslation();
  const {
    config,
    status,
    loading,
    statusLoading,
    saving,
    error,
    success,
    fetchConfig,
    fetchStatus,
    saveConfig,
  } = useWebSearchConfig();
  const { fetchRawConfig } = useRawConfig();
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, string>>({});
  const [apiKeyDrafts, setApiKeyDrafts] = useState<
    Partial<Record<WebSearchApiKeyProviderId, string>>
  >({});
  const [savedFieldId, setSavedFieldId] = useState<string | null>(null);
  const [savedApiKeyProvider, setSavedApiKeyProvider] = useState<WebSearchApiKeyProviderId | null>(
    null
  );
  const [legacyExpanded, setLegacyExpanded] = useState(false);

  useEffect(() => {
    fetchConfig();
    fetchStatus();
    fetchRawConfig();
  }, [fetchConfig, fetchStatus, fetchRawConfig]);

  const providerStatus = useMemo(
    () => new Map((status?.providers ?? []).map((provider) => [provider.id, provider])),
    [status?.providers]
  );
  const legacyEnabled = LEGACY_PROVIDERS.filter(
    (provider) => config?.providers?.[provider.id]?.enabled ?? provider.defaultEnabled
  );
  const legacyReady = legacyEnabled.some((provider) => providerStatus.get(provider.id)?.available);

  const legacySummary =
    // TODO i18n: missing keys for legacy summary format strings ("Off", "X enabled", "N enabled")
    legacyEnabled.length === 0
      ? 'Off'
      : legacyEnabled.length === 1
        ? `${legacyEnabled[0].title} enabled`
        : `${legacyEnabled.length} enabled`;

  const toggleProvider = async (providerId: ProviderId, enabled: boolean) => {
    const currentProviders = (config?.providers ?? {}) as WebSearchProvidersConfig;
    const saved = await saveConfig({
      providers: {
        ...currentProviders,
        [providerId]: {
          ...currentProviders[providerId],
          enabled: !enabled,
        },
      },
    });

    if (saved) {
      await fetchRawConfig();
    }
  };

  const updateDraft = (providerId: ProviderId, fieldKey: ProviderFieldKey, value: string) => {
    setFieldDrafts((current) => ({ ...current, [`${providerId}.${fieldKey}`]: value }));
  };

  const commitField = async (providerId: ProviderId, field: ProviderFieldDefinition) => {
    if (!config) {
      return;
    }

    const fieldId = `${providerId}.${field.key}`;
    const currentProviders = (config.providers ?? {}) as WebSearchProvidersConfig;
    const currentProviderConfig = currentProviders[providerId] ?? {};
    const currentValue = currentProviderConfig[field.key] ?? field.defaultValue;
    const normalized = normalizeFieldValue(
      field,
      fieldDrafts[fieldId] ?? getConfiguredValue(currentProviders, providerId, field)
    );

    setFieldDrafts((current) => ({ ...current, [fieldId]: String(normalized) }));

    if (String(currentValue) === String(normalized)) {
      return;
    }

    const saved = await saveConfig({
      providers: {
        ...currentProviders,
        [providerId]: {
          ...currentProviderConfig,
          [field.key]: normalized,
        },
      },
    });

    if (saved) {
      await fetchRawConfig();
      setSavedFieldId(fieldId);
      setTimeout(() => {
        setSavedFieldId((current) => (current === fieldId ? null : current));
      }, 1200);
    }
  };

  const saveApiKey = async (providerId: WebSearchApiKeyProviderId) => {
    const nextValue = apiKeyDrafts[providerId]?.trim() ?? '';
    if (!nextValue) {
      return;
    }

    const saved = await saveConfig({
      apiKeys: {
        [providerId]: nextValue,
      },
    });

    if (saved) {
      await fetchRawConfig();
      setApiKeyDrafts((current) => ({ ...current, [providerId]: '' }));
      setSavedApiKeyProvider(providerId);
      setTimeout(() => {
        setSavedApiKeyProvider((current) => (current === providerId ? null : current));
      }, 1200);
    }
  };

  const removeApiKey = async (providerId: WebSearchApiKeyProviderId) => {
    const saved = await saveConfig({
      apiKeys: {
        [providerId]: '',
      },
    });

    if (saved) {
      await fetchRawConfig();
      setApiKeyDrafts((current) => ({ ...current, [providerId]: '' }));
      setSavedApiKeyProvider(providerId);
      setTimeout(() => {
        setSavedApiKeyProvider((current) => (current === providerId ? null : current));
      }, 1200);
    }
  };

  const buildFields = (provider: ProviderDefinition): ProviderFieldConfig[] =>
    (provider.fields ?? []).map((field) => {
      const fieldId = `${provider.id}.${field.key}`;

      return {
        id: fieldId,
        label: field.label,
        value:
          fieldDrafts[fieldId] ??
          getConfiguredValue(
            (config?.providers ?? {}) as WebSearchProvidersConfig,
            provider.id,
            field
          ),
        placeholder: field.placeholder,
        type: field.type,
        helpText: field.helpText,
        saved: savedFieldId === fieldId,
        onChange: (value) => updateDraft(provider.id, field.key, value),
        onBlur: () => {
          void commitField(provider.id, field);
        },
        onKeyDown: (event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        },
      };
    });

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span>{t('settings.loading')}</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={`absolute left-5 right-5 top-20 z-10 transition-all duration-200 ease-out ${
          error || success
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none -translate-y-2 opacity-0'
        }`}
      >
        {error && (
          <Alert variant="destructive" className="py-2 shadow-lg">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-green-700 shadow-lg dark:border-green-900/50 dark:bg-green-900/90 dark:text-green-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">{t('settings.saved')}</span>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-6 p-5">
          <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-background via-background to-muted/30 p-4 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-primary/70 via-primary/20 to-transparent" />
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.035]"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(0deg, transparent, transparent 2px, currentColor 2px, currentColor 3px)',
              }}
            />
            <div className="relative">
              <div className="mb-3 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-primary/20 bg-primary/8 text-primary">
                      <Globe className="h-4 w-4" />
                    </div>
                    {/* TODO i18n: missing key for "Execution chain" */}
                    <p className="text-sm font-semibold tracking-tight">Execution chain</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {statusLoading ? t('settingsWebsearch.checking') : status?.readiness.message}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={fetchStatus} disabled={statusLoading}>
                  <RefreshCw className={`h-4 w-4 ${statusLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {CHAIN_STEPS.map((step, index) => {
                  const stepEnabled =
                    step.id === 'legacy'
                      ? legacyEnabled.length > 0
                      : (config?.providers?.[step.id]?.enabled ?? step.defaultEnabled);
                  const tone =
                    step.id === 'legacy'
                      ? legacyReady
                        ? 'ready'
                        : legacyEnabled.length > 0
                          ? 'setup'
                          : 'idle'
                      : getStatusTone(providerStatus.get(step.id), stepEnabled);
                  const label =
                    step.id === 'legacy'
                      ? legacySummary
                      : getStatusLabel(providerStatus.get(step.id), stepEnabled);

                  return (
                    <div key={step.id} className="flex items-center gap-2">
                      <div
                        className={cn(
                          'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium',
                          getToneChipClass(tone)
                        )}
                      >
                        <span
                          className={cn('h-1.5 w-1.5 rounded-full', getToneIndicatorClass(tone))}
                        />
                        <span>
                          {step.title} · {label}
                        </span>
                      </div>
                      {index < CHAIN_STEPS.length - 1 && (
                        <span className="h-px w-4 rounded-full bg-border/80" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-background via-background to-muted/25 p-4 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-sky-500/70 via-emerald-500/25 to-transparent" />
            <div className="relative space-y-4">
              <div className="flex items-start gap-3">
                <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300">
                  <Globe className="h-4 w-4" />
                </div>
                <div>
                  {/* TODO i18n: missing key for "Primary backends" */}
                  <h3 className="text-base font-semibold tracking-tight">Primary backends</h3>
                  <p className="text-sm text-muted-foreground">
                    Real backends run top-down before any legacy CLI fallback.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {BACKEND_PROVIDERS.map((provider, index) => {
                  const currentStatus = providerStatus.get(provider.id);
                  const enabled =
                    config?.providers?.[provider.id]?.enabled ?? provider.defaultEnabled;
                  const tone = getStatusTone(currentStatus, enabled);
                  const apiKeyProviderId = isApiKeyProvider(provider.id) ? provider.id : null;

                  return (
                    <div
                      key={provider.id}
                      className="grid grid-cols-[20px_minmax(0,1fr)] items-start gap-3"
                    >
                      <div className="flex h-full justify-center">
                        <div className="flex h-full flex-col items-center">
                          <span
                            className={cn(
                              'mt-5 h-3 w-3 rounded-full ring-4 ring-background',
                              getToneRailDotClass(tone)
                            )}
                          />
                          {index < BACKEND_PROVIDERS.length - 1 && (
                            <span className={cn('mt-1 w-px flex-1', getToneLineClass(tone))} />
                          )}
                        </div>
                      </div>
                      <ProviderCard
                        title={provider.title}
                        description={provider.description}
                        detail={currentStatus?.detail ?? provider.fallbackDetail}
                        badge={provider.badge}
                        badgeTone={provider.badgeTone}
                        statusLabel={getStatusLabel(currentStatus, enabled)}
                        statusTone={getStatusTone(currentStatus, enabled)}
                        enabled={enabled}
                        saving={saving}
                        onToggle={() => {
                          void toggleProvider(provider.id, enabled);
                        }}
                        fields={buildFields(provider)}
                      >
                        {apiKeyProviderId && (
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                                  {/* TODO i18n: missing key for "API Key" */}
                                  API Key
                                </p>
                                <p className="mt-1 text-sm text-foreground/90">
                                  {getApiKeySummary(config?.apiKeys?.[apiKeyProviderId])}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {config?.apiKeys?.[apiKeyProviderId]?.maskedValue
                                    ? `${config.apiKeys[apiKeyProviderId]?.envVar} ${config.apiKeys[apiKeyProviderId]?.maskedValue}`
                                    : /* TODO i18n: missing key for "Store X here..." */ `Store ${provider.badge} here so the backend is ready immediately after you enable it.`}
                                </p>
                              </div>
                              {savedApiKeyProvider === provider.id && (
                                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                  {/* TODO i18n: missing key for "Saved" */ 'Saved'}
                                </span>
                              )}
                            </div>

                            <MaskedInput
                              id={`${provider.id}.api-key`}
                              value={apiKeyDrafts[apiKeyProviderId] ?? ''}
                              onChange={(event) =>
                                setApiKeyDrafts((current) => ({
                                  ...current,
                                  [apiKeyProviderId]: event.target.value,
                                }))
                              }
                              placeholder={
                                config?.apiKeys?.[apiKeyProviderId]?.configured
                                  ? /* TODO i18n: missing key for "Enter a new key to rotate the stored secret" */ 'Enter a new key to rotate the stored secret'
                                  : /* TODO i18n: missing key for "Paste X" */ `Paste ${provider.badge}`
                              }
                              className="bg-background/80 font-mono text-sm"
                              disabled={saving}
                            />

                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                size="sm"
                                onClick={() => {
                                  void saveApiKey(apiKeyProviderId);
                                }}
                                disabled={
                                  saving || !(apiKeyDrafts[apiKeyProviderId]?.trim() ?? '').length
                                }
                              >
                                {config?.apiKeys?.[apiKeyProviderId]?.configured
                                  ? /* TODO i18n: missing key for "Update key" */ 'Update key'
                                  : /* TODO i18n: missing key for "Save key" */ 'Save key'}
                              </Button>

                              {(config?.apiKeys?.[apiKeyProviderId]?.source === 'global_env' ||
                                config?.apiKeys?.[apiKeyProviderId]?.source === 'both') && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    void removeApiKey(apiKeyProviderId);
                                  }}
                                  disabled={saving}
                                >
                                  {
                                    /* TODO i18n: missing key for "Remove stored key" */ 'Remove stored key'
                                  }
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      </ProviderCard>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setLegacyExpanded((current) => !current)}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-xl px-1 py-1 text-left transition-colors',
                'hover:bg-muted/10'
              )}
            >
              <div className="flex items-center gap-3">
                <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-400/20 bg-slate-500/10 text-slate-700 dark:text-slate-300">
                  <KeyRound className="h-4 w-4" />
                </div>
                <div>
                  {/* TODO i18n: missing key for "Legacy CLI fallbacks" */}
                  <h3 className="text-base font-semibold tracking-tight">Legacy CLI fallbacks</h3>
                  <p className="text-sm text-muted-foreground">
                    Runs only after every enabled real backend fails.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-border/80 bg-background/85 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  {legacySummary}
                </span>
                {legacyExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </button>

            {legacyExpanded && (
              <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-background via-background to-muted/20 p-3 shadow-sm">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-slate-500/60 via-slate-400/18 to-transparent" />
                <div className="relative space-y-3">
                  {LEGACY_PROVIDERS.map((provider, index) => {
                    const currentStatus = providerStatus.get(provider.id);
                    const enabled =
                      config?.providers?.[provider.id]?.enabled ?? provider.defaultEnabled;
                    const tone = getStatusTone(currentStatus, enabled);

                    return (
                      <div
                        key={provider.id}
                        className="grid grid-cols-[20px_minmax(0,1fr)] items-start gap-3"
                      >
                        <div className="flex h-full justify-center">
                          <div className="flex h-full flex-col items-center">
                            <span
                              className={cn(
                                'mt-5 h-3 w-3 rounded-full ring-4 ring-background',
                                getToneRailDotClass(tone)
                              )}
                            />
                            {index < LEGACY_PROVIDERS.length - 1 && (
                              <span className={cn('mt-1 w-px flex-1', getToneLineClass(tone))} />
                            )}
                          </div>
                        </div>
                        <ProviderCard
                          title={provider.title}
                          description={provider.description}
                          detail={currentStatus?.detail ?? provider.fallbackDetail}
                          badge={provider.badge}
                          badgeTone={provider.badgeTone}
                          statusLabel={getStatusLabel(currentStatus, enabled)}
                          statusTone={getStatusTone(currentStatus, enabled)}
                          enabled={enabled}
                          saving={saving}
                          onToggle={() => {
                            void toggleProvider(provider.id, enabled);
                          }}
                          fields={buildFields(provider)}
                          docsUrl={currentStatus?.docsUrl}
                          installCommand={currentStatus?.installCommand}
                          footerNote={provider.footerNote}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      <div className="border-t bg-background p-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            fetchConfig();
            fetchStatus();
            fetchRawConfig();
          }}
          disabled={loading || saving}
          className="w-full"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('settings.refresh')}
        </Button>
      </div>
    </>
  );
}
