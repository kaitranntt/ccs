import * as os from 'os';
import * as path from 'path';
import { expandPath } from '../../utils/helpers';
import {
  codexBinarySupportsConfigOverrides,
  getCodexBinaryInfo,
} from '../../targets/codex-detector';
import type {
  CodexConfigPatchInput,
  CodexConfigPatchResult,
  CodexDashboardDiagnostics,
  CodexFeatureFlagDiagnostics,
  CodexMcpServerDiagnostics,
  CodexModelProviderDiagnostics,
  CodexProjectTrustDiagnostics,
  CodexRawConfigResponse,
  CodexSupportMatrixEntry,
} from './compatible-cli-types';
import {
  TomlFileConflictError,
  TomlFileValidationError,
  probeTomlObjectFile,
  stringifyTomlObject,
  writeTomlFileAtomic,
} from './compatible-cli-toml-file-service';
import { getCompatibleCliDocsReference } from './compatible-cli-docs-registry';

interface CodexConfigPaths {
  configPath: string;
  configDisplayPath: string;
  baseDir: string;
  baseDirDisplay: string;
}

interface SaveCodexRawConfigInput {
  rawText: string;
  expectedMtime?: number;
}

interface SaveCodexRawConfigResult {
  success: true;
  mtime: number;
}

export {
  TomlFileConflictError as CodexRawConfigConflictError,
  TomlFileValidationError as CodexRawConfigValidationError,
};

const KNOWN_CODEX_FEATURES = new Set([
  'apps',
  'apply_patch_freeform',
  'codex_hooks',
  'fast_mode',
  'js_repl',
  'multi_agent',
  'personality',
  'prevent_idle_sleep',
  'runtime_metrics',
  'shell_snapshot',
  'shell_tool',
  'smart_approvals',
  'unified_exec',
  'undo',
  'web_search',
  'web_search_cached',
  'web_search_request',
]);
const MODEL_REASONING_EFFORT_VALUES = new Set(['minimal', 'low', 'medium', 'high', 'xhigh']);
const APPROVAL_POLICY_VALUES = new Set(['on-request', 'never', 'untrusted']);
const SANDBOX_MODE_VALUES = new Set(['read-only', 'workspace-write', 'danger-full-access']);
const WEB_SEARCH_VALUES = new Set(['cached', 'live', 'disabled']);
const PERSONALITY_VALUES = new Set(['default', 'pragmatic', 'concise', 'direct']);
const PROJECT_TRUST_LEVEL_VALUES = new Set(['trusted', 'ask']);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asObject(value: unknown): Record<string, unknown> | null {
  return isObject(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function ensureObject(target: Record<string, unknown>, key: string): Record<string, unknown> {
  const existing = asObject(target[key]);
  if (existing) return existing;

  const next: Record<string, unknown> = {};
  target[key] = next;
  return next;
}

function deleteIfEmpty(target: Record<string, unknown>, key: string) {
  const value = asObject(target[key]);
  if (value && Object.keys(value).length === 0) {
    delete target[key];
  }
}

function setStringField(target: Record<string, unknown>, key: string, value: unknown) {
  if (!isNonEmptyString(value)) {
    delete target[key];
    return;
  }
  target[key] = value.trim();
}

function setEnumStringField(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
  allowedValues: Set<string>,
  label: string
) {
  if (!isNonEmptyString(value)) {
    delete target[key];
    return;
  }

  const normalized = value.trim();
  if (!allowedValues.has(normalized)) {
    throw new TomlFileValidationError(
      `${label} must be one of: ${Array.from(allowedValues).join(', ')}.`
    );
  }

  target[key] = normalized;
}

function setBooleanField(target: Record<string, unknown>, key: string, value: unknown) {
  if (typeof value !== 'boolean') {
    delete target[key];
    return;
  }
  target[key] = value;
}

function setNumberField(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
  options: { integer?: boolean; min?: number } = {}
) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    delete target[key];
    return;
  }

  if (options.integer && !Number.isInteger(value)) {
    throw new TomlFileValidationError(`${key} must be an integer.`);
  }
  if (typeof options.min === 'number' && value < options.min) {
    throw new TomlFileValidationError(`${key} must be >= ${options.min}.`);
  }

  target[key] = value;
}

