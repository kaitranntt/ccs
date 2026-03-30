import type { OAuthAccount } from '@/lib/api-client';
import type { AccountUsageStats, CliproxyStats } from '@/hooks/use-cliproxy-stats';

export function buildQualifiedAccountStatsKey(provider: string, source: string): string {
  return `${provider.trim().toLowerCase()}:${source.trim()}`;
}

export function getAccountStats(
  stats: Pick<CliproxyStats, 'accountStats'> | null | undefined,
  account: Pick<OAuthAccount, 'provider' | 'email' | 'id'>
): AccountUsageStats | undefined {
  const sources = Array.from(
    new Set([account.id, account.email].filter((value): value is string => Boolean(value?.trim())))
  );

  for (const source of sources) {
    const qualifiedKey = buildQualifiedAccountStatsKey(account.provider, source);
    const match = stats?.accountStats?.[qualifiedKey] ?? stats?.accountStats?.[source];
    if (match) {
      return match;
    }
  }

  return undefined;
}
