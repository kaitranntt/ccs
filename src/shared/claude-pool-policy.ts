/** Public status of the opt-in Claude quota-class pool policy. */
export type ClaudePoolQuotaClass =
  | 'five-hour-only'
  | 'five-hour-weekly'
  | 'weekly-only'
  | 'unknown';

export interface ClaudePoolPolicyAccount {
  accountId: string;
  class: ClaudePoolQuotaClass;
  /** Epoch milliseconds of the provider observation, never a cache read time. */
  confirmedAt: number | null;
  desiredPriority: number;
  effectivePriority: number | null;
  state: 'applied' | 'pending' | 'drift' | 'paused' | 'missing';
}

export interface ClaudePoolPolicyStatus {
  enabled: boolean;
  status: 'inactive' | 'pending' | 'active' | 'degraded';
  controllerActive: boolean;
  lastReconciledAt: number | null;
  error?: string;
  accounts: ClaudePoolPolicyAccount[];
}
