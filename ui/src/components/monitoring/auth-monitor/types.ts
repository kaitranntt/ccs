/**
 * Type definitions for Auth Monitor components
 */

/** Account tier for subscription level */
export type AccountTier = 'free' | 'pro' | 'ultra' | 'unknown';

export interface AccountRow {
  id: string;
  email: string;
  tokenFile: string;
  provider: string;
  displayName: string;
  isDefault: boolean;
  successCount: number;
  failureCount: number;
  lastUsedAt?: string;
  color: string;
  /** GCP Project ID (Antigravity only) - read-only */
  projectId?: string;
  /** Whether account is paused (skipped in quota rotation) */
  paused?: boolean;
  /** Account tier (Antigravity only) */
  tier?: AccountTier;
}

export interface ProviderStats {
  provider: string;
  displayName: string;
  totalRequests: number;
  successCount: number;
  failureCount: number;
  accountCount: number;
  accounts: AccountRow[];
}
