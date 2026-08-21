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
  FileDown,
  Check,
  AlertCircle,
  ChevronDown,
  ChevronUp,
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
import { useQuery, useIsMutating } from '@tanstack/react-query';
import { api, type CliproxyServerConfig } from '@/lib/api-client';
import { Trans, useTranslation } from 'react-i18next';
import {
  useProxyStatus,
  useStartProxy,
  useStopProxy,
  useCliproxyUpdateCheck,
  useCliproxyVersions,
  useInstallVersion,
  useRestartProxy,
  useCliproxyRoutingStrategy,
  useCliproxySessionAffinity,
  useUpdateCliproxyRoutingStrategy,
  useUpdateCliproxySessionAffinity,
} from '@/hooks/use-cliproxy';
import { useSyncStatus, useExecuteSync } from '@/hooks/use-cliproxy-sync';
import { cn } from '@/lib/utils';
import {
  isCliproxyVersionExperimental,
  isCliproxyVersionInRange,
} from '@/lib/cliproxy-version-risk';
import { RoutingGuidanceCard } from '@/components/cliproxy/routing-guidance-card';

type PendingInstallRisk = 'faulty' | 'experimental';

const WIDGET_COLLAPSED_STORAGE_KEY = 'cliproxy-status-widget-collapsed';

