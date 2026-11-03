/**
 * Utility functions for Account Flow Visualization
 */

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

/** Generate connection events from real account data */
export function generateConnectionEvents(accounts: AccountData[]): ConnectionEvent[] {
  const events: ConnectionEvent[] = [];

  // Use a shared base time so events from all accounts interleave in the timeline.
  // Without this, accounts with more recent lastUsedAt dominate the sorted output.
  const now = Date.now();
  const latestLastUsedAt = accounts.reduce<number | undefined>((latest, account) => {
    if (!account.lastUsedAt) return latest;

    const timestamp = new Date(account.lastUsedAt).getTime();
    if (Number.isNaN(timestamp)) return latest;

    return latest === undefined ? timestamp : Math.max(latest, timestamp);
  }, undefined);
  const sharedBaseTime = latestLastUsedAt ?? now;

  accounts.forEach((account) => {
    const lastUsed = new Date(sharedBaseTime);

    // Helper to add events
    const addEvents = (count: number, status: 'success' | 'failed') => {
      for (let i = 0; i < count; i++) {
        // Simulate timestamps:
        // - Distribute events over a 24-hour window relative to lastUsed
        // - Add random jitter so events from different accounts mix
        const timeOffset = Math.floor(Math.random() * 24 * 60 * 60 * 1000 * (i / (count || 1)));
        const timestamp = new Date(lastUsed.getTime() - timeOffset);

        // Add small random jitter (+/-5 mins) to avoid exact overlaps
        const jitter = Math.floor((Math.random() - 0.5) * 10 * 60 * 1000);
        timestamp.setTime(timestamp.getTime() + jitter);

        // Sanity check: don't go into the future relative to "now"
        const now = new Date();
        if (timestamp > now) timestamp.setTime(now.getTime());

        events.push({
          id: `${account.id}-${status}-${i}`,
          timestamp,
          accountEmail: account.email,
          accountNickname: account.nickname,
          status,
          // Simulate realistic latency (success: 50-200ms, failed: 200-5000ms)
          latencyMs:
            status === 'success'
              ? 50 + Math.floor(Math.random() * 150)
              : 200 + Math.floor(Math.random() * 4800),
        });
      }
    };

    addEvents(account.successCount, 'success');
    addEvents(account.failureCount, 'failed');
  });

  // Sort by timestamp descending (most recent first)
  return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}
