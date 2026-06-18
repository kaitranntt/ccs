/**
 * Generic formatting helpers for quota CLI output.
 *
 * These helpers are pure (no I/O, no side effects) so they can be unit tested
 * in isolation and reused across provider sections.
 */

import { formatAccountDisplayName } from '../../../cliproxy/accounts/email-account-identity';
import { color, dim } from '../../../utils/ui';

/** Render a 20-char wide ASCII quota bar for the given percentage. */
export function formatQuotaBar(percentage: number): string {
  const width = 20;
  const clampedPct = Math.max(0, Math.min(100, percentage));
  const filled = Math.round((clampedPct / 100) * width);
  const empty = width - filled;
  const filledChar = clampedPct > 50 ? '█' : clampedPct > 10 ? '▓' : '░';
  return `[${filledChar.repeat(filled)}${' '.repeat(empty)}]`;
}

/** Render a human-readable relative reset time from a seconds offset. */
export function formatResetTime(seconds: number): string {
  if (seconds <= 0) return 'now';
  if (seconds < 60) return `in ${seconds}s`;
  if (seconds < 3600) return `in ${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `in ${Math.round(seconds / 3600)}h`;

  const days = Math.floor(seconds / 86400);
  const hours = Math.round((seconds % 86400) / 3600);
  if (hours <= 0) return `in ${days}d`;
  if (hours >= 24) return `in ${days + 1}d`;
  return `in ${days}d ${hours}h`;
}

/** Render a relative reset time from an ISO timestamp. Returns 'unknown' if invalid. */
export function formatResetTimeISO(isoTime: string): string {
  if (!isoTime) return 'unknown';
  const resetDate = new Date(isoTime);
  if (isNaN(resetDate.getTime())) return 'unknown';
  const seconds = Math.max(0, Math.round((resetDate.getTime() - Date.now()) / 1000));
  return formatResetTime(seconds);
}

/** Render an absolute reset time (MM/DD HH:MM) from ISO, or null if invalid. */
export function formatAbsoluteResetTime(isoTime: string): string | null {
  if (!isoTime) return null;
  const resetDate = new Date(isoTime);
  if (isNaN(resetDate.getTime())) return null;
  const date = resetDate.toLocaleDateString(undefined, {
    month: '2-digit',
    day: '2-digit',
  });
  const time = resetDate.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${date} ${time}`;
}

/**
 * Display label for an account: shows nickname + canonical email-style label
 * when a nickname is present, otherwise just the canonical label.
 */
export function formatCliAccountLabel(account: {
  id: string;
  email?: string;
  nickname?: string;
}): string {
  const displayName = formatAccountDisplayName(account);
  return account.nickname ? `${account.nickname} (${displayName})` : displayName;
}

/**
 * Pick the tier to display for an account. A live (freshly fetched) tier wins
 * over a stale account-config tier unless the live tier is 'unknown'. Returns
 * 'unknown' when neither source provides a value.
 */
export function resolveDisplayedTier(
  accountTier: string | undefined,
  liveTier: string | undefined
): string {
  return (liveTier && liveTier !== 'unknown' ? liveTier : accountTier) || 'unknown';
}

// Re-export dim/color here so section modules can pull UI primitives from a
// single quota-local import. Keeps the surface small.
export { color, dim };
