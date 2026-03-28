import { useMemo } from 'react';
import { parse as parseToml } from 'smol-toml';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiConflictError, withApiBase } from '@/lib/api-client';
import type {
  CodexDashboardDiagnostics,
  CodexRawConfigResponse,
} from '../../../src/web-server/services/compatible-cli-types';

type CodexRawConfig = CodexRawConfigResponse;

interface SaveCodexRawConfigInput {
  rawText: string;
  expectedMtime?: number;
}

interface SaveCodexRawConfigResponse {
  success: true;
  mtime: number;
}

function parseCodexRawConfigText(rawText: string): {
  config: Record<string, unknown> | null;
  parseError: string | null;
} {
  try {
    const parsed = rawText.trim() ? parseToml(rawText) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        config: null,
        parseError: 'TOML root must be a table.',
      };
    }
    return {
      config: parsed as Record<string, unknown>,
      parseError: null,
    };
  } catch (error) {
    return {
      config: null,
      parseError: (error as Error).message,
    };
  }
}

async function fetchCodexDiagnostics(): Promise<CodexDashboardDiagnostics> {
  const res = await fetch(withApiBase('/codex/diagnostics'));
  if (!res.ok) throw new Error('Failed to fetch Codex diagnostics');
  return res.json();
}

async function fetchCodexRawConfig(): Promise<CodexRawConfig> {
  const res = await fetch(withApiBase('/codex/config/raw'));
  if (!res.ok) throw new Error('Failed to fetch Codex raw config');
  return res.json();
}

async function saveCodexRawConfig(
  data: SaveCodexRawConfigInput
): Promise<SaveCodexRawConfigResponse> {
  const res = await fetch(withApiBase('/codex/config/raw'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (res.status === 409) throw new ApiConflictError('Codex raw config changed externally');

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || 'Failed to save Codex raw config');
  }
  return res.json();
}

export function useCodex() {
  const queryClient = useQueryClient();

  const diagnosticsQuery = useQuery({
    queryKey: ['codex-diagnostics'],
    queryFn: fetchCodexDiagnostics,
    refetchInterval: 10000,
  });

  const rawConfigQuery = useQuery({
    queryKey: ['codex-raw-config'],
    queryFn: fetchCodexRawConfig,
  });

  const saveRawConfigMutation = useMutation({
    mutationFn: saveCodexRawConfig,
    onSuccess: (result, variables) => {
      queryClient.setQueryData<CodexRawConfig>(['codex-raw-config'], (current) => {
        const path = current?.path ?? '$CODEX_HOME/config.toml';
        const resolvedPath = current?.resolvedPath ?? path;
        const parsed = parseCodexRawConfigText(variables.rawText);

        return {
          path,
          resolvedPath,
          exists: true,
          mtime: result.mtime,
          rawText: variables.rawText,
          config: parsed.config,
          parseError: parsed.parseError,
        };
      });
      queryClient.invalidateQueries({ queryKey: ['codex-diagnostics'] });
    },
  });

  return useMemo(
    () => ({
      diagnostics: diagnosticsQuery.data,
      diagnosticsLoading: diagnosticsQuery.isLoading,
      diagnosticsError: diagnosticsQuery.error,
      refetchDiagnostics: diagnosticsQuery.refetch,

      rawConfig: rawConfigQuery.data,
      rawConfigLoading: rawConfigQuery.isLoading,
      rawConfigError: rawConfigQuery.error,
      refetchRawConfig: rawConfigQuery.refetch,

      saveRawConfig: saveRawConfigMutation.mutate,
      saveRawConfigAsync: saveRawConfigMutation.mutateAsync,
      isSavingRawConfig: saveRawConfigMutation.isPending,
    }),
    [
      diagnosticsQuery.data,
      diagnosticsQuery.isLoading,
      diagnosticsQuery.error,
      diagnosticsQuery.refetch,
      rawConfigQuery.data,
      rawConfigQuery.isLoading,
      rawConfigQuery.error,
      rawConfigQuery.refetch,
      saveRawConfigMutation.mutate,
      saveRawConfigMutation.mutateAsync,
      saveRawConfigMutation.isPending,
    ]
  );
}
