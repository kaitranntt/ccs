/**
 * Type definitions for Account Flow Visualization
 */

/** Account tier for subscription level */
export type AccountTier = 'free' | 'pro' | 'ultra' | 'unknown';

/** Position offset for draggable cards */
export interface DragOffset {
  x: number;
  y: number;
}

export interface AccountData {
  id: string;
  email: string;
  tokenFile?: string;
  provider: string;
  successCount: number;
  failureCount: number;
  lastUsedAt?: string;
  color: string;
  paused?: boolean;
  /** Account tier (Antigravity only) */
  tier?: AccountTier;
}

export interface ProviderData {
  provider: string;
  displayName: string;
  totalRequests: number;
  accounts: AccountData[];
}

export interface AccountFlowVizProps {
  providerData: ProviderData;
  onBack?: () => void;
  onPauseToggle?: (accountId: string, paused: boolean) => void;
  isPausingAccount?: boolean;
}

export interface ConnectionEvent {
  id: string;
  timestamp: Date;
  accountEmail: string;
  status: 'success' | 'failed' | 'pending';
  latencyMs?: number;
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
