import i18n from '@/lib/i18n';

export interface CodexTopLevelSettingsView {
  model: string | null;
  modelReasoningEffort: string | null;
  modelContextWindow: number | null;
  modelAutoCompactTokenLimit: number | null;
  modelProvider: string | null;
  approvalPolicy: string | null;
  sandboxMode: string | null;
  webSearch: string | null;
  toolOutputTokenLimit: number | null;
  personality: string | null;
}

export interface CodexProjectTrustEntry {
  path: string;
  trustLevel: string;
}

export interface CodexProfileEntry {
  name: string;
  values: CodexTopLevelSettingsView;
}

export interface CodexModelProviderEntry {
  name: string;
  displayName: string | null;
  baseUrl: string | null;
  envKey: string | null;
  wireApi: string | null;
  requiresOpenaiAuth: boolean;
  supportsWebsockets: boolean;
}

export interface CodexMcpServerEntry {
  name: string;
  transport: 'stdio' | 'streamable-http';
  command: string | null;
  args: string[];
  url: string | null;
  enabled: boolean;
  required: boolean;
  startupTimeoutSec: number | null;
  toolTimeoutSec: number | null;
  enabledTools: string[];
  disabledTools: string[];
  isCcsManaged: boolean;
  managementSurface: 'browser-settings' | null;
}

export interface CodexFeatureCatalogEntry {
  name: string;
  label: string;
  description: string;
}

export const CLIPROXY_NATIVE_CODEX_RECIPE = `model_provider = "cliproxy"

[model_providers.cliproxy]
name = "CLIProxy Codex"
base_url = "http://127.0.0.1:8317/api/provider/codex"
env_key = "CLIPROXY_API_KEY"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false`;

export const KNOWN_CODEX_FEATURE_NAMES = [
  'multi_agent',
  'unified_exec',
  'shell_snapshot',
  'apply_patch_freeform',
  'js_repl',
  'runtime_metrics',
  'prevent_idle_sleep',
  'fast_mode',
  'apps',
  'smart_approvals',
] as const;

export function getKnownCodexFeatures(): CodexFeatureCatalogEntry[] {
  return [
    {
      name: 'multi_agent',
      label: i18n.t('codex.featureMultiAgentLabel'),
      description: i18n.t('codex.featureMultiAgentDesc'),
    },
    {
      name: 'unified_exec',
      label: i18n.t('codex.featureUnifiedExecLabel'),
      description: i18n.t('codex.featureUnifiedExecDesc'),
    },
    {
      name: 'shell_snapshot',
      label: i18n.t('codex.featureShellSnapshotLabel'),
      description: i18n.t('codex.featureShellSnapshotDesc'),
    },
    {
      name: 'apply_patch_freeform',
      label: i18n.t('codex.featureApplyPatchLabel'),
      description: i18n.t('codex.featureApplyPatchDesc'),
    },
    {
      name: 'js_repl',
      label: i18n.t('codex.featureJsReplLabel'),
      description: i18n.t('codex.featureJsReplDesc'),
    },
    {
      name: 'runtime_metrics',
      label: i18n.t('codex.featureRuntimeMetricsLabel'),
      description: i18n.t('codex.featureRuntimeMetricsDesc'),
    },
    {
      name: 'prevent_idle_sleep',
      label: i18n.t('codex.featurePreventIdleSleepLabel'),
      description: i18n.t('codex.featurePreventIdleSleepDesc'),
    },
    {
      name: 'fast_mode',
      label: i18n.t('codex.featureFastModeLabel'),
      description: i18n.t('codex.featureFastModeDesc'),
    },
    {
      name: 'apps',
      label: i18n.t('codex.featureAppsLabel'),
      description: i18n.t('codex.featureAppsDesc'),
    },
    {
      name: 'smart_approvals',
      label: i18n.t('codex.featureSmartApprovalsLabel'),
      description: i18n.t('codex.featureSmartApprovalsDesc'),
    },
  ];
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
    : [];
}

