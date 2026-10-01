/**
 * CLIProxy configuration types (config.yaml, executor, proxy resolution)
 */

import type { CompositeTierConfig } from '../../config/unified-config-types';
import type {
  CLIProxyOAuthModelAliasConfig,
  CLIProxyPayloadConfig,
} from '../../config/schemas/cliproxy';
import type { CliproxyRoutingStrategy } from './provider-types';
import type { BrowserLaunchOverride } from '../../utils/browser/browser-policy';

/** CLIProxy config.yaml structure (minimal) */
export interface CLIProxyConfig {
  port: number;
  'api-keys': string[];
  'auth-dir': string;
  debug: boolean;
  'oauth-model-alias'?: CLIProxyOAuthModelAliasConfig;
  payload?: CLIProxyPayloadConfig;
  routing?: {
    strategy?: CliproxyRoutingStrategy;
    'session-affinity'?: boolean;
    'session-affinity-ttl'?: string;
    'claude-code-session-affinity'?: boolean;
  };
  'gemini-api-key'?: Array<{
    'api-key': string;
    'base-url'?: string;
  }>;
  'codex-api-key'?: Array<{
    'api-key': string;
    'base-url'?: string;
  }>;
  'claude-api-key'?: Array<{
    'api-key': string;
    'base-url'?: string;
    'proxy-url'?: string;
    prefix?: string;
    headers?: Record<string, string>;
    'excluded-models'?: string[];
    models?: Array<{
      name: string;
      alias: string;
    }>;
  }>;
  'vertex-api-key'?: Array<{
    'api-key': string;
    'base-url'?: string;
  }>;
  'openai-compatibility'?: Array<{
    name: string;
    'base-url': string;
    headers?: Record<string, string>;
    'api-key-entries': Array<{
      'api-key': string;
      'proxy-url'?: string;
    }>;
    models?: Array<{
      name: string;
      alias: string;
    }>;
  }>;
}

/** Executor configuration */
export interface ExecutorConfig {
  port: number;
  timeout: number;
  verbose: boolean;
  pollInterval: number;
  customSettingsPath?: string;
  isComposite?: boolean;
  compositeTiers?: {
    opus: CompositeTierConfig;
    sonnet: CompositeTierConfig;
    haiku: CompositeTierConfig;
  };
  compositeDefaultTier?: 'opus' | 'sonnet' | 'haiku';
  profileName?: string;
  claudeConfigDir?: string;
  browserRuntimeEnv?: Record<string, string>;
  /** `--browser` / `--no-browser`, already stripped from args by the dispatcher */
  browserLaunchOverride?: BrowserLaunchOverride;
}

/** Resolved proxy configuration after merging CLI > ENV > config.yaml > defaults */
export interface ResolvedProxyConfig {
  mode: 'local' | 'remote';
  host?: string;
  port: number;
  protocol: 'http' | 'https';
  authToken?: string;
  managementKey?: string;
  fallbackEnabled: boolean;
  autoStartLocal: boolean;
  remoteOnly: boolean;
  forceLocal: boolean;
  timeout?: number;
  allowSelfSigned?: boolean;
}
