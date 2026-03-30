import { buildQualifiedAccountStatsKey } from './account-stats-key';
import { mapExternalProviderName } from './provider-capabilities';
import { buildEmailBackedAccountId } from './accounts/email-account-identity';
import type {
  AccountUsageStats,
  CliproxyManagementAuthFile,
  CliproxyRequestDetail,
  CliproxyStats,
  CliproxyUsageApiResponse,
} from './stats-fetcher';

interface BuildCliproxyStatsOptions {
  authFiles?: CliproxyManagementAuthFile[];
}

interface ResolvedAuthFile {
  provider?: string;
  source?: string;
  email?: string;
  name?: string;
  duplicateEmailCount?: number;
}

function normalizeProvider(provider: string): string {
  const normalized = provider.trim().toLowerCase();
  if (!normalized) {
    return 'unknown';
  }

  return mapExternalProviderName(normalized) ?? normalized;
}

function buildAuthIndexLookup(
  authFiles: CliproxyManagementAuthFile[] | undefined
): ReadonlyMap<string, ResolvedAuthFile> {
  const lookup = new Map<string, ResolvedAuthFile>();
  const duplicateEmailCounts = new Map<string, number>();

  for (const authFile of authFiles ?? []) {
    if (!authFile.provider || !authFile.email) {
      continue;
    }

    const key = `${normalizeProvider(authFile.provider)}:${authFile.email.trim().toLowerCase()}`;
    duplicateEmailCounts.set(key, (duplicateEmailCounts.get(key) ?? 0) + 1);
  }

  for (const authFile of authFiles ?? []) {
    if (authFile.auth_index === undefined || authFile.auth_index === null) {
      continue;
    }

    const provider = authFile.provider ? normalizeProvider(authFile.provider) : undefined;
    const email = authFile.email?.trim() || undefined;
    const name = authFile.name?.trim() || undefined;
    const source = authFile.email?.trim() || authFile.name?.trim() || undefined;
    if (!provider && !source) {
      continue;
    }

    lookup.set(String(authFile.auth_index), {
      provider,
      source,
      email,
      name,
      duplicateEmailCount:
        provider && email
          ? (duplicateEmailCounts.get(`${provider}:${email.toLowerCase()}`) ?? 1)
          : 1,
    });
  }

  return lookup;
}

function resolveProviderForDetail(
  usageProvider: string,
  detail: CliproxyRequestDetail,
  authIndexLookup: ReadonlyMap<string, ResolvedAuthFile>
): string {
  const resolvedAuthFile = authIndexLookup.get(String(detail.auth_index));
  if (resolvedAuthFile?.provider) {
    return resolvedAuthFile.provider;
  }

  return normalizeProvider(usageProvider);
}

function resolveSourceForDetail(
  resolvedProvider: string,
  detail: CliproxyRequestDetail,
  authIndexLookup: ReadonlyMap<string, ResolvedAuthFile>
): string {
  const resolvedAuthFile = authIndexLookup.get(String(detail.auth_index));
  if (resolvedAuthFile?.email && resolvedAuthFile?.name) {
    const derivedSource = buildEmailBackedAccountId(
      resolvedProvider,
      resolvedAuthFile.name,
      resolvedAuthFile.email,
      resolvedAuthFile.duplicateEmailCount ?? 1
    );
    if (derivedSource) {
      return derivedSource;
    }
  }

  const source = detail.source?.trim();
  if (source) {
    return source;
  }

  return resolvedAuthFile?.source ?? 'unknown';
}

export function buildCliproxyStatsFromUsageResponse(
  data: CliproxyUsageApiResponse,
  options: BuildCliproxyStatsOptions = {}
): CliproxyStats {
  const usage = data.usage;
  const requestsByModel: Record<string, number> = {};
  const requestsByProvider: Record<string, number> = {};
  const accountStats: Record<string, AccountUsageStats> = {};
  const authIndexLookup = buildAuthIndexLookup(options.authFiles);
  let totalSuccessCount = 0;
  let totalFailureCount = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let sawAnyDetail = false;

  if (usage?.apis) {
    for (const [provider, providerData] of Object.entries(usage.apis)) {
      let sawProviderDetail = false;
      if (!providerData.models) {
        const normalizedProvider = normalizeProvider(provider);
        requestsByProvider[normalizedProvider] =
          (requestsByProvider[normalizedProvider] ?? 0) + (providerData.total_requests ?? 0);
        continue;
      }

      for (const [model, modelData] of Object.entries(providerData.models)) {
        requestsByModel[model] = modelData.total_requests ?? 0;
        if (!modelData.details) {
          continue;
        }

        for (const detail of modelData.details) {
          sawAnyDetail = true;
          sawProviderDetail = true;
          const resolvedProvider = resolveProviderForDetail(provider, detail, authIndexLookup);
          const source = resolveSourceForDetail(resolvedProvider, detail, authIndexLookup);
          const accountKey = buildQualifiedAccountStatsKey(resolvedProvider, source);
          requestsByProvider[resolvedProvider] = (requestsByProvider[resolvedProvider] ?? 0) + 1;

          if (!accountStats[accountKey]) {
            accountStats[accountKey] = {
              accountKey,
              provider: resolvedProvider,
              source,
              successCount: 0,
              failureCount: 0,
              totalTokens: 0,
            };
          }

          if (detail.failed) {
            accountStats[accountKey].failureCount++;
            totalFailureCount++;
          } else {
            accountStats[accountKey].successCount++;
            totalSuccessCount++;
          }

          const tokens = detail.tokens?.total_tokens ?? 0;
          accountStats[accountKey].totalTokens += tokens;
          accountStats[accountKey].lastUsedAt = detail.timestamp;
          totalInputTokens += detail.tokens?.input_tokens ?? 0;
          totalOutputTokens += detail.tokens?.output_tokens ?? 0;
        }
      }

      if (!sawProviderDetail) {
        const normalizedProvider = normalizeProvider(provider);
        requestsByProvider[normalizedProvider] =
          (requestsByProvider[normalizedProvider] ?? 0) + (providerData.total_requests ?? 0);
      }
    }
  }

  return {
    totalRequests: usage?.total_requests ?? 0,
    successCount: sawAnyDetail ? totalSuccessCount : (usage?.success_count ?? 0),
    failureCount: sawAnyDetail
      ? totalFailureCount
      : (usage?.failure_count ?? data.failed_requests ?? 0),
    tokens: {
      input: totalInputTokens,
      output: totalOutputTokens,
      total: usage?.total_tokens ?? 0,
    },
    requestsByModel,
    requestsByProvider,
    accountStats,
    quotaExceededCount: usage?.failure_count ?? data.failed_requests ?? 0,
    retryCount: 0,
    collectedAt: new Date().toISOString(),
  };
}
