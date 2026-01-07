/**
 * React Query hooks for CLIProxy variants and accounts
 * Phase 03: REST API Routes & CRUD
 * Phase 06: Multi-Account Management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type CreateVariant, type UpdateVariant, type CreatePreset } from '@/lib/api-client';
import { toast } from 'sonner';

export function useCliproxy() {
  return useQuery({
    queryKey: ['cliproxy'],
    queryFn: () => api.cliproxy.list(),
  });
}

export function useCliproxyAuth() {
  return useQuery({
    queryKey: ['cliproxy-auth'],
    queryFn: () => api.cliproxy.getAuthStatus(),
  });
}

export function useCreateVariant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateVariant) => api.cliproxy.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cliproxy'] });
      toast.success('Variant created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdateVariant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, data }: { name: string; data: UpdateVariant }) =>
      api.cliproxy.update(name, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cliproxy'] });
      toast.success('Variant updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useDeleteVariant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => api.cliproxy.delete(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cliproxy'] });
      toast.success('Variant deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Multi-account management hooks
export function useCliproxyAccounts() {
  return useQuery({
    queryKey: ['cliproxy-accounts'],
    queryFn: () => api.cliproxy.accounts.list(),
  });
}

export function useProviderAccounts(provider: string) {
  return useQuery({
    queryKey: ['cliproxy-accounts', provider],
    queryFn: () => api.cliproxy.accounts.listByProvider(provider),
    enabled: !!provider,
  });
}

export function useSetDefaultAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ provider, accountId }: { provider: string; accountId: string }) =>
      api.cliproxy.accounts.setDefault(provider, accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cliproxy-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['cliproxy-auth'] });
      toast.success('Default account updated');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useRemoveAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ provider, accountId }: { provider: string; accountId: string }) =>
      api.cliproxy.accounts.remove(provider, accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cliproxy-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['cliproxy-auth'] });
      toast.success('Account removed');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function usePauseAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ provider, accountId }: { provider: string; accountId: string }) =>
      api.cliproxy.accounts.pause(provider, accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cliproxy-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['cliproxy-auth'] });
      toast.success('Account paused');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useResumeAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ provider, accountId }: { provider: string; accountId: string }) =>
      api.cliproxy.accounts.resume(provider, accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cliproxy-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['cliproxy-auth'] });
      toast.success('Account resumed');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// OAuth flow hook
export function useStartAuth() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ provider, nickname }: { provider: string; nickname?: string }) =>
      api.cliproxy.auth.start(provider, nickname),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['cliproxy-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['cliproxy-auth'] });
      toast.success(`Account added for ${variables.provider}`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Cancel OAuth flow hook
export function useCancelAuth() {
  return useMutation({
    mutationFn: (provider: string) => api.cliproxy.auth.cancel(provider),
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Kiro IDE import hook (alternative auth path when OAuth callback fails)
export function useKiroImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.cliproxy.auth.kiroImport(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['cliproxy-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['cliproxy-auth'] });
      if (data.account) {
        toast.success(`Imported Kiro account: ${data.account.email || data.account.id}`);
      } else {
        toast.success('Kiro token imported');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Stats and models hooks for Overview tab
export function useCliproxyStats() {
  return useQuery({
    queryKey: ['cliproxy-stats'],
    queryFn: () => api.cliproxy.stats(),
    refetchInterval: 30000, // Refresh every 30s
  });
}

export function useCliproxyModels() {
  return useQuery({
    queryKey: ['cliproxy-models'],
    queryFn: () => api.cliproxy.models(),
  });
}

export function useUpdateModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ provider, model }: { provider: string; model: string }) =>
      api.cliproxy.updateModel(provider, model),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cliproxy-models'] });
      toast.success('Model updated');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// ==================== Presets ====================

export function usePresets(profile: string) {
  return useQuery({
    queryKey: ['presets', profile],
    queryFn: () => api.presets.list(profile),
    enabled: !!profile,
  });
}

export function useCreatePreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ profile, data }: { profile: string; data: CreatePreset }) =>
      api.presets.create(profile, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['presets', variables.profile] });
      toast.success(`Preset "${variables.data.name}" saved`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useDeletePreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ profile, name }: { profile: string; name: string }) =>
      api.presets.delete(profile, name),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['presets', variables.profile] });
      toast.success('Preset deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// ==================== Proxy Process Status ====================

export function useProxyStatus() {
  return useQuery({
    queryKey: ['proxy-status'],
    queryFn: () => api.cliproxy.proxyStatus(),
    refetchInterval: 30000, // Refresh every 30s as backup (websocket is primary)
  });
}

export function useStartProxy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.cliproxy.proxyStart(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['proxy-status'] });
      if (data.alreadyRunning) {
        toast.info('CLIProxy was already running');
      } else if (data.started) {
        toast.success('CLIProxy started successfully');
      } else {
        toast.error(data.error || 'Failed to start CLIProxy');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useStopProxy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.cliproxy.proxyStop(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['proxy-status'] });
      if (data.stopped) {
        toast.success(
          `CLIProxy stopped${data.sessionCount ? ` (${data.sessionCount} session(s) disconnected)` : ''}`
        );
      } else {
        toast.error(data.error || 'Failed to stop CLIProxy');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// ==================== Update Check ====================

export function useCliproxyUpdateCheck() {
  return useQuery({
    queryKey: ['cliproxy-update-check'],
    queryFn: () => api.cliproxy.updateCheck(),
    staleTime: 60 * 60 * 1000, // 1 hour (matches backend cache)
    refetchInterval: 60 * 60 * 1000, // Refresh every hour
    refetchOnWindowFocus: false, // Don't refresh on window focus (save API calls)
  });
}

// ==================== Version Management ====================

export function useCliproxyVersions() {
  return useQuery({
    queryKey: ['cliproxy-versions'],
    queryFn: () => api.cliproxy.versions(),
    staleTime: 60 * 60 * 1000, // 1 hour (matches backend cache)
    refetchOnWindowFocus: false,
  });
}

export function useInstallVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ version, force }: { version: string; force?: boolean }) =>
      api.cliproxy.install(version, force),
    onSuccess: (data) => {
      if (data.requiresConfirmation) {
        // Don't show toast - let caller handle confirmation dialog
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['cliproxy-versions'] });
      queryClient.invalidateQueries({ queryKey: ['cliproxy-update-check'] });
      queryClient.invalidateQueries({ queryKey: ['proxy-status'] });
      if (data.success) {
        toast.success(data.message || `Installed v${data.version}`);
      } else {
        toast.error(data.error || 'Installation failed');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useRestartProxy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.cliproxy.restart(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['proxy-status'] });
      if (data.success) {
        toast.success(`Proxy restarted on port ${data.port}`);
      } else {
        toast.error(data.error || 'Restart failed');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