function normalizeStringArray(value: unknown, label: string): string[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) {
    throw new TomlFileValidationError(`${label} must be an array of strings.`);
  }

  const normalized = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
  return normalized.length > 0 ? normalized : [];
}

function assertPatchableToml(fileProbe: {
  diagnostics: { parseError: string | null; readError: string | null };
  config: Record<string, unknown> | null;
}): Record<string, unknown> {
  if (fileProbe.diagnostics.readError) {
    throw new TomlFileValidationError(fileProbe.diagnostics.readError);
  }
  if (fileProbe.diagnostics.parseError) {
    throw new TomlFileValidationError(
      'config.toml contains invalid TOML. Fix the raw file before using guided controls.'
    );
  }
  return asObject(fileProbe.config) ?? {};
}

function applyTopLevelSettingsPatch(
  target: Record<string, unknown>,
  values: Extract<CodexConfigPatchInput, { kind: 'top-level' }>['values']
) {
  if (hasOwn(values, 'model')) setStringField(target, 'model', values.model);
  if (hasOwn(values, 'modelReasoningEffort')) {
    setEnumStringField(
      target,
      'model_reasoning_effort',
      values.modelReasoningEffort,
      MODEL_REASONING_EFFORT_VALUES,
      'model_reasoning_effort'
    );
  }
  if (hasOwn(values, 'modelProvider')) {
    setStringField(target, 'model_provider', values.modelProvider);
  }
  if (hasOwn(values, 'approvalPolicy')) {
    setEnumStringField(
      target,
      'approval_policy',
      values.approvalPolicy,
      APPROVAL_POLICY_VALUES,
      'approval_policy'
    );
  }
  if (hasOwn(values, 'sandboxMode')) {
    setEnumStringField(
      target,
      'sandbox_mode',
      values.sandboxMode,
      SANDBOX_MODE_VALUES,
      'sandbox_mode'
    );
  }
  if (hasOwn(values, 'webSearch')) {
    setEnumStringField(target, 'web_search', values.webSearch, WEB_SEARCH_VALUES, 'web_search');
  }
  if (hasOwn(values, 'toolOutputTokenLimit')) {
    setNumberField(target, 'tool_output_token_limit', values.toolOutputTokenLimit, {
      integer: true,
      min: 1,
    });
  }
  if (hasOwn(values, 'personality')) {
    setEnumStringField(
      target,
      'personality',
      values.personality,
      PERSONALITY_VALUES,
      'personality'
    );
  }
}

function applyProjectTrustPatch(
  target: Record<string, unknown>,
  input: Extract<CodexConfigPatchInput, { kind: 'project-trust' }>
) {
  if (!isNonEmptyString(input.path)) {
    throw new TomlFileValidationError('Project path is required.');
  }

  const expandedPath = expandPath(input.path.trim());
  if (!path.isAbsolute(expandedPath)) {
    throw new TomlFileValidationError('Project path must be absolute or use ~/... expansion.');
  }
  const canonicalPath = path.resolve(expandedPath);
  const projects = ensureObject(target, 'projects');

  if (!isNonEmptyString(input.trustLevel)) {
    delete projects[canonicalPath];
    deleteIfEmpty(target, 'projects');
    return;
  }

  const trustLevel = input.trustLevel.trim();
  if (!PROJECT_TRUST_LEVEL_VALUES.has(trustLevel)) {
    throw new TomlFileValidationError(
      `trust_level must be one of: ${Array.from(PROJECT_TRUST_LEVEL_VALUES).join(', ')}.`
    );
  }

  projects[canonicalPath] = {
    ...(asObject(projects[canonicalPath]) ?? {}),
    trust_level: trustLevel,
  };
}

