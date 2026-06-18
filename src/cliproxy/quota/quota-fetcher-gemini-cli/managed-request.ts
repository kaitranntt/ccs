/**
 * Managed and direct HTTP request machinery for the Gemini CLI quota fetcher.
 *
 * Wraps the two upstream call paths used when fetching Gemini CLI quota and
 * supplementary metadata:
 *   - managed: delegated through the CLIProxy management API (uses $TOKEN$
 *       substitution so the local process never holds the live token)
 *   - direct:  bearer-token fetch against the Google Cloud Code endpoint
 *
 * The preferred path is configurable per call. On a 401 from the direct path,
 * the managed path is retried as a delegated-auth refresh fallback. A
 * `GeminiManagedAuthUnavailableError` is thrown when managed auth is required
 * but unreachable, so callers can surface a retryable failure result.
 */

import {
  buildManagementHeaders,
  buildProxyUrl,
  getProxyTarget,
} from '../../proxy/proxy-target-resolver';
import { mapExternalProviderName } from '../../provider-capabilities';
import { sanitizeEmail } from '../../auth/auth-utils';
import { MANAGEMENT_API_TIMEOUT_MS, SECONDARY_REQUEST_TIMEOUT_MS } from './constants';
import { getRemainingTimeoutMs, normalizeStringValue, safeParseJson } from './shared-utils';
import type {
  ManagedGeminiAuthContext,
  ManagedGeminiAuthLookupResult,
  ManagedGeminiRequestResult,
  ManagedResponse,
  ManagementApiCallResponse,
  ManagementAuthFile,
} from './types';

/**
 * Thrown when Gemini delegated auth refresh via the CLIProxy management API
 * is required but temporarily unreachable. Callers translate this into a
 * retryable failure result.
 */
export class GeminiManagedAuthUnavailableError extends Error {
  constructor() {
    super('CLIProxy managed Gemini auth is temporarily unavailable');
    this.name = 'GeminiManagedAuthUnavailableError';
  }
}

/**
 * Read a fetch Response into the normalized {@link ManagedResponse} shape.
 * `viaManagement` marks whether the response came through the managed API so
 * downstream log messages can attribute the source correctly.
 */
export async function readManagedResponse(
  response: Response,
  viaManagement: boolean
): Promise<ManagedResponse> {
  const bodyText = await response.text();
  return {
    status: response.status,
    bodyText,
    json: safeParseJson(bodyText),
    viaManagement,
  };
}

/**
 * Check whether a filename matches the Gemini CLI auth file naming patterns.
 * Recognizes three patterns:
 *   - legacy:  gemini-*.json
 *   - new:     *-gen-lang-client-*.json
 *   - email:   contains "@" (verified against type inside the payload later)
 */
export function isGeminiAuthFile(filename: string): boolean {
  if (!filename.endsWith('.json')) return false;
  // Legacy pattern: gemini-email.json
  if (filename.startsWith('gemini-')) return true;
  // New pattern: email-gen-lang-client-projectId.json
  if (filename.includes('-gen-lang-client-')) return true;
  // Check if contains @ (email pattern) - will verify type inside
  if (filename.includes('@')) return true;
  return false;
}

/**
 * Determine whether a management-API auth-file descriptor belongs to the
 * given Gemini account. Matches on provider/type normalized to "gemini",
 * then on email, filename, or sanitized email substring.
 */
export function isGeminiAuthFileForAccount(file: ManagementAuthFile, accountId: string): boolean {
  const rawProvider = normalizeStringValue(file.provider ?? file.type);
  if (!rawProvider || mapExternalProviderName(rawProvider) !== 'gemini') {
    return false;
  }

  const email = normalizeStringValue(file.email);
  const normalizedAccountId = accountId.trim().toLowerCase();
  if (email?.toLowerCase() === normalizedAccountId) {
    return true;
  }

  const normalizedName = normalizeStringValue(file.name);
  if (!normalizedName) {
    return false;
  }

  const normalizedFileName = normalizedName.toLowerCase();
  const sanitizedAccount = sanitizeEmail(accountId).toLowerCase();
  return (
    normalizedFileName === `gemini-${sanitizedAccount}.json` ||
    normalizedFileName.startsWith(`${normalizedAccountId}-gen-lang-client-`) ||
    normalizedFileName.includes(sanitizedAccount)
  );
}

/**
 * Look up the management-API auth index for a Gemini account.
 * Hits `/v0/management/auth-files` and matches the entry for this account.
 * Returns `{ unavailable: true }` if the management API is unreachable or
 * returns a non-OK response, so callers can fall back to direct auth.
 */
export async function findManagedGeminiAuthIndex(
  accountId: string,
  timeoutMs: number
): Promise<ManagedGeminiAuthLookupResult> {
  const target = getProxyTarget();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(buildProxyUrl(target, '/v0/management/auth-files'), {
      signal: controller.signal,
      headers: buildManagementHeaders(target),
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return { authIndex: null, unavailable: true };
    }

    const data = (await response.json()) as { files?: ManagementAuthFile[] };
    const match = data.files?.find((file) => isGeminiAuthFileForAccount(file, accountId));
    return { authIndex: match?.auth_index ?? null, unavailable: false };
  } catch {
    clearTimeout(timeoutId);
    return { authIndex: null, unavailable: true };
  }
}

