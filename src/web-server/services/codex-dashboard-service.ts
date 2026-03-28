import * as os from 'os';
import * as path from 'path';
import { expandPath } from '../../utils/helpers';
import {
  codexBinarySupportsConfigOverrides,
  getCodexBinaryInfo,
} from '../../targets/codex-detector';
import type {
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

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
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
    config: {
      model: asString(config?.model),
      modelProvider: asString(config?.model_provider),
      activeProfile,
      approvalPolicy: asString(config?.approval_policy),
      sandboxMode: asString(config?.sandbox_mode),
      webSearch: asString(config?.web_search),
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
