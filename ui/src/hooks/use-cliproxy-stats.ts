/**
 * React Query hook for CLIProxyAPI stats
 */

import { useQueries, useQuery } from '@tanstack/react-query';
import type {
  ModelQuota,
  QuotaResult,
  CodexQuotaResult,
  ClaudeQuotaResult,
  GeminiCliQuotaResult,
  GhcpQuotaResult,
} from '@/lib/api-client';
import type { UnifiedQuotaResult } from '@/lib/utils';

/** Per-account usage statistics */
export interface AccountUsageStats {
  /** Provider-qualified lookup key (for example: "codex:user@example.com") */
  accountKey?: string;
  /** Canonical provider name reported by CLIProxyAPI */
  provider?: string;
  /** Raw account email or identifier */
  source: string;
  /** Number of successful requests */
  successCount: number;
  /** Number of failed requests */
  failureCount: number;
  /** Total tokens used */
  totalTokens: number;
  /** Last request timestamp */
  lastUsedAt?: string;
}

/** CLIProxy usage statistics */
export interface CliproxyStats {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  requestsByModel: Record<string, number>;
  requestsByProvider: Record<string, number>;
  /** Per-account usage breakdown */
  accountStats: Record<string, AccountUsageStats>;
  quotaExceededCount: number;
  retryCount: number;
  collectedAt: string;
}

/** CLIProxy running status */
export interface CliproxyStatus {
  running: boolean;
}

/**
 * Fetch CLIProxy stats from API
 */
async function fetchCliproxyStats(): Promise<CliproxyStats> {
  const response = await fetch('/api/cliproxy/stats');
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch stats');
  }
  return response.json();
}

/**
 * Fetch CLIProxy running status
 */
async function fetchCliproxyStatus(): Promise<CliproxyStatus> {
  const response = await fetch('/api/cliproxy/status');
  if (!response.ok) {
    throw new Error('Failed to fetch status');
  }
  return response.json();
}

/**
 * Hook to get CLIProxy running status
 */
export function useCliproxyStatus() {
  return useQuery({
    queryKey: ['cliproxy-status'],
    queryFn: fetchCliproxyStatus,
    refetchInterval: 10000, // Check every 10 seconds
    retry: 1,
  });
}

/**
 * Hook to get CLIProxy usage stats
 */
export function useCliproxyStats(enabled = true) {
  return useQuery({
    queryKey: ['cliproxy-stats'],
    queryFn: fetchCliproxyStats,
    enabled,
    refetchInterval: 5000, // Refresh every 5 seconds for near-real-time updates
    retry: 1,
    staleTime: 3000, // Consider data stale after 3 seconds
  });
}

/** CLIProxy model from /v1/models endpoint */
export interface CliproxyModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

/** Categorized models response */
export interface CliproxyModelsResponse {
  models: CliproxyModel[];
  byCategory: Record<string, CliproxyModel[]>;
  totalCount: number;
}

/**
 * Fetch CLIProxy models from API
 */
async function fetchCliproxyModels(): Promise<CliproxyModelsResponse> {
  const response = await fetch('/api/cliproxy/models');
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch models');
  }
  return response.json();
}

/**
 * Hook to get available CLIProxy models (categorized by provider)
 */
export function useCliproxyModels(enabled = true) {
  return useQuery({
    queryKey: ['cliproxy-models'],
    queryFn: fetchCliproxyModels,
    enabled,
    staleTime: 60000, // Models don't change often, cache for 1 minute
    retry: 1,
  });
}

/** Error log file metadata from CLIProxyAPI */
export interface CliproxyErrorLog {
  name: string;
  size: number;
  modified: number;
  /** Absolute path to the log file (injected by backend) */
  absolutePath?: string;
  /** HTTP status code extracted from log (injected by backend) */
  statusCode?: number;
  /** Model name extracted from request body (injected by backend) */
  model?: string;
}

/**
 * Fetch CLIProxy error logs from API
 */
async function fetchCliproxyErrorLogs(): Promise<CliproxyErrorLog[]> {
  const response = await fetch('/api/cliproxy/error-logs');
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch error logs');
  }
  const data = await response.json();
  return data.files ?? [];
}

/**
 * Fetch specific error log content
 */
async function fetchCliproxyErrorLogContent(name: string): Promise<string> {
  const response = await fetch(`/api/cliproxy/error-logs/${encodeURIComponent(name)}`);
  if (!response.ok) {
    throw new Error('Failed to fetch error log content');
  }
  return response.text();
}

/**
 * Hook to get CLIProxy error logs list
 */
export function useCliproxyErrorLogs(enabled = true) {
  return useQuery({
    queryKey: ['cliproxy-error-logs'],
    queryFn: fetchCliproxyErrorLogs,
    enabled,
    refetchInterval: 30000, // Refresh every 30 seconds
    retry: 1,
    staleTime: 10000,
  });
}

/**
 * Hook to get specific error log content
 */
export function useCliproxyErrorLogContent(name: string | null) {
  return useQuery({
    queryKey: ['cliproxy-error-log-content', name],
    queryFn: () => (name ? fetchCliproxyErrorLogContent(name) : Promise.resolve('')),
    enabled: !!name,
    staleTime: 60000, // Cache log content for 1 minute
  });
}

// Re-export for consumers
export type {
  ModelQuota,
  QuotaResult,
  CodexQuotaResult,
  ClaudeQuotaResult,
  GeminiCliQuotaResult,
  GhcpQuotaResult,
};

