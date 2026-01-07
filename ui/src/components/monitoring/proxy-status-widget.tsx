/**
 * Proxy Status Widget
 *
 * Displays CLIProxy process status with start/stop/restart controls.
 * Shows: running state, port, session count, uptime, update availability.
 * In remote mode: shows remote server info instead of local controls.
 *
 * Design: Two-state widget (collapsed/expanded) with icon-only control buttons.
 */

import { useState } from 'react';
import {
  Activity,
  Power,
  RefreshCw,
  Clock,
  Users,
  Square,
  RotateCw,
  ArrowUp,
  ArrowDown,
  Globe,
  AlertTriangle,
  Settings,
  X,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useQuery } from '@tanstack/react-query';
import { api, type CliproxyServerConfig } from '@/lib/api-client';
import {
  useProxyStatus,
  useStartProxy,
  useStopProxy,
  useCliproxyUpdateCheck,
  useCliproxyVersions,
  useInstallVersion,
  useRestartProxy,
} from '@/hooks/use-cliproxy';
import { cn } from '@/lib/utils';

/** Client-side semver comparison (true if a > b) */
function isNewerVersionClient(a: string, b: string): boolean {
  const aParts = a.replace(/-\d+$/, '').split('.').map(Number);
  const bParts = b.replace(/-\d+$/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((aParts[i] || 0) > (bParts[i] || 0)) return true;
    if ((aParts[i] || 0) < (bParts[i] || 0)) return false;
  }
  return false;
}

