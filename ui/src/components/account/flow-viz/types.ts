/**
 * Type definitions for Account Flow Visualization
 */

import type { AccountVisualVariant } from '@/lib/account-visual-groups';
import type { RecentRequest } from '@/hooks/use-cliproxy-stats';

/** Account tier for subscription level */
export type AccountTier = 'free' | 'pro' | 'ultra' | 'unknown';

/** Position offset for draggable cards */
export interface DragOffset {
  x: number;
  y: number;
}

export interface AccountData {
  id: string;
  nickname?: string;
  email: string;
  tokenFile?: string;
  provider: string;
  isDefault?: boolean;
  successCount: number;
  failureCount: number;
  lastUsedAt?: string;
  color: string;
  paused?: boolean;
  /** Account tier (Antigravity only) */
  tier?: AccountTier;
  /** Raw member IDs when one visual card represents multiple underlying auth records */
  memberIds?: string[];
  /** Raw variant details shown inside grouped visual cards */
  variants?: AccountVisualVariant[];
}

export interface ProviderData {
  provider: string;
  displayName: string;
  totalRequests: number;
  accounts: AccountData[];
}

export interface AccountFlowVizProps {
  providerData: ProviderData;
  recentRequests: RecentRequest[];
  onBack?: () => void;
  onPauseToggle?: (accountIds: string[], paused: boolean) => void;
  isPausingAccount?: boolean;
}

export interface ConnectionEvent {
  id: string;
  timestamp: Date;
  accountEmail: string;
  accountNickname?: string;
  status: 'success' | 'failed' | 'pending';
}

/** Zone type for account card placement */
export type AccountZone = 'left' | 'right' | 'top' | 'bottom';

/** Container expansion state */
export interface ContainerExpansion {
  paddingTop: number;
  paddingBottom: number;
  extraHeight: number;
}

/** Account zone distribution */
export interface AccountZones {
  leftAccounts: AccountData[];
  rightAccounts: AccountData[];
  topAccounts: AccountData[];
  bottomAccounts: AccountData[];
}
