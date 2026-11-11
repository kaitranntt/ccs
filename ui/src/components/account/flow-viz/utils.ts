/**
 * Utility functions for Account Flow Visualization
 */

import type { RecentRequest } from '@/hooks/use-cliproxy-stats';
import { buildQualifiedAccountStatsKey } from '@/lib/cliproxy-account-stats';
import type { AccountData, ConnectionEvent } from './types';

// Maximum events to display in the Connection Timeline to prevent performance issues
export const MAX_TIMELINE_EVENTS = 100;

// Earthy, sophisticated color palette for connection lines - works in both light/dark themes
export const CONNECTION_COLORS = [
  '#3b3c36', // Charcoal Brown - urban mystery
  '#568203', // Forest Moss - woodland depth
  '#8d4557', // Vintage Berry - timeless elegance
  '#da9100', // Harvest Gold - sun-drenched warmth
  '#3c6c82', // Blue Slate - cool authority
  '#c96907', // Burnt Caramel - earthy comfort
];

/** Get a muted connection color based on index */
export function getConnectionColor(index: number): string {
  return CONNECTION_COLORS[index % CONNECTION_COLORS.length];
}

/** Strip common email domains for cleaner display */
export function cleanEmail(email: string): string {
  return email.replace(/@(gmail|yahoo|hotmail|outlook|icloud)\.com$/i, '');
}

/** Format timestamp for timeline display */
export function formatTimelineTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  return `${Math.floor(diffHours / 24)}d`;
}

/** Map proxied requests (newest first) onto the account cards that served them */
export function buildConnectionEvents(
  requests: RecentRequest[],
  accounts: AccountData[]
): ConnectionEvent[] {
  const accountByKey = new Map<string, AccountData>();
  for (const account of accounts) {
    for (const identity of [account, ...(account.variants ?? [])]) {
      for (const source of [identity.id, identity.email]) {
        if (source.trim()) {
          accountByKey.set(buildQualifiedAccountStatsKey(account.provider, source), account);
        }
      }
    }
  }

  return requests.flatMap((request, index) => {
    const account = accountByKey.get(request.accountKey);
    if (!account) return [];

    return [
      {
        id: `${request.accountKey}-${request.timestamp}-${index}`,
        timestamp: new Date(request.timestamp),
        accountEmail: account.email,
        accountNickname: account.nickname,
        status: request.failed ? 'failed' : 'success',
      },
    ];
  });
}