function applyFeaturePatch(
  target: Record<string, unknown>,
  input: Extract<CodexConfigPatchInput, { kind: 'feature' }>
) {
  const feature = input.feature.trim();
  const currentFeatures = asObject(target.features);
  if (
    !feature ||
    (!KNOWN_CODEX_FEATURES.has(feature) && !(currentFeatures && hasOwn(currentFeatures, feature)))
  ) {
    throw new TomlFileValidationError(`Unsupported feature key "${input.feature}".`);
  }
  if (input.enabled !== null && typeof input.enabled !== 'boolean') {
    throw new TomlFileValidationError('Feature enabled must be boolean or null.');
  }

  const features = ensureObject(target, 'features');
  if (input.enabled === null) {
    delete features[feature];
  } else {
    features[feature] = input.enabled;
  }
  deleteIfEmpty(target, 'features');
}

function applyProfilePatch(
  target: Record<string, unknown>,
  input: Extract<CodexConfigPatchInput, { kind: 'profile' }>
) {
  if (!isNonEmptyString(input.name)) {
    throw new TomlFileValidationError('Profile name is required.');
  }

  const profileName = input.name.trim();

  if (!['set-active', 'upsert', 'delete'].includes(input.action)) {
    throw new TomlFileValidationError('Unsupported profile action.');
  }

  if (input.action === 'set-active') {
    setStringField(target, 'profile', profileName);
    return;
  }

  const profiles = ensureObject(target, 'profiles');
  if (input.action === 'delete') {
    delete profiles[profileName];
    if (asString(target.profile) === profileName) {
      delete target.profile;
    }
    deleteIfEmpty(target, 'profiles');
    return;
  }

  const nextProfile = { ...(asObject(profiles[profileName]) ?? {}) };
  applyTopLevelSettingsPatch(nextProfile, input.values ?? {});
  if (Object.keys(nextProfile).length === 0) {
    throw new TomlFileValidationError('Profile patch must include at least one saved field.');
  }
  profiles[profileName] = nextProfile;
  if (input.setAsActive === true) {
    target.profile = profileName;
  }
}

function applyModelProviderPatch(
  target: Record<string, unknown>,
  input: Extract<CodexConfigPatchInput, { kind: 'model-provider' }>
) {
  if (!isNonEmptyString(input.name)) {
    throw new TomlFileValidationError('Model provider name is required.');
  }
  const providerName = input.name.trim();
  const providers = ensureObject(target, 'model_providers');

  if (!['upsert', 'delete'].includes(input.action)) {
    throw new TomlFileValidationError('Unsupported model provider action.');
  }

  if (input.action === 'delete') {
    delete providers[providerName];
    if (asString(target.model_provider) === providerName) {
      delete target.model_provider;
    }
    deleteIfEmpty(target, 'model_providers');
    return;
  }

  const values = input.values;
  if (!values) {
    throw new TomlFileValidationError('Model provider values are required.');
  }

  const nextProvider = { ...(asObject(providers[providerName]) ?? {}) };
  if (hasOwn(values, 'displayName')) setStringField(nextProvider, 'name', values.displayName);
  if (hasOwn(values, 'baseUrl')) setStringField(nextProvider, 'base_url', values.baseUrl);
  if (hasOwn(values, 'envKey')) setStringField(nextProvider, 'env_key', values.envKey);
  if (hasOwn(values, 'wireApi')) {
    if (values.wireApi !== null && values.wireApi !== undefined && values.wireApi !== 'responses') {
      throw new TomlFileValidationError('wire_api must be "responses" for Codex model providers.');
    }
    setStringField(nextProvider, 'wire_api', values.wireApi);
  }
  if (hasOwn(values, 'requiresOpenaiAuth')) {
    setBooleanField(nextProvider, 'requires_openai_auth', values.requiresOpenaiAuth);
  }
  if (hasOwn(values, 'supportsWebsockets')) {
    setBooleanField(nextProvider, 'supports_websockets', values.supportsWebsockets);
  }

  if (Object.keys(nextProvider).length === 0) {
    throw new TomlFileValidationError(
      'Model provider patch must include at least one saved field.'
    );
  }
  providers[providerName] = nextProvider;
}

