/**
 * Paste-Callback OAuth Polling, Start Request & User Prompt Helpers
 */

import { fail, info } from '../../../utils/ui';
import { AuthError } from '../../../errors/error-types';
import { CLIProxyProvider } from '../../types';
import {
  buildManagementHeaders,
  buildProxyUrl,
  type ProxyTarget,
} from '../../proxy/proxy-target-resolver';
import { getPasteCallbackStartPath, OAuthOptions } from '../auth-types';
import { findNewTokenSnapshotForAuthAttempt, ProviderTokenSnapshot } from '../token-manager';
import { normalizeGitLabBaseUrl } from './credential-validation';

export interface PasteCallbackStartData {
  url?: string;
  auth_url?: string;
  state?: string;
  status?: string;
}

export const PASTE_CALLBACK_AUTH_URL_POLL_INTERVAL_MS = 3000;
const POLLED_AUTH_LOCAL_TOKEN_GRACE_MS = 15 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseAuthUrlState(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).searchParams.get('state');
  } catch {
    return null;
  }
}

export async function requestPasteCallbackStart(
  provider: CLIProxyProvider,
  target: ProxyTarget,
  options?: {
    kiroMethod?: OAuthOptions['kiroMethod'];
    gitlabBaseUrl?: OAuthOptions['gitlabBaseUrl'];
  }
): Promise<PasteCallbackStartData> {
  let startPath = getPasteCallbackStartPath(provider, {
    kiroMethod: options?.kiroMethod,
  });
  if (!startPath) {
    throw new AuthError(
      `Paste-callback start is not available for ${provider} with the selected method`,
      provider
    );
  }
  const normalizedGitLabBaseUrl =
    provider === 'gitlab' ? normalizeGitLabBaseUrl(options?.gitlabBaseUrl) : undefined;
  if (normalizedGitLabBaseUrl) {
    startPath += `&base_url=${encodeURIComponent(normalizedGitLabBaseUrl)}`;
  }
  const response = await fetch(buildProxyUrl(target, startPath), {
    headers: buildManagementHeaders(target),
  });

  if (!response.ok) {
    throw new AuthError(`OAuth start failed with status ${response.status}`, provider);
  }

  return (await response.json()) as PasteCallbackStartData;
}

export function findNewTokenSnapshotForManualAuth(
  provider: CLIProxyProvider,
  tokenDir: string,
  knownTokenFiles: ProviderTokenSnapshot[],
  expectedAccountId?: string
): ProviderTokenSnapshot | null {
  return findNewTokenSnapshotForAuthAttempt(provider, tokenDir, knownTokenFiles, expectedAccountId);
}

export async function waitForManualCallbackToken(
  provider: CLIProxyProvider,
  target: ProxyTarget,
  tokenDir: string,
  oauthState: string | null,
  knownTokenFiles: ProviderTokenSnapshot[],
  expectedAccountId: string | undefined,
  timeoutMs: number,
  pollIntervalMs: number = PASTE_CALLBACK_AUTH_URL_POLL_INTERVAL_MS
): Promise<{ tokenSnapshot: ProviderTokenSnapshot | null; error?: string }> {
  const deadline = Date.now() + timeoutMs;
  let upstreamCompletedAt: number | null = null;

  while (Date.now() < deadline) {
    const tokenSnapshot = findNewTokenSnapshotForManualAuth(
      provider,
      tokenDir,
      knownTokenFiles,
      expectedAccountId
    );
    if (tokenSnapshot) {
      return { tokenSnapshot };
    }

    if (oauthState) {
      const response = await fetch(
        buildProxyUrl(
          target,
          `/v0/management/get-auth-status?state=${encodeURIComponent(oauthState)}`
        ),
        { headers: buildManagementHeaders(target) }
      );

      if (response.ok) {
        const data = (await response.json()) as { status?: string; error?: string };
        if (data.status === 'error') {
          return {
            tokenSnapshot: null,
            error: data.error || 'Authentication failed while waiting for local token persistence',
          };
        }
        if (data.status === 'ok' && upstreamCompletedAt === null) {
          upstreamCompletedAt = Date.now();
        }
      }
    }

    if (
      upstreamCompletedAt !== null &&
      Date.now() - upstreamCompletedAt >= POLLED_AUTH_LOCAL_TOKEN_GRACE_MS
    ) {
      break;
    }

    if (Date.now() + pollIntervalMs >= deadline) {
      break;
    }

    await sleep(pollIntervalMs);
  }

  return { tokenSnapshot: null };
}

export async function resolvePasteCallbackAuthUrl(
  target: ProxyTarget,
  startData: PasteCallbackStartData,
  timeoutMs: number,
  pollIntervalMs: number = PASTE_CALLBACK_AUTH_URL_POLL_INTERVAL_MS
): Promise<string | null> {
  const authUrl = startData.url || startData.auth_url;
  if (authUrl) {
    return authUrl;
  }

  const state = startData.state;
  if (!state) {
    return null;
  }

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await fetch(
      buildProxyUrl(target, `/v0/management/get-auth-status?state=${encodeURIComponent(state)}`),
      { headers: buildManagementHeaders(target) }
    );

    if (response.ok) {
      const statusData = (await response.json()) as PasteCallbackStartData;
      const polledAuthUrl = statusData.url || statusData.auth_url;

      if (polledAuthUrl) {
        return polledAuthUrl;
      }

      if (statusData.status === 'error' || statusData.status === 'device_code') {
        return null;
      }
    }

    if (Date.now() + pollIntervalMs >= deadline) {
      break;
    }

    await sleep(pollIntervalMs);
  }

  return null;
}

export async function promptForPasteCallbackUrl(timeoutMs: number): Promise<string | null> {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<string | null>((resolve) => {
    let resolved = false;

    rl.on('close', () => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    });

    console.log(info('After completing authentication, paste the callback URL here:'));
    rl.question('> ', (answer) => {
      resolved = true;
      rl.close();
      resolve(answer.trim() || null);
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        rl.close();
        console.log('');
        console.log(
          fail(`Timed out waiting for callback URL (${Math.round(timeoutMs / 60000)} minutes)`)
        );
        resolve(null);
      }
    }, timeoutMs);
  });
}