/** Providers with quota API support */
export const QUOTA_SUPPORTED_PROVIDERS = ['agy', 'codex', 'claude', 'gemini', 'ghcp'] as const;
export type QuotaSupportedProvider = (typeof QUOTA_SUPPORTED_PROVIDERS)[number];
const QUOTA_PROVIDER_ALIAS_MAP: Readonly<Record<string, QuotaSupportedProvider>> = {
  antigravity: 'agy',
  anthropic: 'claude',
  'gemini-cli': 'gemini',
  copilot: 'ghcp',
  'github-copilot': 'ghcp',
};

function normalizeQuotaProvider(provider: string): QuotaSupportedProvider | null {
  const normalized = provider.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if ((QUOTA_SUPPORTED_PROVIDERS as readonly string[]).includes(normalized)) {
    return normalized as QuotaSupportedProvider;
  }

  return QUOTA_PROVIDER_ALIAS_MAP[normalized] ?? null;
}

/**
 * Fetch account quota from generic API route
 */
async function fetchAccountQuota(provider: string, accountId: string): Promise<QuotaResult> {
  const response = await fetch(`/api/cliproxy/quota/${provider}/${encodeURIComponent(accountId)}`);
  if (!response.ok) {
    let message = 'Failed to fetch quota';
    try {
      const error = await response.json();
      message = error.message || message;
    } catch {
      // Use default message if response isn't JSON
    }
    throw new Error(message);
  }
  return response.json();
}

/**
 * Fetch Codex quota from API
 */
async function fetchCodexQuotaApi(accountId: string): Promise<CodexQuotaResult> {
  const response = await fetch(`/api/cliproxy/quota/codex/${encodeURIComponent(accountId)}`);
  if (!response.ok) {
    let message = 'Failed to fetch Codex quota';
    try {
      const error = await response.json();
      message = error.message || message;
    } catch {
      // Use default message if response isn't JSON
    }
    throw new Error(message);
  }
  return response.json();
}

/**
 * Fetch Claude quota from API
 */
async function fetchClaudeQuotaApi(accountId: string): Promise<ClaudeQuotaResult> {
  const response = await fetch(`/api/cliproxy/quota/claude/${encodeURIComponent(accountId)}`);
  if (!response.ok) {
    let message = 'Failed to fetch Claude quota';
    try {
      const error = await response.json();
      message = error.message || message;
    } catch {
      // Use default message if response isn't JSON
    }
    throw new Error(message);
  }
  return response.json();
}

/**
 * Fetch Gemini quota from API
 */
async function fetchGeminiQuotaApi(accountId: string): Promise<GeminiCliQuotaResult> {
  const response = await fetch(`/api/cliproxy/quota/gemini/${encodeURIComponent(accountId)}`);
  if (!response.ok) {
    let message = 'Failed to fetch Gemini quota';
    try {
      const error = await response.json();
      message = error.message || message;
    } catch {
      // Use default message if response isn't JSON
    }
    throw new Error(message);
  }
  return response.json();
}

/**
 * Fetch GitHub Copilot (ghcp) quota from API
 */
async function fetchGhcpQuotaApi(accountId: string): Promise<GhcpQuotaResult> {
  const response = await fetch(`/api/cliproxy/quota/ghcp/${encodeURIComponent(accountId)}`);
  if (!response.ok) {
    let message = 'Failed to fetch GitHub Copilot quota';
    try {
      const error = await response.json();
      message = error.message || message;
    } catch {
      // Use default message if response isn't JSON
    }
    throw new Error(message);
  }
  return response.json();
}

// Re-export unified type from utils for consumers
export type { UnifiedQuotaResult } from '@/lib/utils';

function getAccountQuotaQueryOptions(provider: string, accountId: string, enabled = true) {
  const canonicalProvider = normalizeQuotaProvider(provider);

  return {
    queryKey: ['account-quota', canonicalProvider ?? provider, accountId],
    queryFn: () => fetchQuotaByProvider(canonicalProvider ?? provider, accountId),
    enabled: enabled && !!canonicalProvider && !!accountId,
    staleTime: 60000,
    refetchInterval: 60000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1 as const,
  };
}

/**
 * Fetch quota by provider (dispatcher)
 */
async function fetchQuotaByProvider(
  provider: string,
  accountId: string
): Promise<UnifiedQuotaResult> {
  const canonicalProvider = normalizeQuotaProvider(provider);
  if (!canonicalProvider) {
    return fetchAccountQuota(provider, accountId);
  }

  switch (canonicalProvider) {
    case 'codex':
      return fetchCodexQuotaApi(accountId);
    case 'claude':
      return fetchClaudeQuotaApi(accountId);
    case 'gemini':
      return fetchGeminiQuotaApi(accountId);
    case 'ghcp':
      return fetchGhcpQuotaApi(accountId);
    default:
      return fetchAccountQuota(provider, accountId);
  }
}

/**
 * Hook to get account quota
 * Supports agy, codex, claude, gemini, and ghcp providers
 */
export function useAccountQuota(provider: string, accountId: string, enabled = true) {
  return useQuery(getAccountQuotaQueryOptions(provider, accountId, enabled));
}

export function useAccountQuotas(
  accounts: Array<{ provider: string; accountId: string }>,
  enabled = true
) {
  return useQueries({
    queries: accounts.map((account) =>
      getAccountQuotaQueryOptions(account.provider, account.accountId, enabled)
    ),
  });
}
