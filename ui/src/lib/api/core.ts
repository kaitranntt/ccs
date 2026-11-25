import type { CLIProxyProvider } from '../provider-config';

export const API_BASE_URL = '/api';
export const API_CONFLICT_ERROR_CODE = 'CONFLICT';

export class ApiConflictError extends Error {
  readonly code = API_CONFLICT_ERROR_CODE;

  constructor(message = 'Resource modified externally') {
    super(message);
    this.name = 'ApiConflictError';
  }
}

export function isApiConflictError(error: unknown): error is Error & { code: string } {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { code?: unknown }).code === API_CONFLICT_ERROR_CODE
  );
}

export function withApiBase(path: string): string {
  if (!path) {
    return API_BASE_URL;
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  if (path === API_BASE_URL || path.startsWith(`${API_BASE_URL}/`)) {
    return path;
  }

  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

async function parseErrorMessage(response: Response): Promise<string> {
  const fallbackMessage = `Request failed (${response.status}${response.statusText ? ` ${response.statusText}` : ''})`;
  const bodyText = await response.text();
  if (!bodyText) {
    return fallbackMessage;
  }

  try {
    const parsed = JSON.parse(bodyText) as { error?: string; message?: string };
    if (parsed.error?.trim()) {
      return parsed.error;
    }
    if (parsed.message?.trim()) {
      return parsed.message;
    }
    return fallbackMessage;
  } catch {
    return bodyText.trim() || fallbackMessage;
  }
}

export async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(withApiBase(url), {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const contentType = res.headers.get('content-type')?.toLowerCase() ?? '';
  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }

  const bodyText = await res.text();
  if (!bodyText) {
    return undefined as T;
  }

  try {
    return JSON.parse(bodyText) as T;
  } catch {
    return bodyText as T;
  }
}

export type CliTarget = 'claude' | 'droid' | 'codex';

export interface CliproxyBridgeMetadata {
  provider: CLIProxyProvider;
  providerDisplayName: string;
  routePath: string;
  currentBaseUrl: string;
  source: 'local' | 'remote';
  usesCurrentTarget: boolean;
  usesCurrentAuthToken: boolean;
}
