/**
 * Shared types and constants for account management
 */

import type { CLIProxyProvider } from '../types';

/** Account tier for quota management: ultra > pro > free */
export type AccountTier = 'free' | 'pro' | 'ultra' | 'unknown';

/**
 * Providers that typically have empty email in OAuth token files.
 * For these providers, nickname is used as accountId instead of email.
 */
export const PROVIDERS_WITHOUT_EMAIL: CLIProxyProvider[] = ['kiro', 'ghcp'];

/** Account information */
export interface AccountInfo {
  /** Account identifier (email or custom name) */
  id: string;
  /** Email address from OAuth (if available) */
  email?: string;
  /** User-friendly nickname for quick reference (auto-generated from email prefix) */
  nickname?: string;
  /** Provider this account belongs to */
  provider: CLIProxyProvider;
  /** Whether this is the default account for the provider */
  isDefault: boolean;
  /** Token file name in auth directory */
  tokenFile: string;
  /** When account was added */
  createdAt: string;
  /** Last usage time */
  lastUsedAt?: string;
  /** User-paused state (skip in quota rotation) */
  paused?: boolean;
  /** ISO timestamp when paused */
  pausedAt?: string;
  /** Account tier: ultra, pro, or free */
  tier?: AccountTier;
  /** GCP Project ID (Antigravity only) - read-only, fetched from auth token */
  projectId?: string;
}

/**
 * Drain order mode for a provider's account pool.
 * - "manual": user-specified ordered list of account IDs
 * - "tier": auto-derived from AccountTier (ultra > pro > free); unknown = last
 * - "file": stable file-system order (default, no priority writes)
 */
export type DrainOrderMode = 'manual' | 'tier' | 'file';

/** Persisted drain order configuration for a provider */
export interface DrainOrderConfig {
  /** How priorities were last set */
  mode: DrainOrderMode;
  /**
   * Ordered account IDs for manual mode.
   * First = drained first (highest priority).
   * Stale IDs (accounts removed since last --set) are silently ignored on re-apply.
   */
  orderedIds?: string[];
}

/** Provider accounts configuration */
export interface ProviderAccounts {
  /** Default account ID for this provider */
  default: string;
  /** Map of account ID to account metadata */
  accounts: Record<string, Omit<AccountInfo, 'id' | 'provider' | 'isDefault'>>;
  /** Persisted drain order configuration (optional; absent = file order) */
  drainOrder?: DrainOrderConfig;
}

/** Accounts registry structure */
export interface AccountsRegistry {
  /** Version for future migrations */
  version: number;
  /** Accounts organized by provider */
  providers: Partial<Record<CLIProxyProvider, ProviderAccounts>>;
}

/** Result of bulk pause/resume operations */
export interface BulkOperationResult {
  succeeded: string[];
  failed: Array<{ id: string; reason: string }>;
}

/** Result of solo account operation */
export interface SoloOperationResult {
  activated: string;
  paused: string[];
}
