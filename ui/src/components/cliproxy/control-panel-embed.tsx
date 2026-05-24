/**
 * CLIProxy Control Panel Embed
 *
 * Embeds the CLIProxy management.html with dashboard-aware authentication.
 * Local embeds run through the dashboard reverse proxy and need the upstream
 * management app's auth state pre-seeded before the iframe loads.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { RefreshCw, AlertCircle, Gauge } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api, withApiBase } from '@/lib/api-client';
import type { CliproxyServerConfig } from '@/lib/api-client';
import { CLIPROXY_DEFAULT_PORT } from '@/lib/preset-utils';
import { useTranslation } from 'react-i18next';

interface AuthTokensResponse {
  apiKey: { value: string; isCustom: boolean };
  managementSecret: { value: string; isCustom: boolean };
}

interface ControlPanelEmbedProps {
  port?: number;
}

// These keys intentionally mirror the upstream management-center auth schema.
// Keep them in sync with external/Cli-Proxy-API-Management-Center/src/stores/useAuthStore.ts.
const CONTROL_PANEL_AUTH_STORAGE_KEY = 'cli-proxy-auth';
const CONTROL_PANEL_LOGIN_FLAG_KEY = 'isLoggedIn';
const CONTROL_PANEL_API_BASE_KEY = 'apiBase';
const CONTROL_PANEL_API_URL_KEY = 'apiUrl';
const CONTROL_PANEL_MANAGEMENT_KEY = 'managementKey';

function resolveEmbeddedApiBase(checkUrl: string): string {
  if (checkUrl.startsWith('/')) {
    return new URL(checkUrl.replace(/\/$/, ''), window.location.origin).href;
  }

  return checkUrl.replace(/\/$/, '');
}

function seedLocalControlPanelSession(apiBase: string, managementKey: string): void {
  // The upstream management-center app restores auth from these legacy keys.
  // Clear the persisted auth snapshot first so stale iframe state cannot win.
  window.localStorage.removeItem(CONTROL_PANEL_AUTH_STORAGE_KEY);
  window.localStorage.setItem(CONTROL_PANEL_API_BASE_KEY, apiBase);
  window.localStorage.setItem(CONTROL_PANEL_API_URL_KEY, apiBase);
  window.localStorage.setItem(CONTROL_PANEL_MANAGEMENT_KEY, managementKey);
  window.localStorage.setItem(CONTROL_PANEL_LOGIN_FLAG_KEY, 'true');
}

function clearLocalControlPanelSession(): void {
  window.localStorage.removeItem(CONTROL_PANEL_AUTH_STORAGE_KEY);
  window.localStorage.removeItem(CONTROL_PANEL_API_BASE_KEY);
  window.localStorage.removeItem(CONTROL_PANEL_API_URL_KEY);
  window.localStorage.removeItem(CONTROL_PANEL_MANAGEMENT_KEY);
  window.localStorage.removeItem(CONTROL_PANEL_LOGIN_FLAG_KEY);
}

function clearPersistedLocalControlPanelSecret(): void {
  window.localStorage.removeItem(CONTROL_PANEL_MANAGEMENT_KEY);
}

export function ControlPanelEmbed({ port = CLIPROXY_DEFAULT_PORT }: ControlPanelEmbedProps) {
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loadedFrameKey, setLoadedFrameKey] = useState<string | null>(null);
  const [iframeRevision, setIframeRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Fetch cliproxy_server config for remote/local mode detection
  const { data: cliproxyConfig, error: configError } = useQuery<CliproxyServerConfig>({
    queryKey: ['cliproxy-server-config'],
    queryFn: () => api.cliproxyServer.get(),
    staleTime: 30000, // 30 seconds
  });

  // Log config fetch errors (fallback to local mode on error)
  useEffect(() => {
    if (configError) {
      console.warn('[ControlPanelEmbed] Config fetch failed, using local mode:', configError);
    }
  }, [configError]);

  const isRemoteConfig = Boolean(cliproxyConfig?.remote?.enabled && cliproxyConfig?.remote?.host);

  // Fetch auth tokens for local mode and seed the upstream auth keys before the iframe mounts.
  const { data: authTokens, error: authTokensError } = useQuery<AuthTokensResponse>({
    queryKey: ['auth-tokens-raw', isRemoteConfig ? 'remote' : 'local'],
    enabled: cliproxyConfig !== undefined && !isRemoteConfig,
    queryFn: async () => {
      try {
        const response = await fetch(withApiBase('/settings/auth/tokens/raw'));
        if (!response.ok) throw new Error('Failed to fetch auth tokens');

        const tokens = (await response.json()) as AuthTokensResponse;
        const managementSecret = tokens.managementSecret.value.trim();
        if (!managementSecret) throw new Error('Management secret missing');

        seedLocalControlPanelSession(
          resolveEmbeddedApiBase(withApiBase('/cliproxy-local/')),
          managementSecret
        );

        return tokens;
      } catch (error) {
        clearLocalControlPanelSession();
        throw error;
      }
    },
    staleTime: 30000, // 30 seconds
  });

  // Calculate URLs and settings based on remote or local mode
  const { managementUrl, checkUrl, authToken, isRemote, displayHost } = useMemo(() => {
    const remote = cliproxyConfig?.remote;
    const localPort = cliproxyConfig?.local?.port ?? port;

    if (remote?.enabled && remote?.host) {
      const protocol = remote.protocol || 'http';
      // Use port from config, or default based on protocol (443 for https, 8317 for http)
      const remotePort = remote.port || (protocol === 'https' ? 443 : CLIPROXY_DEFAULT_PORT);
      // Only include port in URL if it's non-standard
      const portSuffix =
        (protocol === 'https' && remotePort === 443) || (protocol === 'http' && remotePort === 80)
          ? ''
          : `:${remotePort}`;
      const baseUrl = `${protocol}://${remote.host}${portSuffix}`;

      return {
        managementUrl: `${baseUrl}/management.html`,
        checkUrl: `${baseUrl}/`,
        authToken: remote.auth_token || undefined,
        isRemote: true,
        displayHost: `${remote.host}${portSuffix}`,
      };
    }

    // Local mode - proxy through dashboard server to avoid cross-origin/port issues
    // (e.g., in Docker the browser cannot reach the internal CLIProxy port directly)
    return {
      managementUrl: withApiBase('/cliproxy-local/management.html'),
      checkUrl: withApiBase('/cliproxy-local/'),
      authToken: authTokens?.managementSecret?.value || undefined,
      isRemote: false,
      displayHost: `localhost:${localPort}`,
    };
  }, [cliproxyConfig, authTokens, port]);

  const iframeKey = `${managementUrl}:${isRemote ? 'remote' : 'local'}:${checkUrl}:${authToken ?? 'missing'}:${iframeRevision}`;
  const isSessionReady =
    cliproxyConfig !== undefined && (isRemote || Boolean(authTokens) || Boolean(authTokensError));

  useEffect(() => {
    if (authTokensError) {
      console.warn(
        '[ControlPanelEmbed] Failed to preload local control panel session, falling back to manual login:',
        authTokensError
      );
    }
  }, [authTokensError]);

  useEffect(() => {
    if (isRemote) {
      return;
    }

    const handleBeforeUnload = () => {
      clearLocalControlPanelSession();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearLocalControlPanelSession();
    };
  }, [isRemote]);

  const iframeLoaded = loadedFrameKey === iframeKey;
  const isLoading = !isSessionReady || !iframeLoaded;

  const postRemoteAutoLoginCredentials = () => {
    if (!isRemote || !iframeRef.current?.contentWindow || !authToken) {
      return;
    }

    try {
      const apiBase = resolveEmbeddedApiBase(checkUrl);
      const targetOrigin = new URL(`${apiBase}/`).origin;
      const iframeUrl = new URL(iframeRef.current.src, window.location.origin);

      if (iframeUrl.origin !== targetOrigin) {
        console.warn('[ControlPanelEmbed] Remote iframe origin mismatch, skipping postMessage');
        return;
      }

      iframeRef.current.contentWindow.postMessage(
        {
          type: 'ccs-auto-login',
          apiBase,
          managementKey: authToken,
        },
        targetOrigin
      );
    } catch (error) {
      console.debug('[ControlPanelEmbed] Remote postMessage bootstrap failed:', error);
    }
  };

  // Check if CLIProxy is running
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const updateConnectionState = (connected: boolean, nextError: string | null) => {
      if (cancelled) return;
      setIsConnected(connected);
      setError(nextError);
    };

    const checkConnection = async () => {
      try {
        if (isRemote) {
          // Remote mode: use the test endpoint via same-origin API to avoid CORS
          const remote = cliproxyConfig?.remote;
          const result = await api.cliproxyServer.test({
            host: remote?.host ?? '',
            port: remote?.port,
            protocol: remote?.protocol ?? 'http',
            authToken: remote?.auth_token,
          });
          if (result?.reachable) {
            updateConnectionState(true, null);
          } else {
            updateConnectionState(
              false,
              result?.error
                ? `Remote CLIProxy at ${displayHost}: ${result.error}`
                : `Remote CLIProxy at ${displayHost} returned an error`
            );
          }
        } else {
          // Local mode: probe the proxied control panel root directly.
          const response = await fetch(checkUrl, { signal: controller.signal });
          if (response.ok) {
            updateConnectionState(true, null);
          } else {
            updateConnectionState(false, 'CLIProxy returned an error');
          }
        }
      } catch (e) {
        // Ignore abort errors (component unmounting)
        if (e instanceof Error && e.name === 'AbortError') return;

        updateConnectionState(
          false,
          isRemote
            ? `Remote CLIProxy at ${displayHost} is not reachable`
            : 'CLIProxy is not running'
        );
      }
    };

    // Start connection check with timeout
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    checkConnection().finally(() => clearTimeout(timeoutId));

    // Cleanup: abort fetch on unmount
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [checkUrl, isRemote, displayHost, cliproxyConfig]);

  const handleIframeLoad = () => {
    setLoadedFrameKey(iframeKey);
    postRemoteAutoLoginCredentials();
    if (!isRemote) {
      clearPersistedLocalControlPanelSecret();
    }
  };

  const handleRefresh = () => {
    if (!isRemote) {
      clearLocalControlPanelSession();
    }
    setLoadedFrameKey(null);
    setIframeRevision((value) => value + 1);
    setError(null);
    setIsConnected(false);
  };

  // Show error state if CLIProxy is not running
  if (!isConnected && error) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">{t('cliproxyHeader.cliproxyControlPanel')}</h2>
          </div>
          <button
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border rounded-md hover:bg-muted"
            onClick={handleRefresh}
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center bg-muted/20">
          <div className="text-center max-w-md px-8">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              {t('cliproxyHeader.cliproxyNotAvailable')}
            </h3>
            <p className="text-muted-foreground mb-4">{error}</p>
            <p className="text-sm text-muted-foreground">
              Start a CLIProxy session with{' '}
              <code className="bg-muted px-1 rounded">ccs gemini</code> or run{' '}
              <code className="bg-muted px-1 rounded">ccs config</code> which auto-starts it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 flex flex-col relative">
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {isRemote
                  ? `Loading Control Panel from ${displayHost}...`
                  : 'Loading Control Panel...'}
              </p>
            </div>
          </div>
        )}

        {/* Iframe */}
        {isSessionReady ? (
          <iframe
            key={iframeKey}
            ref={iframeRef}
            src={managementUrl}
            className="flex-1 w-full border-0"
            title="CLIProxy Management Panel"
            onLoad={handleIframeLoad}
          />
        ) : null}
      </div>
    </div>
  );
}