function applyMcpServerPatch(
  target: Record<string, unknown>,
  input: Extract<CodexConfigPatchInput, { kind: 'mcp-server' }>
) {
  if (!isNonEmptyString(input.name)) {
    throw new TomlFileValidationError('MCP server name is required.');
  }

  const serverName = input.name.trim();
  const servers = ensureObject(target, 'mcp_servers');

  if (!['upsert', 'delete'].includes(input.action)) {
    throw new TomlFileValidationError('Unsupported MCP server action.');
  }

  if (input.action === 'delete') {
    delete servers[serverName];
    deleteIfEmpty(target, 'mcp_servers');
    return;
  }

  const values = input.values;
  if (!values) {
    throw new TomlFileValidationError('MCP server values are required.');
  }
  if (values.transport !== 'stdio' && values.transport !== 'streamable-http') {
    throw new TomlFileValidationError('MCP transport must be "stdio" or "streamable-http".');
  }

  const nextServer = { ...(asObject(servers[serverName]) ?? {}) };
  if (values.transport === 'stdio') {
    if (!isNonEmptyString(values.command)) {
      throw new TomlFileValidationError('Stdio MCP servers require a command.');
    }
    nextServer.command = values.command.trim();
    const nextArgs = normalizeStringArray(values.args, 'args');
    if (nextArgs === null) {
      delete nextServer.args;
    } else {
      nextServer.args = nextArgs;
    }
    delete nextServer.url;
  } else {
    if (!isNonEmptyString(values.url)) {
      throw new TomlFileValidationError('HTTP MCP servers require a URL.');
    }
    nextServer.url = values.url.trim();
    delete nextServer.command;
    delete nextServer.args;
  }

  if (hasOwn(values, 'enabled')) setBooleanField(nextServer, 'enabled', values.enabled);
  if (hasOwn(values, 'required')) setBooleanField(nextServer, 'required', values.required);
  if (hasOwn(values, 'startupTimeoutSec')) {
    setNumberField(nextServer, 'startup_timeout_sec', values.startupTimeoutSec, {
      integer: true,
      min: 1,
    });
  }
  if (hasOwn(values, 'toolTimeoutSec')) {
    setNumberField(nextServer, 'tool_timeout_sec', values.toolTimeoutSec, {
      integer: true,
      min: 1,
    });
  }
  if (hasOwn(values, 'enabledTools')) {
    const nextEnabledTools = normalizeStringArray(values.enabledTools, 'enabledTools');
    if (nextEnabledTools === null) {
      delete nextServer.enabled_tools;
    } else {
      nextServer.enabled_tools = nextEnabledTools;
    }
  }
  if (hasOwn(values, 'disabledTools')) {
    const nextDisabledTools = normalizeStringArray(values.disabledTools, 'disabledTools');
    if (nextDisabledTools === null) {
      delete nextServer.disabled_tools;
    } else {
      nextServer.disabled_tools = nextDisabledTools;
    }
  }

  servers[serverName] = nextServer;
}

function parseTransport(server: Record<string, unknown>): CodexMcpServerDiagnostics['transport'] {
  if (asString(server.command)) return 'stdio';
  if (asString(server.url)) return 'streamable-http';
  return 'unknown';
}

export function resolveCodexConfigPaths(
  options: {
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    homeDir?: string;
  } = {}
): CodexConfigPaths {
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? os.homedir();
  const baseDir = env.CODEX_HOME ? expandPath(env.CODEX_HOME) : path.join(homeDir, '.codex');
  const baseDirDisplay = env.CODEX_HOME ? '$CODEX_HOME' : '~/.codex';

  return {
    baseDir,
    baseDirDisplay,
    configPath: path.join(baseDir, 'config.toml'),
    configDisplayPath: `${baseDirDisplay}/config.toml`,
  };
}

