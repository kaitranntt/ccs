/**
 * Cursor Status Sidebar
 * Left rail: identity strip, warning banner, supported path, status items,
 * live probe panel, action buttons, port footer.
 */

import { type ElementType } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  Key,
  Loader2,
  Play,
  Power,
  PowerOff,
  Server,
  ShieldCheck,
  XCircle,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DEFAULT_CURSOR_PORT } from '@/lib/default-ports';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CursorStatus, CursorConfig, CursorProbeResult } from '@/hooks/use-cursor';

// ---------------------------------------------------------------------------
// StatusItem — single row in the status grid
// ---------------------------------------------------------------------------

function StatusItem({
  icon: Icon,
  label,
  ok,
  detail,
}: {
  icon: ElementType;
  label: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm">{label}</p>
      </div>
      <div className="flex items-center gap-1.5">
        {ok ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : (
          <XCircle className="h-4 w-4 text-muted-foreground" />
        )}
        <span
          className={cn('text-xs', ok ? 'text-green-500' : 'text-muted-foreground')}
          title={detail}
        >
          {detail}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusSidebar props
// ---------------------------------------------------------------------------

interface StatusSidebarProps {
  status: CursorStatus | undefined;
  config: CursorConfig | undefined;
  statusLoading: boolean;
  visibleProbeResult: CursorProbeResult | null;
  integrationBadge: React.ReactNode;
  canStart: boolean;
  isUpdatingConfig: boolean;
  isAutoDetectingAuth: boolean;
  isImportingManualAuth: boolean;
  isRunningProbe: boolean;
  isStartingDaemon: boolean;
  isStoppingDaemon: boolean;
  onRefreshStatus: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onAutoDetectAuth: () => void;
  onOpenManualAuth: () => void;
  onRunProbe: () => void;
  onStartDaemon: () => void;
  onStopDaemon: () => void;
}

// ---------------------------------------------------------------------------
// StatusSidebar component
// ---------------------------------------------------------------------------

export function StatusSidebar({
  status,
  config,
  statusLoading,
  visibleProbeResult,
  integrationBadge,
  canStart,
  isUpdatingConfig,
  isAutoDetectingAuth,
  isRunningProbe,
  isStartingDaemon,
  isStoppingDaemon,
  onRefreshStatus,
  onToggleEnabled,
  onAutoDetectAuth,
  onOpenManualAuth,
  onRunProbe,
  onStartDaemon,
  onStopDaemon,
}: StatusSidebarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="w-80 border-r flex flex-col bg-muted/30 shrink-0">
      {/* Identity strip */}
      <div className="p-4 border-b bg-background">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <img
              src="/assets/sidebar/cursor.svg"
              alt=""
              className="w-5 h-5 object-contain shrink-0"
            />
            <h1 className="font-semibold">{t('cursorPage.title')}</h1>
            <Badge
              variant="outline"
              className="h-5 border-red-500/50 bg-red-500/10 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-300"
            >
              {t('cursorPage.deprecated')}
            </Badge>
            {integrationBadge}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onRefreshStatus}
            disabled={statusLoading}
            aria-label={t('cursorPage.refreshStatus')}
            title={t('cursorPage.refreshStatus')}
          >
            <RefreshCw className={cn('w-4 h-4', statusLoading && 'animate-spin')} />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('cursorPage.subtitle')}</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Unofficial warning banner */}
          <div className="rounded-md border border-yellow-500/50 bg-yellow-500/15 p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
              <span className="text-xs font-semibold text-yellow-800 dark:text-yellow-200">
                {t('cursorPage.unofficialTitle')}
              </span>
            </div>
            <ul className="text-[11px] text-yellow-700 dark:text-yellow-300 space-y-0.5 pl-6 list-disc">
              <li>{t('cursorPage.unofficialItem1')}</li>
              <li>{t('cursorPage.unofficialItem2')}</li>
              <li>{t('cursorPage.unofficialItem3')}</li>
            </ul>
          </div>

          {/* Supported path — navigate to CLIProxy */}
          <div className="rounded-md border border-border/70 bg-background/90 p-3 space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('cursorPage.supportedPathTitle')}
              </p>
              <p className="text-xs text-muted-foreground">{t('cursorPage.supportedPathDesc')}</p>
            </div>
            <div className="grid gap-2">
              <Button
                size="sm"
                className="w-full"
                onClick={() => navigate('/cliproxy?provider=cursor&action=auth')}
              >
                <Key className="w-3.5 h-3.5 mr-1.5" />
                {t('cursorPage.startCliproxyAuth')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => navigate('/cliproxy?provider=cursor')}
              >
                <Zap className="w-3.5 h-3.5 mr-1.5" />
                {t('cursorPage.openCliproxyCursor')}
              </Button>
            </div>
          </div>

          {/* Status grid */}
          <div className="space-y-2">
            <StatusItem
              icon={ShieldCheck}
              label={t('cursorPage.integration')}
              ok={Boolean(status?.enabled)}
              detail={status?.enabled ? t('cursorPage.enabled') : t('cursorPage.disabled')}
            />
            <StatusItem
              icon={Key}
              label={t('cursorPage.authentication')}
              ok={Boolean(status?.authenticated && !status?.token_expired)}
              detail={
                status?.authenticated
                  ? status?.token_expired
                    ? t('cursorPage.expired')
                    : (status.auth_method ?? t('cursorPage.connected'))
                  : t('cursorPage.notConnected')
              }
            />
            <StatusItem
              icon={Server}
              label={t('cursorPage.daemon')}
              ok={Boolean(status?.daemon_running)}
              detail={status?.daemon_running ? t('cursorPage.running') : t('cursorPage.stopped')}
            />
          </div>

          {/* Live probe panel */}
          <div className="rounded-md border bg-background/80 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Code2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('cursorPage.liveProbe')}
                </span>
              </div>
              <Badge
                variant={visibleProbeResult ? 'outline' : 'secondary'}
                className={cn(
                  visibleProbeResult?.ok &&
                    'border-green-500/40 text-green-600 dark:text-green-300',
                  visibleProbeResult &&
                    !visibleProbeResult.ok &&
                    'border-red-500/40 text-red-600 dark:text-red-300'
                )}
              >
                {visibleProbeResult
                  ? visibleProbeResult.ok
                    ? t('cursorPage.probeSucceeded')
                    : t('cursorPage.probeFailed')
                  : t('cursorPage.probeNotRun')}
              </Badge>
            </div>

            {visibleProbeResult ? (
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{t('cursorPage.probeStage')}</span>
                  <span className="font-mono uppercase">{visibleProbeResult.stage}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{t('cursorPage.probeHttpStatus')}</span>
                  <span className="font-mono">{visibleProbeResult.status}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{t('cursorPage.probeDuration')}</span>
                  <span className="font-mono">{visibleProbeResult.duration_ms} ms</span>
                </div>
                {visibleProbeResult.model ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{t('cursorPage.probeModel')}</span>
                    <span className="font-mono text-[11px] text-right break-all">
                      {visibleProbeResult.model}
                    </span>
                  </div>
                ) : null}
                <div className="space-y-1 pt-1">
                  <span className="text-muted-foreground">{t('cursorPage.probeMessage')}</span>
                  <p className="text-[11px] leading-relaxed break-words">
                    {visibleProbeResult.message}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t('cursorPage.probeNotRun')}</p>
            )}

            <p className="text-[11px] text-muted-foreground">
              {t('cursorPage.probeLocalReadinessHint')}
            </p>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('cursorPage.actions')}
            </p>

            {status?.enabled ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => onToggleEnabled(false)}
                disabled={isUpdatingConfig}
              >
                <PowerOff className="w-3.5 h-3.5 mr-1.5" />
                {t('cursorPage.disableIntegration')}
              </Button>
            ) : (
              <Button
                size="sm"
                className="w-full"
                onClick={() => onToggleEnabled(true)}
                disabled={isUpdatingConfig}
              >
                <Power className="w-3.5 h-3.5 mr-1.5" />
                {t('cursorPage.enableIntegration')}
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={onAutoDetectAuth}
              disabled={isAutoDetectingAuth}
            >
              {isAutoDetectingAuth ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Key className="w-3.5 h-3.5 mr-1.5" />
              )}
              {t('cursorPage.autoDetectAuth')}
            </Button>

            <Button variant="outline" size="sm" className="w-full" onClick={onOpenManualAuth}>
              <Key className="w-3.5 h-3.5 mr-1.5" />
              {t('cursorPage.manualAuthImport')}
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={onRunProbe}
              disabled={isRunningProbe}
            >
              {isRunningProbe ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Code2 className="w-3.5 h-3.5 mr-1.5" />
              )}
              {isRunningProbe
                ? t('cursorPage.probing')
                : visibleProbeResult
                  ? t('cursorPage.rerunLiveProbe')
                  : t('cursorPage.runLiveProbe')}
            </Button>

            {status?.daemon_running ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={onStopDaemon}
                disabled={isStoppingDaemon}
              >
                {isStoppingDaemon ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <PowerOff className="w-3.5 h-3.5 mr-1.5" />
                )}
                {t('cursorPage.stopDaemon')}
              </Button>
            ) : (
              <Button
                size="sm"
                className="w-full"
                onClick={onStartDaemon}
                disabled={!canStart || isStartingDaemon}
              >
                {isStartingDaemon ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 mr-1.5" />
                )}
                {t('cursorPage.startDaemon')}
              </Button>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Port footer */}
      <div className="p-3 border-t bg-background text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>{t('cursorPage.port')}</span>
          <span>{status?.port ?? config?.port ?? DEFAULT_CURSOR_PORT}</span>
        </div>
      </div>
    </div>
  );
}
