import { buildQualifiedAccountStatsKey } from '../accounts/account-stats-key';
import { mapExternalProviderName } from '../provider-capabilities';
import { buildEmailBackedAccountId } from '../accounts/email-account-identity';
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

function extractAuthFilenameFromSource(source: string): string {
  const authFileMatch = source.match(/(?:^|\s)auth_file=("[^"]+"|'[^']+'|[^\s]+)/i);
  const rawValue = authFileMatch?.[1] ?? source;
  const value = rawValue.trim().replace(/^['"]|['"]$/g, '');
  const filenameCandidate = value.split('|').pop() ?? value;
  return filenameCandidate.split(/[\\/]/).pop() ?? filenameCandidate.trim();
}

function stripKnownAuthPlanSuffix(value: string): string {
  return value.replace(/-(?:free|plus|pro|team|business|enterprise)$/i, '');
}

function normalizeAuthFilenameSource(provider: string, source: string): string | null {
  const filename = extractAuthFilenameFromSource(source);
  const normalizedProvider = normalizeProvider(provider);
  const hadJsonExtension = /\.json$/i.test(filename);
  let candidate = filename.replace(/\.json$/i, '');
  const providerPrefix = `${normalizedProvider}-`;
  if (candidate.toLowerCase().startsWith(providerPrefix)) {
    candidate = candidate.slice(providerPrefix.length);
  }

  candidate = candidate.replace(/^[a-f0-9]{8}[-_]/i, '');
  if (hadJsonExtension) {
    candidate = stripKnownAuthPlanSuffix(candidate);
  }

  const parts = candidate.split('@');
  if (parts.length < 2) {
    return null;
  }

  const localPart = parts[0]?.trim();
  const domainPart = parts.slice(1).join('@').trim();
  const email = `${localPart}@${domainPart}`;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email.toLowerCase() : null;
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
    return normalizeAuthFilenameSource(resolvedProvider, source) ?? source;
  }

  return resolvedAuthFile?.source ?? 'unknown';
}

function resolveCountWithDetails(aggregateCount: number | undefined, detailCount: number): number {
  if (aggregateCount === undefined) {
    return detailCount;
  }

  return aggregateCount < detailCount ? detailCount : aggregateCount;
}

function shouldReplaceLastUsedAt(current: string | undefined, next: string | undefined): boolean {
  if (!next) {
    return false;
  }

  const nextTime = Date.parse(next);
  if (!Number.isFinite(nextTime)) {
    return false;
  }

  if (!current) {
    return true;
  }

  const currentTime = Date.parse(current);
  return !Number.isFinite(currentTime) || nextTime > currentTime;
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
      let providerDetailCount = 0;
      if (!providerData.models) {
        const normalizedProvider = normalizeProvider(provider);
        requestsByProvider[normalizedProvider] =
          (requestsByProvider[normalizedProvider] ?? 0) + (providerData.total_requests ?? 0);
        continue;
      }

      for (const [model, modelData] of Object.entries(providerData.models)) {
        let modelDetailCount = 0;
        if (!modelData.details) {
          requestsByModel[model] = (requestsByModel[model] ?? 0) + (modelData.total_requests ?? 0);
          continue;
        }

        for (const detail of modelData.details) {
          sawAnyDetail = true;
          providerDetailCount++;
          modelDetailCount++;
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
          if (shouldReplaceLastUsedAt(accountStats[accountKey].lastUsedAt, detail.timestamp)) {
            accountStats[accountKey].lastUsedAt = detail.timestamp;
          }
          totalInputTokens += detail.tokens?.input_tokens ?? 0;
          totalOutputTokens += detail.tokens?.output_tokens ?? 0;
        }

        requestsByModel[model] =
          (requestsByModel[model] ?? 0) +
          resolveCountWithDetails(modelData.total_requests, modelDetailCount);
      }

      const providerTotal = providerData.total_requests ?? 0;
      if (providerDetailCount === 0) {
        const normalizedProvider = normalizeProvider(provider);
        requestsByProvider[normalizedProvider] =
          (requestsByProvider[normalizedProvider] ?? 0) + providerTotal;
      } else if (providerTotal > providerDetailCount) {
        const normalizedProvider = normalizeProvider(provider);
        requestsByProvider[normalizedProvider] =
          (requestsByProvider[normalizedProvider] ?? 0) + (providerTotal - providerDetailCount);
      }
    }
  }

  const aggregateFailureCount = usage?.failure_count ?? data.failed_requests;
  const successCount = sawAnyDetail
    ? resolveCountWithDetails(usage?.success_count, totalSuccessCount)
    : (usage?.success_count ?? 0);
  const failureCount = sawAnyDetail
    ? resolveCountWithDetails(aggregateFailureCount, totalFailureCount)
    : (aggregateFailureCount ?? 0);
  const providerTotalRequests = Object.values(requestsByProvider).reduce(
    (total, count) => total + count,
    0
  );
  const totalRequests = Math.max(
    usage?.total_requests ?? 0,
    successCount + failureCount,
    providerTotalRequests
  );

  return {
    totalRequests,
    successCount,
    failureCount,
    tokens: {
      input: totalInputTokens,
      output: totalOutputTokens,
      total: usage?.total_tokens ?? 0,
    },
    requestsByModel,
    requestsByProvider,
    accountStats,
    quotaExceededCount: failureCount,
    retryCount: 0,
    collectedAt: new Date().toISOString(),
  };
}
