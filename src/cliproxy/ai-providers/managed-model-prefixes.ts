import { getManagedModelPrefix } from '../../shared/cliproxy-model-routing';
import { ProviderError } from '../../errors/error-types';
import {
  buildManagementHeaders,
  buildProxyUrl,
  getProxyTarget,
} from '../proxy/proxy-target-resolver';
import { mapExternalProviderName } from '../provider-capabilities';
import type { CLIProxyProvider } from '../types';

const MANAGED_PREFIX_REQUEST_TIMEOUT_MS = 3000;

interface ManagementAuthFileRecord {
  account_type?: string;
  name: string;
  provider?: string;
  type?: string;
}

interface AuthFileMetadata {
  prefix: string | null;
  provider: CLIProxyProvider | null;
}

export interface ManagedPrefixSyncResult {
  checked: number;
  updated: number;
}

function normalizeProvider(record: ManagementAuthFileRecord): CLIProxyProvider | null {
  const providerName = record.provider?.trim() || record.type?.trim() || '';
  return providerName ? mapExternalProviderName(providerName) : null;
}

async function fetchManagementEndpoint(path: string, init: RequestInit = {}): Promise<Response> {
  const target = getProxyTarget();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MANAGED_PREFIX_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(buildProxyUrl(target, path), {
      ...init,
      headers: buildManagementHeaders(target, init.headers as Record<string, string> | undefined),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function listAuthFiles(): Promise<ManagementAuthFileRecord[]> {
  const response = await fetchManagementEndpoint('/v0/management/auth-files');

  if (!response.ok) {
    throw new ProviderError(`auth file listing failed with status ${response.status}`, 'cliproxy');
  }

  const data = (await response.json()) as { files?: ManagementAuthFileRecord[] };
  return Array.isArray(data.files) ? data.files : [];
}

async function patchAuthFilePrefix(name: string, prefix: string): Promise<void> {
  const response = await fetchManagementEndpoint('/v0/management/auth-files/fields', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, prefix }),
  });

  if (!response.ok) {
    throw new ProviderError(
      `auth file prefix patch failed for ${name} with status ${response.status}`,
      'cliproxy'
    );
  }
}

async function readAuthFileMetadata(name: string): Promise<AuthFileMetadata> {
  const response = await fetchManagementEndpoint(
    `/v0/management/auth-files/download?name=${encodeURIComponent(name)}`
  );

  if (!response.ok) {
    throw new ProviderError(
      `auth file download failed for ${name} with status ${response.status}`,
      'cliproxy'
    );
  }

  const content = await response.text();
  try {
    const parsed = JSON.parse(content) as { prefix?: unknown; provider?: unknown; type?: unknown };
    const providerName =
      typeof parsed.provider === 'string'
        ? parsed.provider
        : typeof parsed.type === 'string'
          ? parsed.type
          : '';
    return {
      prefix: typeof parsed.prefix === 'string' ? parsed.prefix.trim() : null,
      provider: providerName ? mapExternalProviderName(providerName) : null,
    };
  } catch {
    return { prefix: null, provider: null };
  }
}

export async function ensureManagedModelPrefixes(
  providers?: CLIProxyProvider[]
): Promise<ManagedPrefixSyncResult> {
  const allowedProviders = new Set(
    (providers ?? [])
      .map((provider) => provider.trim())
      .filter((provider) => getManagedModelPrefix(provider))
  );

  if (providers && allowedProviders.size === 0) {
    return { checked: 0, updated: 0 };
  }

  const files = await listAuthFiles();
  let checked = 0;
  let updated = 0;

  for (const record of files) {
    if ((record.account_type || '').trim().toLowerCase() !== 'oauth') {
      continue;
    }

    const provider = normalizeProvider(record);
    if (!provider) {
      continue;
    }

    if (allowedProviders.size > 0 && !allowedProviders.has(provider)) {
      continue;
    }

    const prefix = getManagedModelPrefix(provider);
    if (!prefix) {
      continue;
    }

    try {
      checked += 1;
      const { prefix: currentPrefix, provider: fileProvider } = await readAuthFileMetadata(
        record.name
      );
      if (fileProvider !== provider) {
        continue;
      }
      if (currentPrefix === prefix) {
        continue;
      }
      if (currentPrefix && currentPrefix !== prefix) {
        continue;
      }
      await patchAuthFilePrefix(record.name, prefix);
      updated += 1;
    } catch {
      // Best-effort repair: skip files that cannot be read or patched.
    }
  }

  return { checked, updated };
}
