export interface CodexTopLevelSettingsView {
  model: string | null;
  modelReasoningEffort: string | null;
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
}

export interface CodexFeatureCatalogEntry {
  name: string;
  label: string;
  description: string;
}

export const KNOWN_CODEX_FEATURES: CodexFeatureCatalogEntry[] = [
  {
    name: 'multi_agent',
    label: 'Multi-agent',
    description: 'Enable subagent collaboration tools.',
  },
  {
    name: 'unified_exec',
    label: 'Unified exec',
    description: 'Use the PTY-backed unified exec tool.',
  },
  {
    name: 'shell_snapshot',
    label: 'Shell snapshot',
    description: 'Reuse shell environment snapshots.',
  },
  {
    name: 'apply_patch_freeform',
    label: 'Apply patch',
    description: 'Enable freeform apply_patch edits.',
  },
  { name: 'js_repl', label: 'JS REPL', description: 'Enable the Node-backed JavaScript REPL.' },
  {
    name: 'runtime_metrics',
    label: 'Runtime metrics',
    description: 'Collect Codex runtime metrics.',
  },
  {
    name: 'prevent_idle_sleep',
    label: 'Prevent idle sleep',
    description: 'Keep the machine awake while active.',
  },
  { name: 'fast_mode', label: 'Fast mode', description: 'Allow the fast service tier path.' },
  { name: 'apps', label: 'Apps', description: 'Enable ChatGPT Apps and connectors support.' },
  {
    name: 'smart_approvals',
    label: 'Smart approvals',
    description: 'Route eligible approvals through the guardian flow.',
  },
];

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
      return {
        name,
        transport,
        command: asString(server.command),
        args: asStringArray(server.args),
        url: asString(server.url),
        enabled: server.enabled !== false,
        required: server.required === true,
        startupTimeoutSec: asNumber(server.startup_timeout_sec),
        toolTimeoutSec: asNumber(server.tool_timeout_sec),
        enabledTools: asStringArray(server.enabled_tools),
        disabledTools: asStringArray(server.disabled_tools),
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

  for (const feature of KNOWN_CODEX_FEATURES) {
    const value = features?.[feature.name];
    state[feature.name] = typeof value === 'boolean' ? value : null;
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