function formatUptime(startedAt?: string): string {
  if (!startedAt) return '';
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const diff = now - start;

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatTimeAgo(timestamp?: number): string {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  return `${hours}h ago`;
}

/** Icon button with tooltip wrapper */
function IconButton({
  icon: Icon,
  tooltip,
  onClick,
  disabled,
  isPending,
  className,
  variant = 'ghost',
}: {
  icon: React.ElementType;
  tooltip: string;
  onClick: () => void;
  disabled?: boolean;
  isPending?: boolean;
  className?: string;
  variant?: 'ghost' | 'outline' | 'destructive-ghost';
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={variant === 'destructive-ghost' ? 'ghost' : variant}
          size="sm"
          className={cn(
            'h-7 w-7 p-0',
            variant === 'destructive-ghost' &&
              'hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30',
            className
          )}
          onClick={onClick}
          disabled={disabled}
        >
          {isPending ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Icon className="w-3.5 h-3.5" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

export function ProxyStatusWidget() {
  const { data: status, isLoading } = useProxyStatus();
  const { data: updateCheck } = useCliproxyUpdateCheck();
  const { data: versionsData, isLoading: versionsLoading } = useCliproxyVersions();
  const startProxy = useStartProxy();
  const stopProxy = useStopProxy();
  const restartProxy = useRestartProxy();
  const installVersion = useInstallVersion();

  // Version picker state (expanded section)
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<string>('');

  // Confirmation dialog state for unstable versions
  const [showUnstableConfirm, setShowUnstableConfirm] = useState(false);
  const [pendingInstallVersion, setPendingInstallVersion] = useState<string | null>(null);

  // Fetch cliproxy_server config for remote mode detection
  const { data: cliproxyConfig } = useQuery<CliproxyServerConfig>({
    queryKey: ['cliproxy-server-config'],
    queryFn: () => api.cliproxyServer.get(),
    staleTime: 30000, // 30 seconds
  });

  // Determine if remote mode is enabled
  const remoteConfig = cliproxyConfig?.remote;
  const isRemoteMode = remoteConfig?.enabled && remoteConfig?.host;

  const isRunning = status?.running ?? false;
  const isActioning =
    startProxy.isPending ||
    stopProxy.isPending ||
    restartProxy.isPending ||
    installVersion.isPending;
  const hasUpdate = updateCheck?.hasUpdate ?? false;
  const isUnstable = updateCheck?.isStable === false;
  const currentVersion = updateCheck?.currentVersion;

  // Target version for update/downgrade badge
  const targetVersion = isUnstable
    ? updateCheck?.maxStableVersion || versionsData?.latestStable
    : updateCheck?.latestVersion;

  // Handle version install (shows confirmation for unstable)
  const handleInstallVersion = (version: string) => {
    if (!version) return;
    const maxStable = versionsData?.maxStableVersion || '6.6.80';
    const isVersionUnstable = isNewerVersionClient(version, maxStable);

    if (isVersionUnstable) {
      // Show confirmation dialog for unstable versions
      setPendingInstallVersion(version);
      setShowUnstableConfirm(true);
      return;
    }

    // Install directly if stable
    installVersion.mutate({ version });
  };

  // Confirm unstable version install
  const handleConfirmUnstableInstall = () => {
    if (pendingInstallVersion) {
      installVersion.mutate({ version: pendingInstallVersion, force: true });
    }
    setShowUnstableConfirm(false);
    setPendingInstallVersion(null);
  };

  const handleCancelUnstableInstall = () => {
    setShowUnstableConfirm(false);
    setPendingInstallVersion(null);
  };

  // Build remote display info
  const remoteDisplayHost = isRemoteMode
    ? (() => {
        const protocol = remoteConfig.protocol || 'http';
        const port = remoteConfig.port || (protocol === 'https' ? 443 : 80);
        const isDefaultPort =
          (protocol === 'https' && port === 443) || (protocol === 'http' && port === 80);
        return isDefaultPort ? remoteConfig.host : `${remoteConfig.host}:${port}`;
      })()
    : null;

  // Remote mode: show remote server info
  if (isRemoteMode) {
    return (
      <div
        className={cn(
          'rounded-lg border p-3 transition-colors',
          'border-blue-500/30 bg-blue-500/5'
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium">Remote Proxy</span>
            <Badge
              variant="secondary"
              className="text-[10px] h-4 px-1.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
            >
              Active
            </Badge>
          </div>
          <Activity className="w-3 h-3 text-blue-600" />
        </div>

        <div className="mt-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1 mb-1">
            <span className="font-mono">{remoteDisplayHost}</span>
          </div>
          <p className="text-[10px] text-muted-foreground/70 leading-tight">
            Traffic auto-routed to remote server
          </p>
        </div>
      </div>
    );
  }

  // Local mode: Two-state widget (collapsed/expanded)
  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          'rounded-lg border p-3 transition-colors',
          isRunning ? 'border-green-500/30 bg-green-500/5' : 'border-muted bg-muted/30'
        )}
      >
        {/* Header row: Status dot, title, icon buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Status indicator */}
            <div
              className={cn(
                'w-2 h-2 rounded-full',
                isRunning ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/30'
              )}
            />
            <span className="text-sm font-medium">CLIProxy Plus</span>
          </div>

          {/* Right side: icon buttons when running */}
          <div className="flex items-center gap-1">
            {isLoading ? (
              <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />
            ) : isRunning ? (
              <>
                <IconButton
                  icon={RotateCw}
                  tooltip="Restart"
                  onClick={() => restartProxy.mutate()}
                  disabled={isActioning}
                  isPending={restartProxy.isPending}
                />
                <IconButton
                  icon={Square}
                  tooltip="Stop"
                  onClick={() => stopProxy.mutate()}
                  disabled={isActioning}
                  isPending={stopProxy.isPending}
                  variant="destructive-ghost"
                />
                <IconButton
                  icon={isExpanded ? X : Settings}
                  tooltip={isExpanded ? 'Close' : 'Version settings'}
                  onClick={() => setIsExpanded(!isExpanded)}
                  className={isExpanded ? 'bg-muted' : undefined}
                />
              </>
            ) : (
              <Power className="w-3 h-3 text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Version row: version + update badge */}
        {currentVersion && (
          <div className="mt-1.5 flex items-center gap-2">
            <span
              className={cn(
                'text-xs font-mono text-muted-foreground',
                isUnstable && 'text-amber-600 dark:text-amber-400'
              )}
            >
              v{currentVersion}
            </span>
            {(hasUpdate || isUnstable) && targetVersion && (
              <Badge
                variant="secondary"
                className={cn(
                  'text-[10px] h-4 px-1.5 gap-0.5 cursor-pointer transition-colors',
                  isUnstable
                    ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50'
                    : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50'
                )}
                onClick={() => handleInstallVersion(targetVersion)}
                title={`Click to ${isUnstable ? 'downgrade' : 'update'}`}
              >
                {isUnstable ? (
                  <ArrowDown className="w-2.5 h-2.5" />
                ) : (
                  <ArrowUp className="w-2.5 h-2.5" />
                )}
                {targetVersion}
              </Badge>
            )}
          </div>
        )}

        {/* Stats row when running */}
        {isRunning && status && (
          <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">Port {status.port}</span>
            {status.sessionCount !== undefined && status.sessionCount > 0 && (
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {status.sessionCount} session{status.sessionCount !== 1 ? 's' : ''}
              </span>
            )}
            {status.startedAt && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatUptime(status.startedAt)}
              </span>
            )}
          </div>
        )}

        {/* Expanded section: Version Management */}
        {isRunning && (
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <CollapsibleContent className="mt-3 pt-3 border-t border-muted">
              {/* Section header */}
              <h4 className="text-xs font-medium text-muted-foreground mb-3">Version Management</h4>

              {/* Version picker row */}
              <div className="flex items-center gap-2">
                {/* Dropdown - full width, no truncation */}
                <Select
                  value={selectedVersion}
                  onValueChange={setSelectedVersion}
                  disabled={versionsLoading}
                >
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue placeholder="Select version to install..." />
                  </SelectTrigger>
                  <SelectContent>
                    {versionsData?.versions.slice(0, 20).map((v) => {
                      const vIsUnstable =
                        versionsData?.maxStableVersion &&
                        isNewerVersionClient(v, versionsData.maxStableVersion);
                      return (
                        <SelectItem key={v} value={v} className="text-xs">
                          <span className="flex items-center gap-2">
                            v{v}
                            {v === versionsData.latestStable && (
                              <span className="text-green-600 dark:text-green-400">(stable)</span>
                            )}
                            {vIsUnstable && (
                              <span className="text-amber-600 dark:text-amber-400">⚠</span>
                            )}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>

                {/* Install button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5 px-3"
                  onClick={() => handleInstallVersion(selectedVersion)}
                  disabled={installVersion.isPending || !selectedVersion}
                >
                  {installVersion.isPending ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  Install
                </Button>
              </div>

              {/* Stability warning for selected version */}
              {selectedVersion &&
                versionsData?.maxStableVersion &&
                isNewerVersionClient(selectedVersion, versionsData.maxStableVersion) && (
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>Versions above {versionsData.maxStableVersion} have known issues</span>
                  </div>
                )}

              {/* Sync time */}
              {updateCheck?.checkedAt && (
                <div className="mt-2 text-[10px] text-muted-foreground/60">
                  Last checked {formatTimeAgo(updateCheck.checkedAt)}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Not running state */}
        {!isRunning && (
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Not running</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => startProxy.mutate()}
              disabled={startProxy.isPending}
            >
              {startProxy.isPending ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <Power className="w-3 h-3" />
              )}
              Start
            </Button>
          </div>
        )}

        {/* Unstable Version Confirmation Dialog */}
        <AlertDialog open={showUnstableConfirm} onOpenChange={setShowUnstableConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Install Unstable Version?
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p>
                  You are about to install <strong>v{pendingInstallVersion}</strong>, which is above
                  the maximum stable version{' '}
                  <strong>v{versionsData?.maxStableVersion || '6.6.80'}</strong>.
                </p>
                <p className="text-amber-600 dark:text-amber-400">
                  This version has known stability issues and may cause unexpected behavior.
                </p>
                <p>Are you sure you want to proceed?</p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleCancelUnstableInstall}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmUnstableInstall}
                className="bg-amber-500 hover:bg-amber-600 text-white"
              >
                Install Anyway
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
