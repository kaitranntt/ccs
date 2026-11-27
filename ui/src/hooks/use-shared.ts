import { useQuery } from '@tanstack/react-query';

export type SharedItemSource = 'ccs-shared' | 'claude-default';

export interface SharedItem {
  name: string;
  description: string;
  path: string;
  type: 'command' | 'skill' | 'agent' | 'plugin';
  source?: SharedItemSource;
}

export type SharedResourceTab = 'commands' | 'skills' | 'agents' | 'plugins' | 'settings';

export interface SharedSummary {
  commands: number;
  skills: number;
  agents: number;
  plugins: number;
  settings: boolean;
  total: number;
  symlinkStatus: { valid: boolean; message: string };
}

interface SharedItemContent {
  content: string;
  contentPath: string;
}

interface SharedItemContentPayload {
  content: string;
  contentPath?: string;
}

function extractErrorFromPayload(payload: unknown, fallbackMessage: string): string {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'error' in payload &&
    typeof payload.error === 'string'
  ) {
    return payload.error;
  }

  return fallbackMessage;
}

function parseJsonPayload(payloadText: string): unknown | null {
  const trimmed = payloadText.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function looksLikeHtml(payloadText: string): boolean {
  const trimmed = payloadText.trim().toLowerCase();
  return trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html');
}

function isSharedItemContentPayload(payload: unknown): payload is SharedItemContentPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.content !== 'string') {
    return false;
  }

  if ('contentPath' in candidate && typeof candidate.contentPath !== 'string') {
    return false;
  }

  return true;
}

async function readJsonOrThrow<T>(response: Response, fallbackMessage: string): Promise<T> {
  const payloadText = await response.text();
  const payload = parseJsonPayload(payloadText);

  if (!response.ok) {
    const errorMessage = extractErrorFromPayload(payload, fallbackMessage);
    throw new Error(errorMessage);
  }

  if (payload === null) {
    throw new Error(fallbackMessage);
  }

  return payload as T;
}

export function useSharedSummary() {
  return useQuery<SharedSummary>({
    queryKey: ['shared', 'summary'],
    queryFn: async () => {
      const res = await fetch('/api/shared/summary');
      return readJsonOrThrow<SharedSummary>(res, 'Failed to fetch shared summary');
    },
  });
}

export function useSharedItems(type: SharedResourceTab) {
  return useQuery<{ items: SharedItem[] }>({
    queryKey: ['shared', type],
    enabled: type !== 'settings',
    queryFn: async () => {
      if (type === 'settings') {
        return { items: [] };
      }

      const res = await fetch(`/api/shared/${type}`);
      return readJsonOrThrow<{ items: SharedItem[] }>(res, `Failed to fetch shared ${type}`);
    },
  });
}

export function useSharedItemContent(type: SharedResourceTab, itemPath: string | null) {
  return useQuery<SharedItemContent>({
    queryKey: ['shared', type, 'content', itemPath],
    enabled: typeof itemPath === 'string' && itemPath.length > 0,
    queryFn: async () => {
      if (!itemPath) {
        throw new Error('Missing shared item path');
      }

      const params = new URLSearchParams({
        type,
        path: itemPath,
      });
      const res = await fetch(`/api/shared/content?${params.toString()}`);
      const payloadText = await res.text();
      const payload = parseJsonPayload(payloadText);

      if (!res.ok) {
        throw new Error(extractErrorFromPayload(payload, `Failed to fetch shared ${type} content`));
      }

      if (isSharedItemContentPayload(payload)) {
        return {
          content: payload.content,
          contentPath:
            typeof payload.contentPath === 'string' && payload.contentPath.length > 0
              ? payload.contentPath
              : itemPath,
        };
      }

      if (payloadText.trim().length > 0) {
        if (looksLikeHtml(payloadText)) {
          throw new Error(
            'Shared content endpoint unavailable. Restart `ccs config` and try again.'
          );
        }

        return {
          content: payloadText,
          contentPath: itemPath,
        };
      }

      throw new Error(`Failed to fetch shared ${type} content`);
    },
  });
}