export function readCodexTopLevelSettings(
  config: Record<string, unknown> | null
): CodexTopLevelSettingsView {
  return {
    model: asString(config?.model),
    modelReasoningEffort: asString(config?.model_reasoning_effort),
    modelContextWindow: asNumber(config?.model_context_window),
    modelAutoCompactTokenLimit: asNumber(config?.model_auto_compact_token_limit),
    modelProvider: asString(config?.model_provider),
    approvalPolicy: asString(config?.approval_policy),
    sandboxMode: asString(config?.sandbox_mode),
    webSearch: asString(config?.web_search),
    toolOutputTokenLimit: asNumber(config?.tool_output_token_limit),
    personality: asString(config?.personality),
  };
}

export function readCodexProjectTrust(
  config: Record<string, unknown> | null
): CodexProjectTrustEntry[] {
  const projects = asObject(config?.projects);
  if (!projects) return [];

  return Object.entries(projects)
    .map(([projectPath, value]) => {
      const trustLevel = asString(asObject(value)?.trust_level);
      return trustLevel ? { path: projectPath, trustLevel } : null;
    })
    .filter((entry): entry is CodexProjectTrustEntry => entry !== null)
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function readCodexProfiles(config: Record<string, unknown> | null): CodexProfileEntry[] {
  const profiles = asObject(config?.profiles);
  if (!profiles) return [];

  return Object.entries(profiles)
    .map(([name, value]) => ({ name, values: readCodexTopLevelSettings(asObject(value)) }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function readCodexModelProviders(
  config: Record<string, unknown> | null
): CodexModelProviderEntry[] {
  const providers = asObject(config?.model_providers);
  if (!providers) return [];

  return Object.entries(providers)
    .map(([name, value]) => {
      const provider = asObject(value);
      if (!provider) return null;
      return {
        name,
        displayName: asString(provider.name),
        baseUrl: asString(provider.base_url),
        envKey: asString(provider.env_key),
        wireApi: asString(provider.wire_api),
        requiresOpenaiAuth: provider.requires_openai_auth === true,
        supportsWebsockets: provider.supports_websockets === true,
      };
    })
    .filter((entry): entry is CodexModelProviderEntry => entry !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function readCodexMcpServers(config: Record<string, unknown> | null): CodexMcpServerEntry[] {
  const servers = asObject(config?.mcp_servers);
  if (!servers) return [];

  return Object.entries(servers)
    .map(([name, value]) => {
      const server = asObject(value);
      if (!server) return null;
      const transport = asString(server.command) ? 'stdio' : 'streamable-http';
      const startupTimeoutMs = asNumber(server.startup_timeout_ms);
      return {
        name,
        transport,
        command: asString(server.command),
        args: asStringArray(server.args),
        url: asString(server.url),
        enabled: server.enabled !== false,
        required: server.required === true,
        startupTimeoutSec:
          asNumber(server.startup_timeout_sec) ??
          (startupTimeoutMs !== null ? startupTimeoutMs / 1000 : null),
        toolTimeoutSec: asNumber(server.tool_timeout_sec),
        enabledTools: asStringArray(server.enabled_tools),
        disabledTools: asStringArray(server.disabled_tools),
        isCcsManaged: name === 'ccs_browser',
        managementSurface: name === 'ccs_browser' ? 'browser-settings' : null,
      };
    })
    .filter((entry): entry is CodexMcpServerEntry => entry !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function readCodexFeatureState(
  config: Record<string, unknown> | null
): Record<string, boolean | null> {
  const features = asObject(config?.features);
  const state: Record<string, boolean | null> = {};

  for (const featureName of KNOWN_CODEX_FEATURE_NAMES) {
    const value = features?.[featureName];
    state[featureName] = typeof value === 'boolean' ? value : null;
  }

  if (features) {
    for (const [name, value] of Object.entries(features)) {
      if (!(name in state)) {
        state[name] = typeof value === 'boolean' ? value : null;
      }
    }
  }

  return state;
}
