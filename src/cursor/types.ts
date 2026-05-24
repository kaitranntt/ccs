/**
 * Cursor IDE Type Definitions
 *
 * TypeScript interfaces for the Cursor module.
 */

/**
 * Cursor daemon runtime configuration.
 */
export interface CursorDaemonConfig {
  port: number;
  ghost_mode?: boolean;
  daemon_token?: string;
}

/**
 * Cursor authentication credentials
 */
export interface CursorCredentials {
  /** Access token from Cursor IDE */
  accessToken: string;
  /** Machine ID for checksum generation */
  machineId: string;
  /** User email (if available from token) */
  email?: string;
  /** User ID (if available from token) */
  userId?: string;
  /** How credentials were obtained */
  authMethod: 'auto-detect' | 'manual';
  /** ISO datetime when credentials were imported */
  importedAt: string;
}

/**
 * Cursor authentication status
 */
export interface CursorAuthStatus {
  /** Whether user is authenticated */
  authenticated: boolean;
  /** Current credentials (if authenticated) */
  credentials?: CursorCredentials;
  /** Hours since credentials were imported (if available) */
  tokenAge?: number;
  /** Whether token has expired (>24 hours old) */
  expired?: boolean;
}

/**
 * Auto-detection result
 */
export interface AutoDetectResult {
  /** Whether tokens were found */
  found: boolean;
  /** Access token (if found) */
  accessToken?: string;
  /** Machine ID (if found) */
  machineId?: string;
  /** SQLite database path used during detection */
  dbPath?: string;
  /** Paths checked while looking for Cursor state */
  checkedPaths?: string[];
  /** Structured failure reason when detection fails */
  reason?:
    | 'db_not_found'
    | 'sqlite_unavailable'
    | 'db_query_failed'
    | 'access_token_not_found'
    | 'machine_id_not_found'
    | 'invalid_token_format';
  /** Error message (if detection failed) */
  error?: string;
}

/**
 * Cursor daemon/process status
 */
export interface CursorDaemonStatus {
  /** Whether daemon is running */
  running: boolean;
  /** Port number daemon is listening on */
  port: number;
  /** Process ID (if available) */
  pid?: number;
}

/**
 * Cursor AI model
 */
export interface CursorModel {
  /** Model ID */
  id: string;
  /** Display name */
  name: string;
  /** Provider (e.g., 'openai', 'anthropic') */
  provider: string;
  /** Whether this is the default model */
  isDefault?: boolean;
}
