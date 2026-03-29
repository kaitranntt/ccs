export interface CompatibleCliDocLink {
  id: string;
  label: string;
  url: string;
  category: 'overview' | 'configuration' | 'byok' | 'reference';
  source: 'factory' | 'provider' | 'openai' | 'github';
  description: string;
}

export interface CompatibleCliProviderDocLink {
  provider: string;
  label: string;
  apiFormat: string;
  url: string;
}

export interface CompatibleCliDocsReference {
  providerValues: string[];
  settingsHierarchy: string[];
  notes: string[];
  links: CompatibleCliDocLink[];
  providerDocs: CompatibleCliProviderDocLink[];
}

export interface CodexBinaryDiagnostics {
  installed: boolean;
  path: string | null;
  installDir: string | null;
  source: 'CCS_CODEX_PATH' | 'PATH' | 'missing';
  version: string | null;
  overridePath: string | null;
  supportsConfigOverrides: boolean;
}

export interface CodexConfigFileDiagnostics {
  label: string;
  path: string;
  resolvedPath: string;
  exists: boolean;
  isSymlink: boolean;
  isRegularFile: boolean;
  sizeBytes: number | null;
  mtimeMs: number | null;
  parseError: string | null;
  readError: string | null;
}

export interface CodexModelProviderDiagnostics {
  name: string;
  baseUrl: string | null;
  envKey: string | null;
  wireApi: string | null;
  requiresOpenaiAuth: boolean;
  supportsWebsockets: boolean;
  hasQueryParams: boolean;
  hasHttpHeaders: boolean;
  usesExperimentalBearerToken: boolean;
}

export interface CodexFeatureFlagDiagnostics {
  name: string;
  state: 'enabled' | 'disabled' | 'custom';
}

export interface CodexProjectTrustDiagnostics {
  path: string;
  trustLevel: string;
}

export interface CodexMcpServerDiagnostics {
  name: string;
  transport: 'stdio' | 'streamable-http' | 'unknown';
  enabled: boolean;
  required: boolean;
  startupTimeoutSec: number | null;
  toolTimeoutSec: number | null;
  enabledToolsCount: number;
  disabledToolsCount: number;
  usesInlineBearerToken: boolean;
}

export interface CodexSupportMatrixEntry {
  id: string;
  label: string;
  supported: boolean;
  notes: string;
}

export interface CodexUserConfigDiagnostics {
  model: string | null;
  modelProvider: string | null;
  activeProfile: string | null;
  approvalPolicy: string | null;
  sandboxMode: string | null;
  webSearch: string | null;
  topLevelKeys: string[];
  profileCount: number;
  profileNames: string[];
  modelProviderCount: number;
  modelProviders: CodexModelProviderDiagnostics[];
  featureCount: number;
  enabledFeatures: CodexFeatureFlagDiagnostics[];
  disabledFeatures: CodexFeatureFlagDiagnostics[];
  trustedProjectCount: number;
  untrustedProjectCount: number;
  projectTrust: CodexProjectTrustDiagnostics[];
  mcpServerCount: number;
  mcpServers: CodexMcpServerDiagnostics[];
}

export interface CodexDashboardDiagnostics {
  binary: CodexBinaryDiagnostics;
  file: CodexConfigFileDiagnostics;
  config: CodexUserConfigDiagnostics;
  supportMatrix: CodexSupportMatrixEntry[];
  warnings: string[];
  docsReference: CompatibleCliDocsReference;
}

export interface CodexRawConfigResponse {
  path: string;
  resolvedPath: string;
  exists: boolean;
  mtime: number;
  rawText: string;
  config: Record<string, unknown> | null;
  parseError: string | null;
}
