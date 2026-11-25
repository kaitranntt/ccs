import { request, type CliTarget, type CliproxyBridgeMetadata } from './core';

export interface Profile {
  name: string;
  settingsPath: string;
  configured: boolean;
  target?: CliTarget;
  cliproxyBridge?: CliproxyBridgeMetadata | null;
}

export type LocalRuntimeStatus = 'ready' | 'missing-model' | 'offline';

export interface LocalRuntimeReadiness {
  id: 'ollama' | 'llamacpp';
  name: string;
  endpoint: string;
  status: LocalRuntimeStatus;
  commandHint: string;
  recommendedModel: string | null;
  recommendedModelInstalled: boolean;
  detectedModelCount: number;
}

export interface LocalRuntimeReadinessResponse {
  runtimes: LocalRuntimeReadiness[];
}

export interface CreateProfile {
  name: string;
  baseUrl: string;
  apiKey: string;
  model?: string;
  extraModels?: string;
  opusModel?: string;
  sonnetModel?: string;
  haikuModel?: string;
  target?: CliTarget;
}

export interface UpdateProfile {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  extraModels?: string;
  opusModel?: string;
  sonnetModel?: string;
  haikuModel?: string;
  target?: CliTarget;
}

export interface ProfileValidationIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  field?: string;
  hint?: string;
}

export interface ProfileValidationSummary {
  valid: boolean;
  issues: ProfileValidationIssue[];
}

export interface ApiProfileOrphanCandidate {
  name: string;
  settingsPath: string;
  validation: ProfileValidationSummary;
}

export interface DiscoverProfileOrphansResponse {
  orphans: ApiProfileOrphanCandidate[];
}

export interface RegisterProfileOrphansRequest {
  names?: string[];
  target?: CliTarget;
  force?: boolean;
}

export interface RegisterProfileOrphansResponse {
  registered: string[];
  skipped: Array<{ name: string; reason: string }>;
}

export interface CopyProfileRequest {
  destination: string;
  target?: CliTarget;
  force?: boolean;
}

export interface CopyProfileResponse {
  success: boolean;
  name?: string;
  settingsPath?: string;
  warnings?: string[];
}

export interface ApiProfileExportBundle {
  schemaVersion: 1;
  exportedAt: string;
  profile: {
    name: string;
    target: CliTarget;
  };
  settings: Record<string, unknown>;
}

export interface ExportProfileResponse {
  success: boolean;
  bundle: ApiProfileExportBundle;
  redacted?: boolean;
}

export interface ImportProfileRequest {
  bundle: ApiProfileExportBundle;
  name?: string;
  target?: CliTarget;
  force?: boolean;
}

export interface ImportProfileResponse {
  success: boolean;
  name?: string;
  warnings?: string[];
  validation?: ProfileValidationSummary;
}

/** Model preset for quick model switching */
export interface ModelPreset {
  name: string;
  default: string;
  opus: string;
  sonnet: string;
  haiku: string;
}

export interface CreatePreset {
  name: string;
  default: string;
  opus?: string;
  sonnet?: string;
  haiku?: string;
}

export const profilesApi = {
  list: () => request<{ profiles: Profile[] }>('/profiles'),
  getLocalRuntimeReadiness: () =>
    request<LocalRuntimeReadinessResponse>('/profiles/local-runtime-readiness'),
  create: (data: CreateProfile) =>
    request('/profiles', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (name: string, data: UpdateProfile) =>
    request(`/profiles/${name}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (name: string) => request(`/profiles/${name}`, { method: 'DELETE' }),
  discoverOrphans: () => request<DiscoverProfileOrphansResponse>('/profiles/orphans'),
  registerOrphans: (data: RegisterProfileOrphansRequest) =>
    request<RegisterProfileOrphansResponse>('/profiles/orphans/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  copy: (name: string, data: CopyProfileRequest) =>
    request<CopyProfileResponse>(`/profiles/${name}/copy`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  export: (name: string, includeSecrets = false) =>
    request<ExportProfileResponse>(`/profiles/${name}/export`, {
      method: 'POST',
      body: JSON.stringify({ includeSecrets }),
    }),
  import: (data: ImportProfileRequest) =>
    request<ImportProfileResponse>('/profiles/import', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

/** Model presets for quick model switching */
export const presetsApi = {
  list: (profile: string) => request<{ presets: ModelPreset[] }>(`/settings/${profile}/presets`),
  create: (profile: string, data: CreatePreset) =>
    request<{ preset: ModelPreset }>(`/settings/${profile}/presets`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  delete: (profile: string, name: string) =>
    request<{ success: boolean }>(`/settings/${profile}/presets/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),
};
