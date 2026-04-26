/**
 * Copilot Page — Design System Migration (Phase 3)
 *
 * Archetype: Single-entity Config
 * Identity strip: Rail-anchored (§1b) — page identity lives in the left rail header
 * Layout: PageShell > ConfigLayout(left=status rail, form=FormPane[CopilotConfigForm])
 *
 * Status sidebar carries: page identity, refresh action, conditional setup/auth/daemon sections.
 * No separate JsonPane — CopilotConfigForm already ships its own raw editor split.
 */

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Github,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Power,
  PowerOff,
  Key,
  Server,
  Cpu,
  Download,
  Loader2,
} from 'lucide-react';
import { useCopilot } from '@/hooks/use-copilot';
import { CopilotConfigForm } from '@/components/copilot/copilot-config-form';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { PageShell } from '@/components/page-shell';
import { ConfigLayout } from '@/components/config-layout';

// ---------------------------------------------------------------------------
// Status section component
// ---------------------------------------------------------------------------
function StatusSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-3">
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status item component
// ---------------------------------------------------------------------------
function StatusItem({
  icon: Icon,
  label,
  status,
  statusText,
  variant = 'default',
}: {
  icon: React.ElementType;
  label: string;
  status: boolean;
  statusText?: string;
  variant?: 'default' | 'warning';
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/50">
      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-sm">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {status ? (
          <>
            <CheckCircle2
              className={cn(
                'w-4 h-4',
                variant === 'warning' ? 'text-yellow-500' : 'text-green-500'
              )}
            />
            <span
              className={cn(
                'text-xs',
                variant === 'warning' ? 'text-yellow-500' : 'text-green-500'
              )}
            >
              {statusText || 'Yes'}
            </span>
          </>
        ) : (
          <>
            <XCircle className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{statusText || 'No'}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton for the status rail
// ---------------------------------------------------------------------------
function LoadingRail() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status rail — left pane of ConfigLayout
// ---------------------------------------------------------------------------
function CopilotStatusRail() {
  const { t } = useTranslation();
  const {
    status,
    statusLoading,
    refetchStatus,
    startAuth,
    isAuthenticating,
    startDaemon,
    isStartingDaemon,
    stopDaemon,
    isStoppingDaemon,
    install,
    isInstalling,
  } = useCopilot();

  return (
    <div className="flex h-full flex-col">
      {/* Rail header — page identity strip (§1b rail-anchored pattern) */}
      <div className="border-b bg-background p-4 shrink-0">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Github className="w-5 h-5 text-primary" />
            <h1 className="font-semibold">{t('copilotPage.title')}</h1>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => refetchStatus()}
            disabled={statusLoading}
            aria-label={t('copilotPage.refresh', 'Refresh status')}
          >
            <RefreshCw className={cn('w-4 h-4', statusLoading && 'animate-spin')} />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('copilotPage.subtitle')}</p>
      </div>

      {/* Rail body — conditional status sections */}
      <ScrollArea className="flex-1">
        {statusLoading ? (
          <LoadingRail />
        ) : (
          <div className="p-3 space-y-4">
            {/* Warning Banner - Disclaimer */}
            <div className="rounded-md border border-yellow-500/50 bg-yellow-500/15 p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
                <span className="text-xs font-semibold text-yellow-800 dark:text-yellow-200">
                  {t('copilotPage.unofficialTitle')}
                </span>
              </div>
              <ul className="text-[11px] text-yellow-700 dark:text-yellow-300 space-y-0.5 pl-6 list-disc">
                <li>{t('copilotPage.unofficialItem1')}</li>
                <li>{t('copilotPage.unofficialItem2')}</li>
                <li>{t('copilotPage.unofficialItem3')}</li>
              </ul>
            </div>

            {/* Setup — binary first, then enabled status */}
            <StatusSection title={t('copilotPage.setup')}>
              <StatusItem
                icon={Server}
                label="copilot-api"
                status={status?.installed ?? false}
                statusText={
                  status?.installed
                    ? status.version
                      ? `v${status.version}`
                      : t('copilotPage.installed')
                    : t('copilotPage.missing')
                }
              />
              {!status?.installed && (
                <Button
                  size="sm"
                  className="w-full mt-2"
                  onClick={() => install(undefined)}
                  disabled={isInstalling}
                >
                  {isInstalling ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      {t('copilotPage.installing')}
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5 mr-1.5" />
                      {t('copilotPage.installCopilotApi')}
                    </>
                  )}
                </Button>
              )}
              {status?.installed && (
                <StatusItem
                  icon={Power}
                  label={t('copilotPage.integration')}
                  status={status?.enabled ?? false}
                  statusText={
                    status?.enabled ? t('copilotPage.enabled') : t('copilotPage.disabled')
                  }
                />
              )}
            </StatusSection>

            {/* Authentication — only show after binary installed */}
            {status?.installed && (
              <StatusSection title={t('copilotPage.auth')}>
                <StatusItem
                  icon={Key}
                  label={t('copilotPage.github')}
                  status={status?.authenticated ?? false}
                  statusText={
                    status?.authenticated
                      ? t('copilotPage.connected')
                      : t('copilotPage.notConnected')
                  }
                />
                {!status?.authenticated && (
                  <Button
                    size="sm"
                    className="w-full mt-2"
                    onClick={() => startAuth()}
                    disabled={isAuthenticating}
                  >
                    {isAuthenticating
                      ? t('copilotPage.authenticating')
                      : t('copilotPage.authenticate')}
                  </Button>
                )}
              </StatusSection>
            )}

            {/* Daemon — only show after authenticated */}
            {status?.authenticated && (
              <StatusSection title={t('copilotPage.daemon')}>
                <StatusItem
                  icon={Cpu}
                  label={t('copilotPage.status')}
                  status={status?.daemon_running ?? false}
                  statusText={
                    status?.daemon_running ? t('copilotPage.running') : t('copilotPage.stopped')
                  }
                />
                <div className="px-3 py-1 text-xs text-muted-foreground">
                  {t('copilotPage.port')}: {status?.port ?? 4141}
                </div>
                <div className="px-1">
                  {status?.daemon_running ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => stopDaemon()}
                      disabled={isStoppingDaemon}
                    >
                      <PowerOff className="w-3.5 h-3.5 mr-1.5" />
                      {isStoppingDaemon ? t('copilotPage.stopping') : t('copilotPage.stop')}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => startDaemon()}
                      disabled={isStartingDaemon}
                    >
                      <Power className="w-3.5 h-3.5 mr-1.5" />
                      {isStartingDaemon ? t('copilotPage.starting') : t('copilotPage.start')}
                    </Button>
                  )}
                </div>
              </StatusSection>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Rail footer — proxy status summary */}
      <div className="border-t bg-background p-3 text-xs text-muted-foreground shrink-0">
        <div className="flex items-center justify-between">
          <span>{t('copilotPage.proxy')}</span>
          {status?.daemon_running ? (
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-green-500" />
              {t('copilotPage.active')}
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <XCircle className="w-3 h-3 text-muted-foreground" />
              {t('copilotPage.inactive')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CopilotPage — composed with design system primitives
// ---------------------------------------------------------------------------
export function CopilotPage() {
  return (
    <PageShell>
      <ConfigLayout
        left={<CopilotStatusRail />}
        // CopilotConfigForm manages its own internal scroll + header + split
        // layout. Do NOT wrap it in FormPane (which adds its own ScrollArea +
        // padding) — that would create double-scroll nesting and break the
        // form's flex height calculations.
        form={<CopilotConfigForm />}
      />
    </PageShell>
  );
}
