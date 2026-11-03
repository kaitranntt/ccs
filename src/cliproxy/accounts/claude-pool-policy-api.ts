import { ConfigError } from '../../errors/error-types';
import {
  buildManagementHeaders,
  buildProxyUrl,
  type ProxyTarget,
} from '../proxy/proxy-target-resolver';

export interface ClaudePoolCredential {
  name: string;
  priority: number | null;
}

export interface ClaudePoolManagementApi {
  checkCapabilities(): Promise<void>;
  listCredentials(): Promise<ClaudePoolCredential[]>;
  setPriority(
    name: string,
    priority: number | null,
    expectedPriority: number | null
  ): Promise<void>;
}

export function createClaudePoolManagementApi(
  target: ProxyTarget,
  lifecycleSignal?: AbortSignal
): ClaudePoolManagementApi {
  async function request(endpoint: string, options: RequestInit = {}): Promise<unknown> {
    if (lifecycleSignal?.aborted)
      throw new ConfigError('Claude pool controller is stopping. Retry after it restarts.');
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (lifecycleSignal?.aborted) controller.abort();
    lifecycleSignal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(buildProxyUrl(target, `/v8/management/${endpoint}`), {
        ...options,
        headers: buildManagementHeaders(target, { 'Content-Type': 'application/json' }),
        signal: controller.signal,
      });
      if (!response.ok)
        throw new ConfigError(`Claude pool management request failed (${response.status}).`);
      return await response.json();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Claude pool management')) throw error;
      throw new ConfigError(
        'Claude pool management request failed. Verify the local proxy and management access.'
      );
    } finally {
      clearTimeout(timeout);
      lifecycleSignal?.removeEventListener('abort', abort);
    }
  }
  return {
    async checkCapabilities() {
      const capabilities = (await request('routing/capabilities')) as Record<string, unknown>;
      if (
        capabilities.provider_affinity_overrides !== true ||
        capabilities.local_builtin_selector !== true ||
        capabilities.credential_priority_cas !== true
      ) {
        throw new ConfigError(
          'Claude quota ordering requires provider-affinity support and the built-in local selector. Home and plugin schedulers are not supported.'
        );
      }
    },
    async listCredentials() {
      const response = (await request('credentials')) as { files?: unknown };
      if (!Array.isArray(response.files))
        throw new ConfigError('Invalid local proxy credential listing.');
      return response.files.flatMap((entry: unknown): ClaudePoolCredential[] => {
        if (!entry || typeof entry !== 'object') return [];
        const credential = entry as Record<string, unknown>;
        if (typeof credential.name !== 'string') return [];
        const priority = credential.priority;
        if (
          priority !== undefined &&
          (typeof priority !== 'number' || !Number.isSafeInteger(priority))
        ) {
          throw new ConfigError('Invalid priority in local proxy credential listing.');
        }
        return [
          { name: credential.name, priority: priority === undefined ? null : (priority as number) },
        ];
      });
    },
    async setPriority(name, priority, expectedPriority) {
      await request('credentials/priority', {
        method: 'PATCH',
        body: JSON.stringify({ name, priority, expected_priority: expectedPriority }),
      });
    },
  };
}
