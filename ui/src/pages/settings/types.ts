/**
 * Settings Page Types
 * Type definitions for WebSearch, GlobalEnv, and Proxy configurations
 */

import type {
  BrowserEvalMode,
  BrowserToolPolicy,
  BrowserSettingsConfig,
  BrowserStatusPayload,
  CliproxyServerConfig,
  RemoteProxyStatus,
  UpdateBrowserSettingsPayload,
} from '@/lib/api-client';

// === WebSearch Types ===

export interface ProviderConfig {
  enabled?: boolean;
  url?: string;
  model?: string;
  timeout?: number;
  max_results?: number;
}

export type WebSearchApiKeyProviderId = 'exa' | 'tavily' | 'keenable' | 'brave';
export type WebSearchApiKeySource = 'global_env' | 'process_env' | 'both' | 'none';

export interface WebSearchApiKeyState {
  envVar: string;
  configured: boolean;
  available: boolean;
  source: WebSearchApiKeySource;
  maskedValue?: string;
}

export interface WebSearchProvidersConfig {
  exa?: ProviderConfig;
  tavily?: ProviderConfig;
  keenable?: ProviderConfig;
  brave?: ProviderConfig;
  searxng?: ProviderConfig;
  duckduckgo?: ProviderConfig;
  gemini?: ProviderConfig;
  grok?: ProviderConfig;
  opencode?: ProviderConfig;
}

export interface WebSearchConfig {
  enabled: boolean;
  providers?: WebSearchProvidersConfig;
  apiKeys?: Partial<Record<WebSearchApiKeyProviderId, WebSearchApiKeyState>>;
}

export interface WebSearchSavePayload {
  enabled?: boolean;
  providers?: WebSearchProvidersConfig;
  apiKeys?: Partial<Record<WebSearchApiKeyProviderId, string | null>>;
}

export interface CliStatus {
  id:
    | 'exa'
    | 'tavily'
    | 'keenable'
    | 'brave'
    | 'searxng'
    | 'duckduckgo'
    | 'gemini'
    | 'grok'
    | 'opencode';
  kind: 'backend' | 'legacy-cli';
  name?: string;
  enabled: boolean;
  available: boolean;
  command?: string;
  version: string | null;
  installCommand?: string;
  docsUrl?: string;
  requiresApiKey: boolean;
  apiKeyEnvVar?: string;
  description: string;
  detail: string;
}

export interface WebSearchStatus {
  providers: CliStatus[];
  readiness: {
    status: 'ready' | 'needs_setup' | 'unavailable';
    message: string;
  };
}

// === GlobalEnv Types ===

export interface GlobalEnvConfig {
  enabled: boolean;
  env: Record<string, string>;
}

// === Official Channels Types ===

export type OfficialChannelId = 'telegram' | 'discord' | 'imessage';

export interface OfficialChannelsConfig {
  selected: OfficialChannelId[];
  unattended: boolean;
}

export interface OfficialChannelStatus {
  id: OfficialChannelId;
  selected?: boolean;
  displayName: string;
  pluginSpec: string;
  summary: string;
  requiresToken: boolean;
  envKey?: string;
  tokenConfigured: boolean;
  tokenAvailable?: boolean;
  tokenSource?: 'saved_env' | 'process_env' | 'missing';
  tokenPath?: string;
  savedInClaudeState?: boolean;
  processEnvAvailable?: boolean;
  unavailableReason?: string;
  setup: {
    state: 'not_selected' | 'ready' | 'needs_token' | 'needs_claude_setup' | 'unavailable';
    label: string;
    detail: string;
    nextStep: string;
  };
  manualSetupCommands: string[];
}

export interface OfficialChannelsVersionStatus {
  current: string | null;
  minimum: string;
  state: 'supported' | 'unsupported' | 'unknown';
  message: string;
}

export interface OfficialChannelsAuthStatus {
  checked: boolean;
  loggedIn: boolean;
  authMethod: string | null;
  subscriptionType: string | null;
  state: 'eligible' | 'ineligible' | 'unknown';
  eligible: boolean;
  message: string;
  orgRequirementMessage?: string;
}

export interface OfficialChannelsStatus {
  bunInstalled: boolean;
  supportedProfiles: string[];
  supportMessage: string;
  accountStatusCaveat: string;
  stateScopeMessage: string;
  claudeVersion: OfficialChannelsVersionStatus;
  auth: OfficialChannelsAuthStatus;
  summary: {
    state: 'ready' | 'needs_setup' | 'limited';
    title: string;
    message: string;
    nextStep: string;
    blockers: string[];
  };
  launchPreview: {
    state: 'disabled' | 'blocked' | 'partial' | 'ready';
    title: string;
    detail: string;
    command: string;
    appendedArgs: string[];
    appliedChannels: OfficialChannelId[];
    permissionBypassIncluded: boolean;
    skippedMessages: string[];
  };
  channels: OfficialChannelStatus[];
}

// === Tab Types ===

export type SettingsTab =
  | 'browser'
  | 'websearch'
  | 'image'
  | 'channels'
  | 'globalenv'
  | 'proxy'
  | 'auth'
  | 'thinking'
  | 'backups';

// === Thinking Types ===

export type ThinkingMode = 'auto' | 'off' | 'manual';

export interface ThinkingTierDefaults {
  opus: string;
  sonnet: string;
  haiku: string;
}

export interface ThinkingConfig {
  mode: ThinkingMode;
  override?: string | number;
  tier_defaults: ThinkingTierDefaults;
  provider_overrides?: Record<string, Partial<ThinkingTierDefaults>>;
  show_warnings?: boolean;
}

// === Re-exports from api-client ===

export type { BrowserEvalMode, BrowserToolPolicy, CliproxyServerConfig, RemoteProxyStatus };
export type BrowserConfig = BrowserSettingsConfig;
export type BrowserStatus = BrowserStatusPayload;
export type BrowserSavePayload = UpdateBrowserSettingsPayload;