/**
 * Look up the management auth index for a Gemini account, deduping concurrent
 * lookups for the same account via the shared {@link ManagedGeminiAuthContext}.
 * The first caller wins; subsequent callers await the same promise.
 */
export async function getManagedGeminiAuthIndex(
  accountId: string,
  timeoutMs: number,
  context?: ManagedGeminiAuthContext
): Promise<ManagedGeminiAuthLookupResult> {
  if (!context) {
    return await findManagedGeminiAuthIndex(accountId, timeoutMs);
  }

  context.authIndexLookupPromise ??= findManagedGeminiAuthIndex(accountId, timeoutMs);
  return await context.authIndexLookupPromise;
}

/**
 * Perform a single upstream request to the Gemini CLI API via the CLIProxy
 * management `/v0/management/api-call` endpoint. Uses `$TOKEN$` substitution
 * so the live token never leaves the management API. Returns
 * `{ unavailable: true }` if the management path is unreachable; returns
 * `{ response: null, unavailable: false }` if the request succeeded but no
 * matching auth file was found.
 */
export async function performManagedGeminiRequest(
  accountId: string,
  url: string,
  body: string,
  timeoutMs: number,
  authContext?: ManagedGeminiAuthContext
): Promise<ManagedGeminiRequestResult> {
  const deadlineMs = Date.now() + timeoutMs;
  const lookupResult = await getManagedGeminiAuthIndex(
    accountId,
    getRemainingTimeoutMs(deadlineMs),
    authContext
  );
  if (lookupResult.unavailable) {
    return { response: null, unavailable: true };
  }

  const authIndex = lookupResult.authIndex;
  if (authIndex === null || authIndex === undefined) {
    return { response: null, unavailable: false };
  }

  const target = getProxyTarget();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), getRemainingTimeoutMs(deadlineMs));

  try {
    const response = await fetch(buildProxyUrl(target, '/v0/management/api-call'), {
      method: 'POST',
      signal: controller.signal,
      headers: buildManagementHeaders(target, {
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({
        auth_index: authIndex,
        method: 'POST',
        url,
        header: {
          Authorization: 'Bearer $TOKEN$',
          'Content-Type': 'application/json',
        },
        data: body,
      }),
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return { response: null, unavailable: true };
    }

    const apiResponse = (await response.json()) as ManagementApiCallResponse;
    const bodyText = typeof apiResponse.body === 'string' ? apiResponse.body : '';
    return {
      response: {
        status: typeof apiResponse.status_code === 'number' ? apiResponse.status_code : 500,
        bodyText,
        json: safeParseJson(bodyText),
        viaManagement: true,
      },
      unavailable: false,
    };
  } catch {
    clearTimeout(timeoutId);
    return { response: null, unavailable: true };
  }
}

/**
 * Perform a Gemini CLI upstream request, preferring the managed path when
 * requested and falling back to direct bearer-token auth. On a 401 from the
 * direct path, retries via managed auth as a delegated-auth refresh; throws
 * {@link GeminiManagedAuthUnavailableError} if that retry is unreachable.
 *
 * @param accountId     Account identifier (email), used for managed auth lookup.
 * @param accessToken   Bearer token for the direct path. Never logged.
 * @param url           Target Gemini CLI API URL.
 * @param body          JSON request body string.
 * @param preferManagement When true, try the managed path first.
 * @param authContext   Optional shared context to dedupe auth-index lookups.
 */
export async function performGeminiCliRequest(
  accountId: string,
  accessToken: string,
  url: string,
  body: string,
  preferManagement = false,
  authContext?: ManagedGeminiAuthContext
): Promise<ManagedResponse> {
  let managementAttempted = false;
  let managementUnavailable = false;

  if (preferManagement) {
    managementAttempted = true;
    const managedResult = await performManagedGeminiRequest(
      accountId,
      url,
      body,
      MANAGEMENT_API_TIMEOUT_MS,
      authContext
    );
    managementUnavailable = managedResult.unavailable;
    if (managedResult.response) {
      return managedResult.response;
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    managementAttempted ? SECONDARY_REQUEST_TIMEOUT_MS : MANAGEMENT_API_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body,
    });
    clearTimeout(timeoutId);

    const directResult = await readManagedResponse(response, false);
    if (directResult.status !== 401) {
      return directResult;
    }

    if (managementAttempted) {
      if (managementUnavailable) {
        throw new GeminiManagedAuthUnavailableError();
      }
      return directResult;
    }

    const managedResult = await performManagedGeminiRequest(
      accountId,
      url,
      body,
      SECONDARY_REQUEST_TIMEOUT_MS,
      authContext
    );
    if (managedResult.response) {
      return managedResult.response;
    }
    if (managedResult.unavailable) {
      throw new GeminiManagedAuthUnavailableError();
    }
    return directResult;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}
