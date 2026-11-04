import type { OAuthAccount } from '@/lib/api-client';
import { getAccountIdentityPresentation, type AccountAudience } from '@/lib/account-identity';
import { getAccountStats } from '@/lib/cliproxy-account-stats';
import type { CliproxyStats } from '@/hooks/use-cliproxy-stats';

export interface AccountVisualVariant {
  id: string;
  nickname?: string;
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
  compactDetailLabel: string | null;
  inlineLabel: string | null;
}

export interface AccountVisualGroup {
  id: string;
  nickname?: string;
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

const AUDIENCE_ORDER: Record<AccountAudience, number> = {
  business: 0,
  personal: 1,
  free: 2,
  unknown: 3,
};

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
    nickname: account.nickname,
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
    compactDetailLabel: identity.compactDetailLabel,
    inlineLabel: identity.inlineLabel,
  };
}

function sortAccountVariants(variants: AccountVisualVariant[]): AccountVisualVariant[] {
  return [...variants].sort((left, right) => {
    const audienceDelta = AUDIENCE_ORDER[left.audience] - AUDIENCE_ORDER[right.audience];
    if (audienceDelta !== 0) {
      return audienceDelta;
    }

    const leftLabel = left.inlineLabel ?? left.audienceLabel ?? left.detailLabel ?? left.id;
    const rightLabel = right.inlineLabel ?? right.audienceLabel ?? right.detailLabel ?? right.id;

    return leftLabel.localeCompare(rightLabel);
  });
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
        nickname: variant.nickname,
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

    const orderedVariants = sortAccountVariants(variants);
    const canonicalEmail = orderedVariants[0]?.email ?? bucketKey;
    const originalProvider = accountMeta.get(orderedVariants[0]?.id ?? '')?.provider ?? 'codex';

    return {
      id: bucketKey,
      // Only a shared nickname can describe the whole group; retain individual names on variants.
      nickname: orderedVariants.every(
        (variant) => variant.nickname?.trim() === orderedVariants[0]?.nickname?.trim()
      )
        ? orderedVariants[0]?.nickname
        : undefined,
      email: canonicalEmail,
      tokenFile: orderedVariants[0]?.tokenFile ?? '',
      provider: originalProvider,
      isDefault: orderedVariants.some((variant) => variant.isDefault),
      successCount: orderedVariants.reduce((sum, variant) => sum + variant.successCount, 0),
      failureCount: orderedVariants.reduce((sum, variant) => sum + variant.failureCount, 0),
      lastUsedAt: orderedVariants.reduce<string | undefined>(
        (latest, variant) => getLatestTimestamp(latest, variant.lastUsedAt),
        undefined
      ),
      paused: orderedVariants.every((variant) => Boolean(variant.paused)),
      memberIds: orderedVariants.map((variant) => variant.id),
      variants: orderedVariants,
    };
  });
}
