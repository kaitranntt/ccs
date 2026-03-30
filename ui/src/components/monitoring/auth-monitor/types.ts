/**
 * Type definitions for Auth Monitor components
 */

import type { AccountVisualVariant } from '@/lib/account-visual-groups';

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
  /** Raw member IDs when one visual card represents multiple underlying auth records */
  memberIds?: string[];
  /** Raw variant details shown inside grouped visual cards */
  variants?: AccountVisualVariant[];
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