export function summarizeCodexModelProviders(value: unknown): CodexModelProviderDiagnostics[] {
  const providers = asObject(value);
  if (!providers) return [];

  return Object.entries(providers)
    .map(([name, providerValue]) => {
      const provider = asObject(providerValue);
      if (!provider) return null;

      return {
        name,
        baseUrl: asString(provider.base_url),
        envKey: asString(provider.env_key),
        wireApi: asString(provider.wire_api),
        requiresOpenaiAuth: provider.requires_openai_auth === true,
        supportsWebsockets: provider.supports_websockets === true,
        hasQueryParams:
          isObject(provider.query_params) && Object.keys(provider.query_params).length > 0,
        hasHttpHeaders:
          (isObject(provider.http_headers) && Object.keys(provider.http_headers).length > 0) ||
          (isObject(provider.env_http_headers) &&
            Object.keys(provider.env_http_headers).length > 0),
        usesExperimentalBearerToken: asString(provider.experimental_bearer_token) !== null,
      } satisfies CodexModelProviderDiagnostics;
    })
    .filter((provider): provider is CodexModelProviderDiagnostics => provider !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function summarizeCodexFeatureFlags(value: unknown): {
  all: CodexFeatureFlagDiagnostics[];
  enabled: CodexFeatureFlagDiagnostics[];
  disabled: CodexFeatureFlagDiagnostics[];
} {
  const features = asObject(value);
  if (!features) {
    return { all: [], enabled: [], disabled: [] };
  }

  const all = Object.entries(features)
    .map(([name, rawValue]) => {
      const state = rawValue === true ? 'enabled' : rawValue === false ? 'disabled' : 'custom';
      return { name, state } satisfies CodexFeatureFlagDiagnostics;
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    all,
    enabled: all.filter((feature) => feature.state === 'enabled'),
    disabled: all.filter((feature) => feature.state === 'disabled'),
  };
}

export function summarizeCodexProjectTrust(value: unknown): CodexProjectTrustDiagnostics[] {
  const projects = asObject(value);
  if (!projects) return [];

  return Object.entries(projects)
    .map(([projectPath, projectValue]) => {
      const project = asObject(projectValue);
      const trustLevel = project ? asString(project.trust_level) : null;
      if (!trustLevel) return null;
      return { path: projectPath, trustLevel } satisfies CodexProjectTrustDiagnostics;
    })
    .filter((project): project is CodexProjectTrustDiagnostics => project !== null)
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function summarizeCodexMcpServers(value: unknown): CodexMcpServerDiagnostics[] {
  const servers = asObject(value);
  if (!servers) return [];

  return Object.entries(servers)
    .map(([name, serverValue]) => {
      const server = asObject(serverValue);
      if (!server) return null;

      const startupTimeoutMs = asNumber(server.startup_timeout_ms);
      const startupTimeoutSec =
        asNumber(server.startup_timeout_sec) ?? (startupTimeoutMs ? startupTimeoutMs / 1000 : null);

      return {
        name,
        transport: parseTransport(server),
        enabled: server.enabled !== false,
        required: server.required === true,
        startupTimeoutSec,
        toolTimeoutSec: asNumber(server.tool_timeout_sec),
        enabledToolsCount: Array.isArray(server.enabled_tools) ? server.enabled_tools.length : 0,
        disabledToolsCount: Array.isArray(server.disabled_tools) ? server.disabled_tools.length : 0,
        usesInlineBearerToken: hasOwn(server, 'bearer_token'),
      } satisfies CodexMcpServerDiagnostics;
    })
    .filter((server): server is CodexMcpServerDiagnostics => server !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function getCodexSupportMatrix(): CodexSupportMatrixEntry[] {
  return [
    {
      id: 'default',
      label: 'default',
      supported: true,
      notes: 'Uses the local Codex CLI with existing native auth and config.',
    },
    {
      id: 'cliproxy-provider-codex',
      label: 'cliproxy provider=codex',
      supported: true,
      notes: 'Routed through the CLIProxy Codex Responses bridge.',
    },
    {
      id: 'settings-with-bridge',
      label: 'settings with bridge metadata',
      supported: true,
      notes: 'Supported when the resolved API profile points at a Codex CLIProxy bridge.',
    },
    {
      id: 'cliproxy-composite',
      label: 'cliproxy composite',
      supported: false,
      notes: 'Not yet proven safe for native Codex routing in CCS v1.',
    },
    {
      id: 'settings-generic-api',
      label: 'settings generic API profile',
      supported: false,
      notes: 'Generic API profiles stay on Claude or Droid targets.',
    },
    {
      id: 'account',
      label: 'account',
      supported: false,
      notes: 'Account isolation remains a Claude-oriented concept.',
    },
    {
      id: 'copilot',
      label: 'copilot',
      supported: false,
      notes: 'GitHub Copilot flow is not a native Codex target path.',
    },
  ];
}

export async function getCodexDashboardDiagnostics(): Promise<CodexDashboardDiagnostics> {
  const paths = resolveCodexConfigPaths();
  const binaryInfo = getCodexBinaryInfo();
  const docsReference = getCompatibleCliDocsReference('codex');
  const fileProbe = await probeTomlObjectFile(
    paths.configPath,
    'Codex user config',
    paths.configDisplayPath
  );
  const config = asObject(fileProbe.config);
  const topLevelKeys = config
    ? Object.keys(config).sort((left, right) => left.localeCompare(right))
    : [];
  const activeProfile = asString(config?.profile);
  const profileNames = Object.keys(asObject(config?.profiles) ?? {}).sort((left, right) =>
    left.localeCompare(right)
  );
  const modelProviders = summarizeCodexModelProviders(config?.model_providers);
  const features = summarizeCodexFeatureFlags(config?.features);
  const projectTrust = summarizeCodexProjectTrust(config?.projects);
  const mcpServers = summarizeCodexMcpServers(config?.mcp_servers);
  const supportMatrix = getCodexSupportMatrix();

  const warnings: string[] = [];
  if (!binaryInfo) {
    warnings.push('Codex binary is not detected in PATH or CCS_CODEX_PATH.');
  } else if (!codexBinarySupportsConfigOverrides(binaryInfo)) {
    warnings.push(
      'This Codex build does not expose --config overrides required for CCS-backed Codex routing.'
    );
  }

  if (fileProbe.diagnostics.parseError) {
    warnings.push(`${paths.configDisplayPath} contains invalid TOML.`);
  }
  if (activeProfile && !profileNames.includes(activeProfile)) {
    warnings.push(`Active profile "${activeProfile}" is selected but missing from [profiles].`);
  }
  if (modelProviders.some((provider) => provider.usesExperimentalBearerToken)) {
    warnings.push(
      'One or more model_providers entries use experimental_bearer_token; prefer env_key-backed auth.'
    );
  }
  if (mcpServers.some((server) => server.usesInlineBearerToken)) {
    warnings.push(
      'One or more mcp_servers entries include inline bearer_token; prefer bearer_token_env_var.'
    );
  }

  return {
    binary: {
      installed: !!binaryInfo,
      path: binaryInfo?.path ?? null,
      installDir: binaryInfo?.path ? path.dirname(binaryInfo.path) : null,
      source: process.env.CCS_CODEX_PATH ? 'CCS_CODEX_PATH' : binaryInfo ? 'PATH' : 'missing',
      version: binaryInfo?.version ?? null,
      overridePath: process.env.CCS_CODEX_PATH || null,
      supportsConfigOverrides: codexBinarySupportsConfigOverrides(binaryInfo),
    },
    file: fileProbe.diagnostics,
    workspacePath: process.cwd(),
    config: {
      model: asString(config?.model),
      modelReasoningEffort: asString(config?.model_reasoning_effort),
      modelProvider: asString(config?.model_provider),
      activeProfile,
      approvalPolicy: asString(config?.approval_policy),
      sandboxMode: asString(config?.sandbox_mode),
      webSearch: asString(config?.web_search),
      toolOutputTokenLimit: asNumber(config?.tool_output_token_limit),
      personality: asString(config?.personality),
      topLevelKeys,
      profileCount: profileNames.length,
      profileNames,
      modelProviderCount: modelProviders.length,
      modelProviders,
      featureCount: features.all.length,
      enabledFeatures: features.enabled,
      disabledFeatures: features.disabled,
      trustedProjectCount: projectTrust.filter((entry) => entry.trustLevel === 'trusted').length,
      untrustedProjectCount: projectTrust.filter((entry) => entry.trustLevel !== 'trusted').length,
      projectTrust,
      mcpServerCount: mcpServers.length,
      mcpServers,
    },
    supportMatrix,
    warnings,
    docsReference,
  };
}

export async function getCodexRawConfig(): Promise<CodexRawConfigResponse> {
  const paths = resolveCodexConfigPaths();
  const fileProbe = await probeTomlObjectFile(
    paths.configPath,
    'Codex user config',
    paths.configDisplayPath
  );

  return {
    path: paths.configDisplayPath,
    resolvedPath: paths.configPath,
    exists: fileProbe.diagnostics.exists,
    mtime: fileProbe.diagnostics.mtimeMs ?? Date.now(),
    rawText: fileProbe.rawText,
    config: fileProbe.config,
    parseError: fileProbe.diagnostics.parseError,
  };
}

export async function saveCodexRawConfig(
  input: SaveCodexRawConfigInput
): Promise<SaveCodexRawConfigResult> {
  const paths = resolveCodexConfigPaths();
  if (typeof input.rawText !== 'string') {
    throw new TomlFileValidationError('rawText must be a string.');
  }

  const saved = await writeTomlFileAtomic({
    filePath: paths.configPath,
    rawText: input.rawText,
    expectedMtime: input.expectedMtime,
    fileLabel: 'config.toml',
  });

  return { success: true, mtime: saved.mtime };
}

export async function patchCodexConfig(
  input: CodexConfigPatchInput
): Promise<CodexConfigPatchResult> {
  const paths = resolveCodexConfigPaths();
  const fileProbe = await probeTomlObjectFile(
    paths.configPath,
    'Codex user config',
    paths.configDisplayPath
  );
  const nextConfig = { ...assertPatchableToml(fileProbe) };

  switch (input.kind) {
    case 'top-level':
      applyTopLevelSettingsPatch(nextConfig, input.values);
      break;
    case 'project-trust':
      applyProjectTrustPatch(nextConfig, input);
      break;
    case 'feature':
      applyFeaturePatch(nextConfig, input);
      break;
    case 'profile':
      applyProfilePatch(nextConfig, input);
      break;
    case 'model-provider':
      applyModelProviderPatch(nextConfig, input);
      break;
    case 'mcp-server':
      applyMcpServerPatch(nextConfig, input);
      break;
    default:
      throw new TomlFileValidationError('Unsupported Codex config patch.');
  }

  const rawText = stringifyTomlObject(nextConfig);
  const saved = await writeTomlFileAtomic({
    filePath: paths.configPath,
    rawText,
    expectedMtime: input.expectedMtime,
    fileLabel: 'config.toml',
  });

  return {
    success: true,
    path: paths.configDisplayPath,
    resolvedPath: paths.configPath,
    exists: true,
    mtime: saved.mtime,
    rawText,
    config: nextConfig,
    parseError: null,
  };
}
