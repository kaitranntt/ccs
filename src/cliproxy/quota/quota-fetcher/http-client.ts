/**
 * HTTP transport for Antigravity quota requests.
 *
 * Wraps fetch() with three fallback strategies:
 *  1. Direct call with the local access token.
 *  2. If that returns 401 (token rejected), retry through CLIProxy management
 *     auth using the proxy's stored token.
 *  3. For loadCodeAssist, fall back across the daily then prod Cloud Code hosts.
 *
 * Every call is bounded by MANAGEMENT_API_TIMEOUT_MS via an AbortController.
 * Network errors become synthetic 503 responses; abort timeouts become 408.
 */

import { sanitizeEmail } from '../../auth/auth-utils';
import {
  buildManagementHeaders,
  buildProxyUrl,
  getProxyTarget,
} from '../../proxy/proxy-target-resolver';
import { MANAGEMENT_API_TIMEOUT_MS } from './constants';
import type { ManagedResponse, ManagementApiCallResponse, ManagementAuthFile } from './types';

/** Best-effort JSON.parse; returns null on failure. */
export function safeParseJson(bodyText: string): unknown {
  try {
    return JSON.parse(bodyText);
  } catch {
    return null;
  }
}

/** Read the response body once and return a normalized ManagedResponse. */
async function readManagedResponse(
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

/** Does this management-API auth file belong to the given Antigravity account? */
function isAntigravityAuthFileForAccount(file: ManagementAuthFile, accountId: string): boolean {
  const provider = (file.provider || file.type || '').trim().toLowerCase();
  if (provider !== 'antigravity' && provider !== 'agy') {
    return false;
  }

  const normalizedAccount = accountId.trim().toLowerCase();
  const normalizedEmail = file.email?.trim().toLowerCase();
  if (normalizedEmail && normalizedEmail === normalizedAccount) {
    return true;
  }

  const normalizedName = file.name?.trim().toLowerCase();
  if (!normalizedName) {
    return false;
  }

  const sanitizedAccount = sanitizeEmail(accountId).toLowerCase();
  return (
    normalizedName === `antigravity-${sanitizedAccount}.json` ||
    normalizedName === `agy-${sanitizedAccount}.json`
  );
}

/** Ask CLIProxy management API for the auth_index of the Antigravity account. */
async function findManagedAntigravityAuthIndex(accountId: string): Promise<string | number | null> {
  const target = getProxyTarget();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MANAGEMENT_API_TIMEOUT_MS);

  try {
    const response = await fetch(buildProxyUrl(target, '/v0/management/auth-files'), {
      signal: controller.signal,
      headers: buildManagementHeaders(target),
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { files?: ManagementAuthFile[] };
    const match = data.files?.find((file) => isAntigravityAuthFileForAccount(file, accountId));
    return match?.auth_index ?? null;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

/**
 * Run a request through the CLIProxy management api-call endpoint using the
 * proxy's stored token (substituted server-side as $TOKEN$). Returns null if
 * the proxy can't handle the request.
 */
async function performManagedAntigravityRequest(
  accountId: string,
  url: string,
  headers: Record<string, string>,
  body: string
): Promise<ManagedResponse | null> {
  const authIndex = await findManagedAntigravityAuthIndex(accountId);
  if (authIndex === null || authIndex === undefined) {
    return null;
  }

  const target = getProxyTarget();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MANAGEMENT_API_TIMEOUT_MS);

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
          ...headers,
          Authorization: 'Bearer $TOKEN$',
        },
        data: body,
      }),
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const apiResponse = (await response.json()) as ManagementApiCallResponse;
    const bodyText = typeof apiResponse.body === 'string' ? apiResponse.body : '';
    return {
      status: typeof apiResponse.status_code === 'number' ? apiResponse.status_code : 500,
      bodyText,
      json: safeParseJson(bodyText),
      viaManagement: true,
    };
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

/**
 * Perform a single Antigravity POST. Tries direct with the local access token
 * first; on 401, retries through CLIProxy management auth. Network errors map
 * to synthetic 503 responses so the caller's status-based classifier still
 * works; abort timeouts map to 408.
 */
export async function performAntigravityRequest(
  accountId: string,
  accessToken: string,
  url: string,
  headers: Record<string, string>,
  body: string
): Promise<ManagedResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MANAGEMENT_API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        ...headers,
        Authorization: `Bearer ${accessToken}`,
      },
      body,
    });
    clearTimeout(timeoutId);

    const directResult = await readManagedResponse(response, false);
    if (directResult.status !== 401) {
      return directResult;
    }

    const managedResult = await performManagedAntigravityRequest(accountId, url, headers, body);
    return managedResult ?? directResult;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        status: 408,
        bodyText: '',
        json: null,
        viaManagement: false,
      };
    }

    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      status: 503,
      bodyText: message,
      json: null,
      viaManagement: false,
    };
  }
}

/**
 * Run a request against each base URL in order, returning the first 2xx
 * response. If none succeed, return the last failure (or a synthetic 503 if
 * no URLs were attempted).
 */
export async function performAntigravityRequestWithBaseUrlFallback(
  accountId: string,
  accessToken: string,
  baseUrls: readonly string[],
  apiPath: string,
  headers: Record<string, string>,
  body: string
): Promise<ManagedResponse> {
  let lastResponse: ManagedResponse | null = null;

  for (const baseUrl of baseUrls) {
    const response = await performAntigravityRequest(
      accountId,
      accessToken,
      `${baseUrl}/${apiPath}`,
      headers,
      body
    );
    if (response.status >= 200 && response.status < 300) {
      return response;
    }
    lastResponse = response;
  }

  return (
    lastResponse ?? {
      status: 503,
      bodyText: 'No Antigravity API endpoint available',
      json: null,
      viaManagement: false,
    }
  );
}
