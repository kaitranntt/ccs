/**
 * Management API Types for CLIProxyAPI
 *
 * Type definitions matching CLIProxyAPI Go structs for Management API CRUD operations.
 * Used for syncing CCS API profiles to remote CLIProxy instance.
 */

/**
 * Model alias within a ClaudeKey entry.
 * Maps Claude model names to provider-specific models.
 */
export interface ClaudeModel {
  /** Claude model name to match (e.g., "claude-3-5-sonnet") */
  name: string;
  /** Target model to use instead (e.g., "glm-4.7-airx-thinking") */
  alias: string;
}

/**
 * ClaudeKey configuration for CLIProxy.
 * Maps to config.ClaudeKey in CLIProxyAPI Go code.
 */
export interface ClaudeKey {
  /** API key for the provider */
  'api-key': string;
  /** Prefix for model name matching (e.g., "glm-" matches "glm-*" requests) */
  prefix?: string;
  /** Base URL for the provider API */
  'base-url'?: string;
  /** Optional proxy URL for requests */
  'proxy-url'?: string;
  /** Additional headers to include in requests */
  headers?: Record<string, string>;
  /** Models to exclude from this key */
  'excluded-models'?: string[];
  /** Model name to alias mappings */
  models?: ClaudeModel[];
}

/**
 * Configuration for the Management API client.
 */
export interface ManagementClientConfig {
  /** Remote proxy host (IP or hostname) */
  host: string;
  /** Remote proxy port (default: 8317 for HTTP, 443 for HTTPS) */
  port?: number;
  /** Protocol to use (http or https) */
  protocol: 'http' | 'https';
  /** Management key for authentication (sent as Bearer token) */
  managementKey: string;
  /** Request timeout in milliseconds (default: 5000) */
  timeout?: number;
  /** Allow self-signed certificates for HTTPS (default: false) */
  allowSelfSigned?: boolean;
}

/**
 * Health check result from Management API.
 */
export interface ManagementHealthStatus {
  /** Whether the Management API is reachable */
  healthy: boolean;
  /** Version of CLIProxyAPI (from X-CPA-VERSION header) */
  version?: string;
  /** Commit hash (from X-CPA-COMMIT header) */
  commit?: string;
  /** Latency in milliseconds */
  latencyMs?: number;
  /** Error message if not healthy */
  error?: string;
  /** Error code for programmatic handling */
  errorCode?: ManagementApiErrorCode;
}

/**
 * Error codes for Management API operations.
 */
export type ManagementApiErrorCode =
  | 'CONNECTION_REFUSED'
  | 'TIMEOUT'
  | 'AUTH_FAILED'
  | 'DNS_FAILED'
  | 'NETWORK_UNREACHABLE'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'SERVER_ERROR'
  | 'UNKNOWN';

/**
 * Response from GET /v0/management/claude-api-key
 */
export interface GetClaudeKeysResponse {
  'claude-api-key': ClaudeKey[];
}

/**
 * Patch request body for updating a single ClaudeKey.
 */
export interface ClaudeKeyPatch {
  /** Index of the key to update (0-based) */
  index?: number;
  /** Match by api-key value */
  match?: string;
  /** Fields to update */
  value: Partial<ClaudeKey>;
}

/**
 * Sync status for tracking sync operations.
 */
export interface SyncStatus {
  /** Last sync timestamp (ISO 8601) */
  lastSyncAt?: string;
  /** Number of profiles synced */
  profileCount: number;
  /** Whether sync was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Remote CLIProxy URL */
  remoteUrl?: string;
}

/**
 * Remote model thinking support from CLIProxyAPI model-definitions endpoint
 */
export interface RemoteThinkingSupport {
  min?: number;
  max?: number;
  zero_allowed?: boolean;
  dynamic_allowed?: boolean;
  levels?: string[];
}

/**
 * Remote model info from CLIProxyAPI model-definitions endpoint
 */
export interface RemoteModelInfo {
  id: string;
  display_name?: string;
  description?: string;
  context_length?: number;
  max_completion_tokens?: number;
  thinking?: RemoteThinkingSupport;
  owned_by?: string;
  type?: string;
}

/**
 * Response from GET /v0/management/model-definitions/:channel
 */
export interface GetModelDefinitionsResponse {
  channel: string;
  models: RemoteModelInfo[];
}
