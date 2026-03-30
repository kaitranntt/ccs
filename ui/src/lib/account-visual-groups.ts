import type { OAuthAccount } from '@/lib/api-client';
import { getAccountIdentityPresentation, type AccountAudience } from '@/lib/account-identity';
import { getAccountStats } from '@/lib/cliproxy-account-stats';
import type { CliproxyStats } from '@/hooks/use-cliproxy-stats';

export interface AccountVisualVariant {
  id: string;
  email: string;
  tokenFile: string;
  isDefault: boolean;
  successCount: number;
  failureCount: number;
  lastUsedAt?: string;
  paused?: boolean;
  tier?: OAuthAccount['tier'];
  audience: AccountAudience;
  audienceLabel: string | null;
  detailLabel: string | null;
}

export interface AccountVisualGroup {
  id: string;
  email: string;
  tokenFile: string;
  provider: OAuthAccount['provider'];
  isDefault: boolean;
  successCount: number;
  failureCount: number;
  lastUsedAt?: string;
  paused?: boolean;
  tier?: OAuthAccount['tier'];
  projectId?: string;
  memberIds?: string[];
  variants?: AccountVisualVariant[];
}

function getLatestTimestamp(current?: string, candidate?: string): string | undefined {
  if (!candidate) return current;
  if (!current) return candidate;

  return new Date(candidate).getTime() > new Date(current).getTime() ? candidate : current;
}

function buildAccountVariant(
  account: OAuthAccount,
  statsData?: Pick<CliproxyStats, 'accountStats'> | null
): AccountVisualVariant {
  const identity = getAccountIdentityPresentation(account.id, account.email, account.tokenFile);
  const runtimeStats = getAccountStats(statsData, account);

  return {
    id: account.id,
    email: identity.email || account.email || account.id,
    tokenFile: account.tokenFile,
    isDefault: account.isDefault,
    successCount: runtimeStats?.successCount ?? 0,
    failureCount: runtimeStats?.failureCount ?? 0,
    lastUsedAt: runtimeStats?.lastUsedAt ?? account.lastUsedAt,
    paused: account.paused,
    tier: account.tier,
    audience: identity.audience,
    audienceLabel: identity.audienceLabel,
    detailLabel: identity.detailLabel,
  };
}

export function buildAccountVisualGroups(
  accounts: OAuthAccount[],
  statsData?: Pick<CliproxyStats, 'accountStats'> | null
): AccountVisualGroup[] {
  const buckets = new Map<string, AccountVisualVariant[]>();
  const accountMeta = new Map<string, OAuthAccount>();

  for (const account of accounts) {
    const variant = buildAccountVariant(account, statsData);
    const isCodexProvider = account.provider.toLowerCase() === 'codex';
    const bucketKey = isCodexProvider ? `${account.provider}:${variant.email}` : account.id;

    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, []);
    }

    buckets.get(bucketKey)?.push(variant);
    accountMeta.set(account.id, account);
  }

  return Array.from(buckets.entries()).map(([bucketKey, variants]) => {
    if (variants.length === 1) {
      const [variant] = variants;
      const original = accountMeta.get(variant.id);

      return {
        id: variant.id,
        email: variant.email,
        tokenFile: variant.tokenFile,
        provider: original?.provider ?? 'codex',
        isDefault: variant.isDefault,
        successCount: variant.successCount,
        failureCount: variant.failureCount,
        lastUsedAt: variant.lastUsedAt,
        paused: variant.paused,
        tier: variant.tier,
        projectId: original?.projectId,
      };
    }

    const canonicalEmail = variants[0]?.email ?? bucketKey;
    const originalProvider = accountMeta.get(variants[0]?.id ?? '')?.provider ?? 'codex';

    return {
      id: bucketKey,
      email: canonicalEmail,
      tokenFile: variants[0]?.tokenFile ?? '',
      provider: originalProvider,
      isDefault: variants.some((variant) => variant.isDefault),
      successCount: variants.reduce((sum, variant) => sum + variant.successCount, 0),
      failureCount: variants.reduce((sum, variant) => sum + variant.failureCount, 0),
      lastUsedAt: variants.reduce<string | undefined>(
        (latest, variant) => getLatestTimestamp(latest, variant.lastUsedAt),
        undefined
      ),
      paused: variants.every((variant) => Boolean(variant.paused)),
      memberIds: variants.map((variant) => variant.id),
      variants,
    };
  });
}
