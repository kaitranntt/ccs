import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api-client';

const POLICY_QUERY_KEY = ['cliproxy-claude-pool-policy'];

export function useClaudePoolPolicy(enabled = true) {
  return useQuery({
    queryKey: POLICY_QUERY_KEY,
    queryFn: () => api.cliproxy.getClaudePoolPolicy(),
    enabled,
    refetchInterval: 15_000,
    retry: 1,
  });
}

export function useClaudePoolPolicyAccounts(enabled: boolean) {
  return useQuery({
    queryKey: ['cliproxy-accounts', 'claude'],
    queryFn: () => api.cliproxy.accounts.listByProvider('claude'),
    enabled,
  });
}

export function useUpdateClaudePoolPolicy() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (enabled: boolean) => api.cliproxy.updateClaudePoolPolicy(enabled),
    onSuccess: (result) => {
      queryClient.setQueryData(POLICY_QUERY_KEY, result);
      queryClient.invalidateQueries({ queryKey: POLICY_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['cliproxy-routing'] });
      queryClient.invalidateQueries({ queryKey: ['cliproxy-config-yaml'] });
      if (
        result.status === 'degraded' ||
        result.status === 'pending' ||
        (result.enabled && !result.controllerActive)
      ) {
        toast.info(t('claudePoolPolicy.savedPending'));
      } else {
        toast.success(
          t(result.enabled ? 'claudePoolPolicy.enabledToast' : 'claudePoolPolicy.disabledToast')
        );
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
