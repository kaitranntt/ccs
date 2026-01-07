/**
 * Auth Types and Configurations
 *
 * Type definitions and OAuth configurations for CLIProxy authentication.
 */

import { CLIProxyProvider } from '../types';
import { AccountInfo } from '../account-manager';

/**
 * OAuth callback ports used by CLIProxyAPI (hardcoded in binary)
 * See: https://github.com/router-for-me/CLIProxyAPI/tree/main/internal/auth
 *
 * OAuth flow types per provider:
 * - Gemini: Authorization Code Flow with local callback server on port 8085
 * - Codex:  Authorization Code Flow with local callback server on port 1455
 * - Agy:    Authorization Code Flow with local callback server on port 51121
 * - Kiro:   Authorization Code Flow with local callback server on port 9876
 * - iFlow:  Authorization Code Flow with local callback server on port 11451
 * - Claude: Authorization Code Flow with local callback server on port 54545 (Anthropic OAuth)
 * - Qwen:   Device Code Flow (polling-based, NO callback port needed)
 * - GHCP:   Device Code Flow (polling-based, NO callback port needed)
 */
export const OAUTH_CALLBACK_PORTS: Partial<Record<CLIProxyProvider, number>> = {
  gemini: 8085,
  kiro: 9876,
  codex: 1455,
  agy: 51121,
  iflow: 11451,
  // qwen: Device Code Flow - no callback port
  // ghcp: Device Code Flow - no callback port
};

/**
 * Auth status for a provider
 */
export interface AuthStatus {
  /** Provider name */
  provider: CLIProxyProvider;
  /** Whether authentication exists */
  authenticated: boolean;
  /** Path to token directory */
  tokenDir: string;
  /** Token file paths found */
  tokenFiles: string[];
  /** When last authenticated (if known) */
  lastAuth?: Date;
  /** Accounts registered for this provider (multi-account support) */
  accounts: AccountInfo[];
  /** Default account ID */
  defaultAccount?: string;
}

/**
 * OAuth config for each provider
 */
export interface ProviderOAuthConfig {
  /** Provider identifier */
  provider: CLIProxyProvider;
  /** Display name */
  displayName: string;
  /** OAuth authorization URL (for manual flow) */
  authUrl: string;
  /** Scopes required */
  scopes: string[];
  /** CLI flag for auth */
  authFlag: string;
}

/**
 * OAuth configurations per provider
 * Note: CLIProxyAPI handles actual OAuth - these are for display/manual flow
 */
export const OAUTH_CONFIGS: Record<CLIProxyProvider, ProviderOAuthConfig> = {
  gemini: {
    provider: 'gemini',
    displayName: 'Google Gemini',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scopes: ['https://www.googleapis.com/auth/generative-language'],
    authFlag: '--login',
  },
  codex: {
    provider: 'codex',
    displayName: 'Codex',
    authUrl: 'https://auth.openai.com/authorize',
    scopes: ['openid', 'profile'],
    authFlag: '--codex-login',
  },
  agy: {
    provider: 'agy',
    displayName: 'Antigravity',
    authUrl: 'https://antigravity.ai/oauth/authorize',
    scopes: ['api'],
    authFlag: '--antigravity-login',
  },
  qwen: {
    provider: 'qwen',
    displayName: 'Qwen Code',
    authUrl: 'https://chat.qwen.ai/api/v1/oauth2/device/code',
    scopes: ['openid', 'profile', 'email', 'model.completion'],
    authFlag: '--qwen-login',
  },
  iflow: {
    provider: 'iflow',
    displayName: 'iFlow',
    authUrl: 'https://iflow.cn/oauth',
    scopes: ['phone', 'profile', 'email'],
    authFlag: '--iflow-login',
  },
  kiro: {
    provider: 'kiro',
    displayName: 'Kiro (AWS)',
    authUrl: 'https://oidc.us-east-1.amazonaws.com',
    scopes: ['codewhisperer:completions', 'codewhisperer:conversations'],
    authFlag: '--kiro-login',
  },
  ghcp: {
    provider: 'ghcp',
    displayName: 'GitHub Copilot (OAuth)',
    authUrl: 'https://github.com/login/device/code',
    scopes: ['copilot'],
    authFlag: '--github-copilot-login',
  },
};

/**
 * Provider-specific auth file prefixes (fallback detection)
 * CLIProxyAPI names auth files with provider prefix (e.g., "antigravity-user@email.json")
 * Note: Gemini tokens may NOT have prefix - CLIProxyAPI uses {email}-{projectID}.json format
 */
export const PROVIDER_AUTH_PREFIXES: Record<CLIProxyProvider, string[]> = {
  gemini: ['gemini-', 'google-'],
  codex: ['codex-', 'openai-'],
  agy: ['antigravity-', 'agy-'],
  qwen: ['qwen-'],
  iflow: ['iflow-'],
  kiro: ['kiro-', 'aws-', 'codewhisperer-'],
  ghcp: ['github-copilot-', 'copilot-', 'gh-'],
};

/**
 * Provider type values inside token JSON files
 * CLIProxyAPI sets "type" field in token JSON (e.g., {"type": "gemini"})
 */
export const PROVIDER_TYPE_VALUES: Record<CLIProxyProvider, string[]> = {
  gemini: ['gemini'],
  codex: ['codex'],
  agy: ['antigravity'],
  qwen: ['qwen'],
  iflow: ['iflow'],
  kiro: ['kiro', 'codewhisperer'],
  ghcp: ['github-copilot', 'copilot'],
};

/**
 * Get OAuth config for provider
 */
export function getOAuthConfig(provider: CLIProxyProvider): ProviderOAuthConfig {
  const config = OAUTH_CONFIGS[provider];
  if (!config) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  return config;
}

/**
 * OAuth options for triggerOAuth
 */
export interface OAuthOptions {
  verbose?: boolean;
  headless?: boolean;
  account?: string;
  add?: boolean;
  nickname?: string;
  /** If true, triggered from Web UI (enables project selection prompt) */
  fromUI?: boolean;
  /** If true, use --no-incognito flag (Kiro only - use normal browser instead of incognito) */
  noIncognito?: boolean;
  /** If true, skip OAuth and import token from Kiro IDE directly (Kiro only) */
  import?: boolean;
}
