/**
 * Remote Auth Fetcher
 * Fetches and transforms auth data from remote CLIProxyAPI.
 */

import {
  getProxyTarget,
  buildProxyUrl,
  buildManagementHeaders,
  ProxyTarget,
} from './proxy-target-resolver';

/** Timeout for remote fetch requests (ms) */
const REMOTE_FETCH_TIMEOUT_MS = 5000;

/** Remote auth file from CLIProxyAPI /v0/management/auth-files */
interface RemoteAuthFile {
  id: string;
  name: string;
  type: string;
  provider: string;
  email?: string;
  status: 'active' | 'disabled' | 'unavailable';
  source: 'file' | 'memory';
}

/** Account info for UI display */
export interface RemoteAccountInfo {
  id: string;
  email: string;
  isDefault: boolean;
  status: 'active' | 'disabled' | 'unavailable';
}

/** Auth status for a provider (UI format) */
export interface RemoteAuthStatus {
  provider: string;
  displayName: string;
  authenticated: boolean;
  tokenFiles: number;
  accounts: RemoteAccountInfo[];
  defaultAccount: string | null;
  source: 'remote';
}

/** Map CLIProxyAPI provider names to CCS internal names */
const PROVIDER_MAP: Record<string, string> = {
  gemini: 'gemini',
  'gemini-cli': 'gemini', // CLIProxyAPI uses 'gemini-cli' for Gemini CLI auth
  antigravity: 'agy',
  codex: 'codex',
  qwen: 'qwen',
  iflow: 'iflow',
  kiro: 'kiro',
  codewhisperer: 'kiro', // CLIProxyAPI may use 'codewhisperer' for Kiro
  ghcp: 'ghcp',
  'github-copilot': 'ghcp',
  copilot: 'ghcp',
};

/** Display names for providers */
const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  gemini: 'Google Gemini',
  agy: 'AntiGravity',
  codex: 'Codex',
  qwen: 'Qwen',
  iflow: 'iFlow',
  kiro: 'Kiro (AWS)',
  ghcp: 'GitHub Copilot (OAuth)',
};

/**
 * Fetch auth status from remote CLIProxyAPI
 * @throws Error if remote is unreachable or returns error
 */
export async function fetchRemoteAuthStatus(target?: ProxyTarget): Promise<RemoteAuthStatus[]> {
  const proxyTarget = target ?? getProxyTarget();

  if (!proxyTarget.isRemote) {
    throw new Error('fetchRemoteAuthStatus called but remote mode not enabled');
  }

  const url = buildProxyUrl(proxyTarget, '/v0/management/auth-files');
  const headers = buildManagementHeaders(proxyTarget);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REMOTE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Authentication failed - check auth token in settings');
      }
      throw new Error(`Remote returned ${response.status}: ${response.statusText}`);
    }

    const data: unknown = await response.json();

    // Validate response structure
    if (!data || typeof data !== 'object' || !('files' in data) || !Array.isArray(data.files)) {
      throw new Error('Invalid response format from remote auth endpoint');
    }

    return transformRemoteAuthFiles(data.files as RemoteAuthFile[]);
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Remote proxy connection timed out');
    }
    throw error;
  }
}

/**
 * Transform CLIProxyAPI auth files to CCS AuthStatus format
 * @param files Array of auth files from remote API
 */
function transformRemoteAuthFiles(files: RemoteAuthFile[]): RemoteAuthStatus[] {
  const byProvider = new Map<string, RemoteAuthFile[]>();

  for (const file of files) {
    const provider = PROVIDER_MAP[file.provider.toLowerCase()];
    if (!provider) {
      // Unknown provider, skip (could add logging in debug mode)
      continue;
    }

    const existing = byProvider.get(provider);
    if (existing) {
      existing.push(file);
    } else {
      byProvider.set(provider, [file]);
    }
  }

  const result: RemoteAuthStatus[] = [];

  for (const [provider, providerFiles] of byProvider) {
    const activeFiles = providerFiles.filter((f) => f.status === 'active');
    const accounts: RemoteAccountInfo[] = providerFiles.map((f, idx) => ({
      id: f.id,
      email: f.email || f.name || 'Unknown',
      isDefault: idx === 0,
      status: f.status,
    }));

    result.push({
      provider,
      displayName: PROVIDER_DISPLAY_NAMES[provider] || provider,
      authenticated: activeFiles.length > 0,
      tokenFiles: providerFiles.length,
      accounts,
      defaultAccount: accounts.find((a) => a.isDefault)?.id || null,
      source: 'remote',
    });
  }

  return result;
}
