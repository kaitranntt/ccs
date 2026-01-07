/**
 * Proxy Section
 * Settings section for CLIProxyAPI configuration (local/remote)
 */

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { RefreshCw, CheckCircle2, AlertCircle, Laptop, Cloud } from 'lucide-react';
import { useProxyConfig, useRawConfig } from '../../hooks';
import { LocalProxyCard } from './local-proxy-card';
import { RemoteProxyCard } from './remote-proxy-card';

export default function ProxySection() {
  const {
    config,
    loading,
    saving,
    error,
    success,
    testResult,
    testing,
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
  } = useProxyConfig();

  const { fetchRawConfig } = useRawConfig();

  // Load data on mount
  useEffect(() => {
    fetchConfig();
    fetchRawConfig();
  }, [fetchConfig, fetchRawConfig]);

  if (loading || !config) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  const isRemoteMode = config.remote.enabled ?? false;
  const remoteConfig = config.remote;
  const fallbackConfig = config.fallback;

  // Get display values (edited or from config)
  const hostInput = config.remote.host ?? '';
  const portInput = config.remote.port !== undefined ? config.remote.port.toString() : '';
  const authTokenInput = config.remote.auth_token ?? '';
  const managementKeyInput = config.remote.management_key ?? '';
  const localPortInput = (config.local.port ?? 8317).toString();

  const displayHost = editedHost ?? hostInput;
  const displayPort = editedPort ?? portInput;
  const displayAuthToken = editedAuthToken ?? authTokenInput;
  const displayManagementKey = editedManagementKey ?? managementKeyInput;
  const displayLocalPort = editedLocalPort ?? localPortInput;

  // Save functions for blur events
  const saveHost = () => {
    const value = editedHost ?? displayHost;
    if (value !== config.remote.host) {
      saveConfig({ remote: { ...remoteConfig, host: value } });
    }
    setEditedHost(null);
  };

  const savePort = () => {
    const portStr = editedPort ?? displayPort;
    const port = portStr === '' ? undefined : parseInt(portStr, 10);
    const effectivePort = port && !isNaN(port) && port > 0 ? port : undefined;

    if (effectivePort !== config.remote.port) {
      saveConfig({ remote: { ...remoteConfig, port: effectivePort } });
    }
    setEditedPort(null);
  };

  const saveAuthToken = () => {
    const value = editedAuthToken ?? displayAuthToken;
    if (value !== config.remote.auth_token) {
      saveConfig({ remote: { ...remoteConfig, auth_token: value } });
    }
    setEditedAuthToken(null);
  };

  const saveManagementKey = () => {
    const value = editedManagementKey ?? displayManagementKey;
    if (value !== config.remote.management_key) {
      saveConfig({ remote: { ...remoteConfig, management_key: value || undefined } });
    }
    setEditedManagementKey(null);
  };

  const saveLocalPort = () => {
    const port = parseInt(editedLocalPort ?? displayLocalPort, 10);
    if (!isNaN(port) && port !== config.local.port) {
      saveConfig({ local: { ...config.local, port } });
    }
    setEditedLocalPort(null);
  };

  const handleTestConnection = () => {
    testConnection({
      host: displayHost,
      port: displayPort,
      protocol: config.remote.protocol || 'http',
      authToken: displayAuthToken,
    });
  };

  return (
    <>
      {/* Toast-style alerts */}
      <div
        className={`absolute left-5 right-5 top-20 z-10 transition-all duration-200 ease-out ${
          error || success
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 -translate-y-2 pointer-events-none'
        }`}
      >
        {error && (
          <Alert variant="destructive" className="py-2 shadow-lg">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-green-200 bg-green-50 text-green-700 shadow-lg dark:border-green-900/50 dark:bg-green-900/90 dark:text-green-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">Saved</span>
          </div>
        )}
      </div>

      {/* Scrollable Content */}
      <ScrollArea className="flex-1">
        <div className="p-5 space-y-6">
          <p className="text-sm text-muted-foreground">
            Configure local or remote CLIProxy Plus connection for proxy-based profiles
          </p>

          {/* Mode Toggle - Card based selection */}
          <div className="space-y-3">
            <h3 className="text-base font-medium">Connection Mode</h3>
            <div className="grid grid-cols-2 gap-3">
              {/* Local Mode Card */}
              <button
                onClick={() => saveConfig({ remote: { ...remoteConfig, enabled: false } })}
                disabled={saving}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  !isRemoteMode
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/50'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Laptop
                    className={`w-5 h-5 ${!isRemoteMode ? 'text-primary' : 'text-muted-foreground'}`}
                  />
                  <span className="font-medium">Local</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Run CLIProxy Plus binary on this machine
                </p>
              </button>

              {/* Remote Mode Card */}
              <button
                onClick={() => saveConfig({ remote: { ...remoteConfig, enabled: true } })}
                disabled={saving}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  isRemoteMode
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/50'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Cloud
                    className={`w-5 h-5 ${isRemoteMode ? 'text-primary' : 'text-muted-foreground'}`}
                  />
                  <span className="font-medium">Remote</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Connect to a remote CLIProxy Plus server
                </p>
              </button>
            </div>
          </div>

          {/* Remote Settings - Show when remote mode is enabled */}
          {isRemoteMode && (
            <RemoteProxyCard
              config={config}
              saving={saving}
              testing={testing}
              testResult={testResult}
              displayHost={displayHost}
              displayPort={displayPort}
              displayAuthToken={displayAuthToken}
              displayManagementKey={displayManagementKey}
              setEditedHost={setEditedHost}
              setEditedPort={setEditedPort}
              setEditedAuthToken={setEditedAuthToken}
              setEditedManagementKey={setEditedManagementKey}
              onSaveHost={saveHost}
              onSavePort={savePort}
              onSaveAuthToken={saveAuthToken}
              onSaveManagementKey={saveManagementKey}
              onSaveConfig={saveConfig}
              onTestConnection={handleTestConnection}
            />
          )}

          {/* Fallback Settings */}
          <div className="space-y-3">
            <h3 className="text-base font-medium">Fallback Settings</h3>
            <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
              {/* Enable Fallback */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Enable fallback to local</p>
                  <p className="text-xs text-muted-foreground">
                    Use local proxy if remote is unreachable
                  </p>
                </div>
                <Switch
                  checked={fallbackConfig.enabled ?? true}
                  onCheckedChange={(checked) =>
                    saveConfig({ fallback: { ...fallbackConfig, enabled: checked } })
                  }
                  disabled={saving || !isRemoteMode}
                />
              </div>

              {/* Auto-start on fallback */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Auto-start local proxy</p>
                  <p className="text-xs text-muted-foreground">
                    Automatically start local proxy on fallback
                  </p>
                </div>
                <Switch
                  checked={fallbackConfig.auto_start ?? false}
                  onCheckedChange={(checked) =>
                    saveConfig({ fallback: { ...fallbackConfig, auto_start: checked } })
                  }
                  disabled={saving || !isRemoteMode || !fallbackConfig.enabled}
                />
              </div>
            </div>
          </div>

          {/* Local Proxy Settings - Only show in Local mode */}
          {!isRemoteMode && (
            <LocalProxyCard
              config={config}
              saving={saving}
              displayLocalPort={displayLocalPort}
              setEditedLocalPort={setEditedLocalPort}
              onSaveLocalPort={saveLocalPort}
              onSaveConfig={saveConfig}
            />
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-4 border-t bg-background">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            fetchConfig();
            fetchRawConfig();
          }}
          disabled={loading || saving}
          className="w-full"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>
    </>
  );
}