function readCollapsedPreference(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(WIDGET_COLLAPSED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function persistCollapsedPreference(collapsed: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(WIDGET_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // Ignore storage errors (private mode, quota, etc.)
  }
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

function formatTimeAgo(
  timestamp: number | undefined,
  t: (key: string, opts?: { count?: number }) => string
): string {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (minutes < 1) return t('proxyStatusWidget.justNow');
  if (minutes < 60) return t('proxyStatusWidget.minutesAgo', { count: minutes });
  return t('proxyStatusWidget.hoursAgo', { count: hours });
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
          aria-label={tooltip}
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
  const { t } = useTranslation();
  const { data: status, isLoading } = useProxyStatus();
  const { data: updateCheck } = useCliproxyUpdateCheck();
  const { data: versionsData, isLoading: versionsLoading } = useCliproxyVersions();
  const {
    data: routingState,
    isLoading: routingLoading,
    error: routingError,
  } = useCliproxyRoutingStrategy();
  const updateRouting = useUpdateCliproxyRoutingStrategy();
  const {
    data: sessionAffinityState,
    isLoading: sessionAffinityLoading,
    error: sessionAffinityError,
  } = useCliproxySessionAffinity();
  const updateSessionAffinity = useUpdateCliproxySessionAffinity();
  const isSavingRoutingConfig = updateRouting.isPending || updateSessionAffinity.isPending;
  const routingConfigError = routingError instanceof Error ? routingError : null;
  const startProxy = useStartProxy();
  const stopProxy = useStopProxy();
  const restartProxy = useRestartProxy();
  const installVersion = useInstallVersion();

  // Sync functionality
  const { data: syncStatus } = useSyncStatus();
  const { mutate: executeSync, isPending: isSyncing } = useExecuteSync();

  // Version picker state (expanded section)
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<string>('');

  // Whole-widget collapse so the sidebar provider list keeps the vertical space
  const [isCollapsed, setIsCollapsed] = useState<boolean>(readCollapsedPreference);

  const handleToggleCollapsed = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    // Collapsing also closes version management so it cannot stay open but hidden
    if (next) setIsExpanded(false);
    persistCollapsedPreference(next);
  };

  // Opening version settings from a collapsed widget must reveal the section
  const handleToggleVersionSettings = () => {
    const next = !isExpanded;
    setIsExpanded(next);
    if (next && isCollapsed) {
      setIsCollapsed(false);
      persistCollapsedPreference(false);
    }
  };

  const collapseTooltip = isCollapsed
    ? t('proxyStatusWidget.tooltipExpandWidget')
    : t('proxyStatusWidget.tooltipCollapseWidget');

  // Confirmation dialog state for risky versions
  const [showUnstableConfirm, setShowUnstableConfirm] = useState(false);
  const [pendingInstallVersion, setPendingInstallVersion] = useState<string | null>(null);
  const [pendingInstallRisk, setPendingInstallRisk] = useState<PendingInstallRisk | null>(null);

  // Fetch cliproxy_server config for remote mode detection
  const { data: cliproxyConfig } = useQuery<CliproxyServerConfig>({
    queryKey: ['cliproxy-server-config'],
    queryFn: () => api.cliproxyServer.get(),
    staleTime: 30000, // 30 seconds
  });

  // Detect if backend switch is in progress (prevents race condition)
  const isBackendSwitching = useIsMutating({ mutationKey: ['update-backend'] }) > 0;

  // Determine if remote mode is enabled
  const remoteConfig = cliproxyConfig?.remote;
  const isRemoteMode = remoteConfig?.enabled && remoteConfig?.host;
  const effectiveSessionAffinityState =
    sessionAffinityState ??
    (sessionAffinityError instanceof Error
      ? {
          source: 'unsupported' as const,
          target: (routingState?.target ?? (isRemoteMode ? 'remote' : 'local')) as
            | 'local'
            | 'remote',
          reachable: false,
          manageable: false,
          message: sessionAffinityError.message,
        }
      : undefined);

  const isRunning = status?.running ?? false;
  const isActioning =
    startProxy.isPending ||
    stopProxy.isPending ||
    restartProxy.isPending ||
    installVersion.isPending ||
    isBackendSwitching ||
    isSyncing;
  const hasUpdate = updateCheck?.hasUpdate ?? false;
  const isUnstable = updateCheck?.isStable === false;
  const currentVersion = updateCheck?.currentVersion;

  // Sync status
  const isSyncConfigured = syncStatus?.configured ?? false;
  const syncStatusText = isSyncConfigured
    ? t('proxyStatusWidget.syncReady')
    : t('proxyStatusWidget.noConfig');

  // Target version for update/downgrade badge
  const targetVersion = isUnstable
    ? updateCheck?.maxStableVersion || versionsData?.latestStable
    : updateCheck?.latestVersion;
  const maxStableVersion =
    versionsData?.maxStableVersion || updateCheck?.maxStableVersion || '6.6.80';

  const faultyRange = versionsData?.faultyRange;
  const faultyRangeLabel =
    faultyRange &&
    `${faultyRange.min.replace(/-\d+$/, '')}-${faultyRange.max.replace(/-\d+$/, '')}`;

  const queueInstallConfirmation = (version: string, risk: PendingInstallRisk) => {
    setPendingInstallVersion(version);
    setPendingInstallRisk(risk);
    setShowUnstableConfirm(true);
  };

  // Handle version install (shows confirmation for risky versions)
  const handleInstallVersion = async (version: string) => {
    if (!version) return;
    const isVersionExperimental = isCliproxyVersionExperimental(version, maxStableVersion);
    const isVersionFaulty =
      faultyRange !== undefined &&
      isCliproxyVersionInRange(version, faultyRange.min, faultyRange.max);

    if (isVersionFaulty) {
      queueInstallConfirmation(version, 'faulty');
      return;
    }

    if (isVersionExperimental) {
      queueInstallConfirmation(version, 'experimental');
      return;
    }

    try {
      const result = await installVersion.mutateAsync({ version });
      if (result.requiresConfirmation) {
        queueInstallConfirmation(version, result.isFaulty ? 'faulty' : 'experimental');
      }
    } catch {
      // Hook-level onError already reports install failures.
    }
  };

  // Confirm risky version install
  const handleConfirmUnstableInstall = () => {
    if (pendingInstallVersion) {
      installVersion.mutate({ version: pendingInstallVersion, force: true });
    }
    setShowUnstableConfirm(false);
    setPendingInstallVersion(null);
    setPendingInstallRisk(null);
  };

  const handleCancelUnstableInstall = () => {
    setShowUnstableConfirm(false);
    setPendingInstallVersion(null);
    setPendingInstallRisk(null);
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
            <span className="text-sm font-medium">{t('proxyStatusWidget.remoteProxy')}</span>
            <Badge
              variant="secondary"
              className="text-[10px] h-4 px-1.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
            >
              {t('proxyStatusWidget.active')}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Activity className="w-3 h-3 text-blue-600" />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={handleToggleCollapsed}
              title={collapseTooltip}
              aria-label={collapseTooltip}
            >
              {isCollapsed ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5" />
              )}
            </Button>
          </div>
        </div>

        {!isCollapsed && (
          <>
            <div className="mt-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1 mb-1">
                <span className="font-mono">{remoteDisplayHost}</span>
              </div>
              <p className="text-[10px] text-muted-foreground/70 leading-tight">
                {t('proxyStatusWidget.trafficAutoRouted')}
              </p>
            </div>

            <RoutingGuidanceCard
              key={`remote:${routingState?.strategy ?? 'round-robin'}:${effectiveSessionAffinityState?.enabled ?? 'na'}:${effectiveSessionAffinityState?.ttl ?? 'na'}:${effectiveSessionAffinityState?.manageable ?? 'na'}`}
              compact
              className="mt-3"
              state={routingState}
              sessionAffinityState={effectiveSessionAffinityState}
              isLoading={routingLoading || sessionAffinityLoading}
              isSaving={isSavingRoutingConfig}
              error={routingConfigError}
              onApply={(strategy) => updateRouting.mutate(strategy)}
              onApplyAffinity={(data) => updateSessionAffinity.mutate(data)}
            />
          </>
        )}
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
            <span className="text-sm font-medium">{updateCheck?.backendLabel ?? 'CLIProxy'}</span>
          </div>

          {/* Right side: icon buttons */}
          <div className="flex items-center gap-1">
            {isLoading ? (
              <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />
            ) : isRunning ? (
              <>
                <IconButton
                  icon={isSyncing ? RefreshCw : FileDown}
                  tooltip={t('proxyStatusWidget.tooltipSync')}
                  onClick={() => executeSync()}
                  disabled={!isSyncConfigured || isActioning}
                  isPending={isSyncing}
                />
                <IconButton
                  icon={RotateCw}
                  tooltip={t('proxyStatusWidget.tooltipRestart')}
                  onClick={() => restartProxy.mutate()}
                  disabled={isActioning}
                  isPending={restartProxy.isPending}
                />
                <IconButton
                  icon={Square}
                  tooltip={t('proxyStatusWidget.tooltipStop')}
                  onClick={() => stopProxy.mutate()}
                  disabled={isActioning}
                  isPending={stopProxy.isPending}
                  variant="destructive-ghost"
                />
              </>
            ) : null}
            {/* Settings button always visible */}
            <IconButton
              icon={isExpanded ? X : Settings}
              tooltip={
                isExpanded
                  ? t('proxyStatusWidget.tooltipClose')
                  : t('proxyStatusWidget.tooltipVersionSettings')
              }
              onClick={handleToggleVersionSettings}
              className={isExpanded ? 'bg-muted' : undefined}
            />
            <IconButton
              icon={isCollapsed ? ChevronDown : ChevronUp}
              tooltip={collapseTooltip}
              onClick={handleToggleCollapsed}
            />
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
                onClick={() => void handleInstallVersion(targetVersion)}
                title={
                  isUnstable
                    ? t('proxyStatusWidget.clickToDowngrade')
                    : t('proxyStatusWidget.clickToUpdate')
                }
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
        {!isCollapsed && isRunning && status && (
          <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              {t('proxyStatusWidget.port', { port: status.port })}
            </span>
            {status.sessionCount !== undefined && status.sessionCount > 0 && (
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {t('proxyStatusWidget.sessionCount', { count: status.sessionCount })}
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

        {!isCollapsed && (
          <>
            {/* Sync status row */}
            <div className="mt-2 flex items-center gap-1.5 text-xs">
              {isSyncConfigured ? (
                <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
              ) : (
                <AlertCircle className="w-3 h-3 text-muted-foreground" />
              )}
              <span
                className={cn(
                  'text-xs',
                  isSyncConfigured ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
                )}
              >
                {syncStatusText}
              </span>
            </div>

            <RoutingGuidanceCard
              key={`local:${routingState?.strategy ?? 'round-robin'}:${effectiveSessionAffinityState?.enabled ?? 'na'}:${effectiveSessionAffinityState?.ttl ?? 'na'}:${effectiveSessionAffinityState?.manageable ?? 'na'}`}
              compact
              className="mt-3"
              state={routingState}
              sessionAffinityState={effectiveSessionAffinityState}
              isLoading={routingLoading || sessionAffinityLoading}
              isSaving={isSavingRoutingConfig}
              error={routingConfigError}
              onApply={(strategy) => updateRouting.mutate(strategy)}
              onApplyAffinity={(data) => updateSessionAffinity.mutate(data)}
            />
          </>
        )}

        {/* Expanded section: Version Management (available even when not running) */}
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleContent className="mt-3 pt-3 border-t border-muted">
            {/* Section header */}
            <h4 className="text-xs font-medium text-muted-foreground mb-3">
              {t('proxyStatusWidget.versionManagement')}
            </h4>

            {/* Version picker row */}
            <div className="flex items-center gap-2">
              {/* Dropdown - full width, no truncation */}
              <Select
                value={selectedVersion}
                onValueChange={setSelectedVersion}
                disabled={versionsLoading}
              >
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue placeholder={t('proxyStatusWidget.selectVersionPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {versionsData?.versions.slice(0, 20).map((v) => {
                    const vIsExperimental =
                      versionsData?.maxStableVersion &&
                      isCliproxyVersionExperimental(v, versionsData.maxStableVersion);
                    const vIsFaulty =
                      versionsData?.faultyRange &&
                      isCliproxyVersionInRange(
                        v,
                        versionsData.faultyRange.min,
                        versionsData.faultyRange.max
                      );
                    return (
                      <SelectItem key={v} value={v} className="text-xs">
                        <span className="flex items-center gap-2">
                          v{v}
                          {v === versionsData.latestStable && (
                            <span className="text-green-600 dark:text-green-400">
                              {t('proxyStatusWidget.stable')}
                            </span>
                          )}
                          {(vIsFaulty || vIsExperimental) && (
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
                onClick={() => void handleInstallVersion(selectedVersion)}
                disabled={installVersion.isPending || !selectedVersion}
              >
                {installVersion.isPending ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                {t('proxyStatusWidget.install')}
              </Button>
            </div>

            {/* Stability warning for selected version */}
            {selectedVersion &&
              versionsData?.maxStableVersion &&
              isCliproxyVersionExperimental(selectedVersion, versionsData.maxStableVersion) && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>
                    {t('proxyStatusWidget.versionsAboveUnstable', {
                      version: versionsData.maxStableVersion,
                    })}
                  </span>
                </div>
              )}

            {selectedVersion &&
              versionsData?.faultyRange &&
              isCliproxyVersionInRange(
                selectedVersion,
                versionsData.faultyRange.min,
                versionsData.faultyRange.max
              ) && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>
                    {t('proxyStatusWidget.versionsKnownIssues', {
                      version: selectedVersion,
                    })}
                  </span>
                </div>
              )}

            {/* Sync time */}
            {updateCheck?.checkedAt && (
              <div className="mt-2 text-[10px] text-muted-foreground/60">
                {t('proxyStatusWidget.lastChecked', {
                  time: formatTimeAgo(updateCheck.checkedAt, t),
                })}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Not running state */}
        {!isRunning && (
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {t('proxyStatusWidget.notRunning')}
            </span>
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
              {t('proxyStatusWidget.start')}
            </Button>
          </div>
        )}

        {/* Unstable Version Confirmation Dialog */}
        <AlertDialog open={showUnstableConfirm} onOpenChange={setShowUnstableConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                {pendingInstallRisk === 'faulty'
                  ? t('proxyStatusWidget.installFaultyTitle')
                  : t('proxyStatusWidget.installUnstableTitle')}
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                {pendingInstallRisk === 'faulty' ? (
                  <p>
                    <Trans
                      i18nKey="proxyStatusWidget.installFaultyDesc"
                      values={{
                        version: pendingInstallVersion ?? '',
                        range: faultyRangeLabel || '',
                      }}
                      components={{ strong: <strong /> }}
                    />
                  </p>
                ) : (
                  <p>
                    <Trans
                      i18nKey="proxyStatusWidget.installUnstableDesc"
                      values={{
                        version: pendingInstallVersion ?? '',
                        maxStable: maxStableVersion,
                      }}
                      components={{ strong: <strong /> }}
                    />
                  </p>
                )}
                <p className="text-amber-600 dark:text-amber-400">
                  {pendingInstallRisk === 'faulty'
                    ? t('proxyStatusWidget.installFaultyWarning')
                    : t('proxyStatusWidget.installUnstableWarning')}
                </p>
                <p>{t('proxyStatusWidget.installUnstableConfirm')}</p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleCancelUnstableInstall}>
                {t('proxyStatusWidget.cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmUnstableInstall}
                className="bg-amber-500 hover:bg-amber-600 text-white"
              >
                {t('proxyStatusWidget.installAnyway')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
