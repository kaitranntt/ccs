/**
 * Proxy Config Hook
 */

import { useCallback, useState } from 'react';
import { api } from '@/lib/api-client';
import { useSettingsContext, useSettingsActions } from './context-hooks';
import type { CliproxyServerConfig } from '../types';

export function useProxyConfig() {
  const { state } = useSettingsContext();
  const actions = useSettingsActions();
  const [editedHost, setEditedHost] = useState<string | null>(null);
  const [editedPort, setEditedPort] = useState<string | null>(null);
  const [editedAuthToken, setEditedAuthToken] = useState<string | null>(null);
  const [editedManagementKey, setEditedManagementKey] = useState<string | null>(null);
  const [editedLocalPort, setEditedLocalPort] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      actions.setProxyLoading(true);
      actions.setProxyError(null);
      const data = await api.cliproxyServer.get();
      actions.setProxyConfig(data);
    } catch (err) {
      actions.setProxyError((err as Error).message);
    } finally {
      actions.setProxyLoading(false);
    }
  }, [actions]);

  const saveConfig = useCallback(
    async (updates: Partial<CliproxyServerConfig>) => {
      const config = state.proxyConfig;
      if (!config) return;

      const optimisticConfig = {
        remote: { ...config.remote, ...updates.remote },
        fallback: { ...config.fallback, ...updates.fallback },
        local: { ...config.local, ...updates.local },
      };
      actions.setProxyConfig(optimisticConfig);
      actions.setProxyTestResult(null);

      try {
        actions.setProxySaving(true);
        actions.setProxyError(null);

        const data = await api.cliproxyServer.update(updates);
        actions.setProxyConfig(data);
        actions.setProxySuccess(true);
        setTimeout(() => actions.setProxySuccess(false), 1500);
      } catch (err) {
        actions.setProxyConfig(config);
        actions.setProxyError((err as Error).message);
      } finally {
        actions.setProxySaving(false);
      }
    },
    [state.proxyConfig, actions]
  );

  const testConnection = useCallback(
    async (params: {
      host: string;
      port: string;
      protocol: 'http' | 'https';
      authToken: string;
    }) => {
      const { host, port, protocol, authToken } = params;
      if (!host) {
        actions.setProxyError('Host is required');
        return;
      }

      try {
        actions.setProxyTesting(true);
        actions.setProxyError(null);
        actions.setProxyTestResult(null);

        const portNum = port ? parseInt(port, 10) : undefined;
        const result = await api.cliproxyServer.test({
          host,
          port: portNum || undefined,
          protocol,
          authToken: authToken || undefined,
        });
        actions.setProxyTestResult(result);
      } catch (err) {
        actions.setProxyError((err as Error).message);
      } finally {
        actions.setProxyTesting(false);
      }
    },
    [actions]
  );

  return {
    config: state.proxyConfig,
    loading: state.proxyLoading,
    saving: state.proxySaving,
    error: state.proxyError,
    success: state.proxySuccess,
    testResult: state.proxyTestResult,
    testing: state.proxyTesting,
    editedHost,
    setEditedHost,
    editedPort,
    setEditedPort,
    editedAuthToken,
    setEditedAuthToken,
    editedManagementKey,
    setEditedManagementKey,
    editedLocalPort,
    setEditedLocalPort,
    fetchConfig,
    saveConfig,
    testConnection,
  };
}
