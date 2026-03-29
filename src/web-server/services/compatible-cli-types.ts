import type { CompatibleCliDocsReference } from '../../shared/compatible-cli-contracts';

export type {
  CompatibleCliDocLink,
  CompatibleCliDocsReference,
  CompatibleCliProviderDocLink,
  CodexBinaryDiagnostics,
  CodexBinarySource,
  CodexConfigFileDiagnostics,
  CodexConfigPatchInput,
  CodexConfigPatchResult,
  CodexDashboardDiagnostics,
  CodexFeatureFlagDiagnostics,
  CodexMcpServerDiagnostics,
  CodexMcpServerPatchValues,
  CodexModelProviderDiagnostics,
  CodexModelProviderPatchValues,
  CodexProfilePatchValues,
  CodexProjectTrustDiagnostics,
  CodexRawConfigResponse,
  CodexSupportMatrixEntry,
  CodexTopLevelSettingsPatch,
  CodexUserConfigDiagnostics,
} from '../../shared/compatible-cli-contracts';

export type DroidBinarySource = 'CCS_DROID_PATH' | 'PATH' | 'missing';

export interface DroidBinaryDiagnostics {
  installed: boolean;
  path: string | null;
  installDir: string | null;
  source: DroidBinarySource;
  version: string | null;
  overridePath: string | null;
}

export interface DroidConfigFileDiagnostics {
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

export interface DroidCustomModelDiagnostics {
  displayName: string;
  model: string;
  provider: string;
  baseUrl: string;
  host: string | null;
  maxOutputTokens: number | null;
  isCcsManaged: boolean;
  apiKeyState: 'set' | 'missing';
  apiKeyPreview: string | null;
}

export interface DroidByokDiagnostics {
  activeModelSelector: string | null;
  customModelCount: number;
  ccsManagedCount: number;
  userManagedCount: number;
  invalidModelEntryCount: number;
  providerBreakdown: Record<string, number>;
  customModels: DroidCustomModelDiagnostics[];
}

export interface DroidDashboardDiagnostics {
  binary: DroidBinaryDiagnostics;
  files: {
    settings: DroidConfigFileDiagnostics;
    legacyConfig: DroidConfigFileDiagnostics;
  };
  byok: DroidByokDiagnostics;
  warnings: string[];
  docsReference: CompatibleCliDocsReference;
}

export interface DroidRawSettingsResponse {
  path: string;
  resolvedPath: string;
  exists: boolean;
  mtime: number;
  rawText: string;
  settings: Record<string, unknown> | null;
  parseError: string | null;
}
