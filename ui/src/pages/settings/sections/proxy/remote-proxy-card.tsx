/**
 * Remote Proxy Card
 * Configuration card for remote CLIProxyAPI settings
 */

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Cloud, RefreshCw, Wifi, WifiOff, CheckCircle2 } from 'lucide-react';
import type { CliproxyServerConfig, RemoteProxyStatus } from '../../types';

interface RemoteProxyCardProps {
  config: CliproxyServerConfig;
  saving: boolean;
  testing: boolean;
  testResult: RemoteProxyStatus | null;
  displayHost: string;
  displayPort: string;
  displayAuthToken: string;
  displayManagementKey: string;
  setEditedHost: (value: string | null) => void;
  setEditedPort: (value: string | null) => void;
  setEditedAuthToken: (value: string | null) => void;
  setEditedManagementKey: (value: string | null) => void;
  onSaveHost: () => void;
  onSavePort: () => void;
  onSaveAuthToken: () => void;
  onSaveManagementKey: () => void;
  onSaveConfig: (updates: Partial<CliproxyServerConfig>) => void;
  onTestConnection: () => void;
}

export function RemoteProxyCard({
  config,
  saving,
  testing,
  testResult,
  displayHost,
  displayPort,
  displayAuthToken,
  displayManagementKey,
  setEditedHost,
  setEditedPort,
  setEditedAuthToken,
  setEditedManagementKey,
  onSaveHost,
  onSavePort,
  onSaveAuthToken,
  onSaveManagementKey,
  onSaveConfig,
  onTestConnection,
}: RemoteProxyCardProps) {
  const remoteConfig = config.remote;

  // HTTP defaults to 8317 (CLIProxyAPI default), HTTPS to 443 (standard SSL)
  const getDefaultPort = (protocol: 'http' | 'https') => (protocol === 'https' ? 443 : 8317);

  return (
    <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
      <h4 className="text-sm font-medium flex items-center gap-2">
        <Cloud className="w-4 h-4" />
        Remote Server Configuration
      </h4>

      {/* Host */}
      <div className="space-y-1">
        <label className="text-sm text-muted-foreground">Host</label>
        <Input
          value={displayHost}
          onChange={(e) => setEditedHost(e.target.value)}
          onBlur={onSaveHost}
          placeholder="192.168.1.100 or proxy.example.com"
          className="font-mono"
          disabled={saving}
        />
      </div>

      {/* Port and Protocol */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">
            Port{' '}
            <span className="text-xs opacity-70">
              (default: {getDefaultPort(config.remote.protocol || 'http')})
            </span>
          </label>
          <Input
            type="text"
            inputMode="numeric"
            value={displayPort}
            onChange={(e) => setEditedPort(e.target.value.replace(/\D/g, ''))}
            onBlur={onSavePort}
            placeholder={`Leave empty for ${getDefaultPort(config.remote.protocol || 'http')}`}
            className="font-mono"
            disabled={saving}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">Protocol</label>
          <Select
            value={config.remote.protocol || 'http'}
            onValueChange={(value: 'http' | 'https') =>
              onSaveConfig({ remote: { ...remoteConfig, protocol: value } })
            }
            disabled={saving}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="http">HTTP</SelectItem>
              <SelectItem value="https">HTTPS</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Auth Token (API Key) */}
      <div className="space-y-1">
        <label className="text-sm text-muted-foreground">API Key (optional)</label>
        <Input
          type="password"
          value={displayAuthToken}
          onChange={(e) => setEditedAuthToken(e.target.value)}
          onBlur={onSaveAuthToken}
          placeholder="For /v1/* API endpoints"
          className="font-mono"
          disabled={saving}
        />
        <p className="text-xs text-muted-foreground">
          Used for API requests to /v1/chat/completions
        </p>
      </div>

      {/* Management Key */}
      <div className="space-y-1">
        <label className="text-sm text-muted-foreground">Management Key (optional)</label>
        <Input
          type="password"
          value={displayManagementKey}
          onChange={(e) => setEditedManagementKey(e.target.value)}
          onBlur={onSaveManagementKey}
          placeholder="For /v0/management/* endpoints"
          className="font-mono"
          disabled={saving}
        />
        <p className="text-xs text-muted-foreground">
          Used for dashboard management APIs. Falls back to API Key if not set.
        </p>
      </div>

      {/* Test Connection */}
      <div className="space-y-3 pt-2">
        <Button
          onClick={onTestConnection}
          disabled={testing || !displayHost}
          variant="outline"
          className="w-full"
        >
          {testing ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Testing...
            </>
          ) : (
            <>
              <Wifi className="w-4 h-4 mr-2" />
              Test Connection
            </>
          )}
        </Button>

        {/* Test Result */}
        {testResult && (
          <div
            className={`p-3 rounded-md ${
              testResult.reachable
                ? 'bg-green-50 border border-green-200 dark:bg-green-900/20 dark:border-green-900/50'
                : 'bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-900/50'
            }`}
          >
            <div className="flex items-center gap-2">
              {testResult.reachable ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                  <span className="text-sm font-medium text-green-700 dark:text-green-300">
                    Connected ({testResult.latencyMs}ms)
                  </span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-red-600 dark:text-red-400" />
                  <span className="text-sm font-medium text-red-700 dark:text-red-300">
                    {testResult.error || 'Connection failed'}
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
