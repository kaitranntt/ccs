/**
 * logs.tsx — Log Operations Center
 *
 * Monitor archetype: PageShell + PageHeader + KpiRow + custom stream layout.
 *
 * NOTE on scroll architecture:
 *   MonitorLayout wraps children in a ScrollArea. The "Telemetry Stream" tab
 *   owns its own 3-pane full-height layout with independent scroll per pane,
 *   so we do NOT put it inside MonitorLayout's ScrollArea. Instead we use a
 *   flex-1 container that fills the remaining viewport height after the header.
 *   The KpiRow + tab bar sit above the stream; the stream takes all remaining
 *   height via min-h-0 flex-1.
 *
 *   Sub-components extracted (all >300 LOC concern):
 *   - LogsStreamPane  — 3-pane telemetry stream layout (logs-stream-pane.tsx)
 *   - LogsLegacyErrorsCard — legacy CLIProxy failure view (logs-legacy-errors-card.tsx)
 */
import { RefreshCw, ScrollText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { PageShell, PageHeader } from '@/components/page-shell';
import { KpiRow, KpiCard } from '@/components/monitor-layout';
import { LogsLegacyErrorsCard } from '@/components/logs/logs-legacy-errors-card';
import { LogsPageSkeleton } from '@/components/logs/logs-page-skeleton';
import { LogsStreamPane } from '@/components/logs/logs-stream-pane';
import { getSourceLabelMap, useLogsWorkspace, useUpdateLogsConfig } from '@/hooks/use-logs';
import { formatCount, formatRelativeLogTime } from '@/components/logs/utils';
// TODO i18n: import { useTranslation } from 'react-i18next'; when keys are ready

export function LogsPage() {
  // TODO i18n: uncomment when keys for Syncing/Refresh and other strings are added
  // const { t } = useTranslation();
  const workspace = useLogsWorkspace();
  const updateConfig = useUpdateLogsConfig();
  const sourceLabels = getSourceLabelMap(workspace.sourcesQuery.data ?? []);

  if (workspace.isInitialLoading) {
    return <LogsPageSkeleton />;
  }

  const config = workspace.configQuery.data;
  if (!config) {
    return null;
  }

  const entries = workspace.entriesQuery.data ?? [];
  const sources = workspace.sourcesQuery.data ?? [];
  const errorCount = entries.filter((e) => e.level === 'error').length;
  const warnCount = entries.filter((e) => e.level === 'warn').length;
  const latestTimestamp =
    sources
      .map((s) => s.lastTimestamp)
      .filter((v): v is string => Boolean(v))
      .sort()
      .at(-1) ?? null;
  const isRefreshing = workspace.entriesQuery.isFetching || workspace.sourcesQuery.isFetching;

  // PageHeader slots
  const headerStatus = (
    <div className="flex items-center gap-3">
      <Badge
        variant={config.redact ? 'default' : 'secondary'}
        className="rounded-full text-[10px] font-semibold uppercase tracking-[0.12em]"
      >
        Redaction {config.redact ? 'on' : 'off'}
      </Badge>
      <div
        className={cn(
          'h-2 w-2 rounded-full ring-4 transition-all duration-700',
          config.redact
            ? 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.6)] ring-emerald-500/30'
            : 'bg-zinc-400 ring-transparent'
        )}
      />
    </div>
  );

  const headerActions = (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-2 text-xs"
        onClick={() =>
          void Promise.all([workspace.sourcesQuery.refetch(), workspace.entriesQuery.refetch()])
        }
      >
        <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
        {/* TODO i18n: missing key for Syncing/Refresh */}
        {isRefreshing ? 'Syncing' : 'Refresh'}
      </Button>
      <Button asChild variant="outline" size="sm" className="h-8 text-xs">
        <Link to="/health">Health</Link>
      </Button>
    </div>
  );

  return (
    <PageShell>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-primary" aria-hidden="true" />
            Log Operations Center
          </span>
        }
        description="Telemetry stream, source coverage, and retention controls"
        status={headerStatus}
        actions={headerActions}
      />

      {/* KPI strip — pinned above the tab bar */}
      <div className="shrink-0 border-b border-border/60 bg-background/50 px-6 py-4">
        <KpiRow>
          <KpiCard
            label="Pipeline"
            value={config.enabled ? 'Enabled' : 'Disabled'}
            hint={`Threshold: ${config.level.toUpperCase()} · Redaction ${config.redact ? 'on' : 'off'}`}
            tone={config.enabled ? 'positive' : 'default'}
          />
          <KpiCard
            label="Retention"
            value={`${config.retain_days}d`}
            hint={`Rotate at ${config.rotate_mb} MB per file`}
          />
          <KpiCard
            label="Sources"
            value={formatCount(sources.length)}
            hint={
              latestTimestamp
                ? `Last event ${formatRelativeLogTime(latestTimestamp)}`
                : 'No activity yet'
            }
          />
          <KpiCard
            label="Entries"
            value={formatCount(entries.length)}
            hint={`${formatCount(errorCount)} errors · ${formatCount(warnCount)} warnings`}
            tone={errorCount > 0 ? 'negative' : warnCount > 0 ? 'warning' : 'positive'}
          />
        </KpiRow>
      </div>

      {/* Tab bar + stream — flex-1 so it fills remaining viewport height */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <Tabs defaultValue="stream" className="flex flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-border/80 bg-card/80 px-6 py-2 backdrop-blur-xl shadow-inner xl:px-8">
            <TabsList className="h-10 w-auto gap-1.5 rounded-xl border border-border/60 bg-muted/40 p-1">
              <TabsTrigger
                value="stream"
                className="rounded-lg px-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/60 transition-all data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-md"
              >
                Telemetry Stream
              </TabsTrigger>
              <TabsTrigger
                value="errors"
                className="rounded-lg px-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/60 transition-all data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-md"
              >
                Legacy Errors
              </TabsTrigger>
            </TabsList>

            <div className="hidden items-center gap-3 lg:flex">
              <div className="flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 shadow-inner">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-tight text-foreground/80">
                  Connected
                </span>
              </div>
              <span className="pr-4 text-[11px] font-medium tabular-nums text-foreground/45">
                {formatCount(entries.length)} captured
              </span>
            </div>
          </div>

          {/* Telemetry stream: owns full remaining height — no ScrollArea wrapper */}
          <TabsContent
            value="stream"
            className="m-0 flex min-h-0 flex-1 overflow-y-auto lg:overflow-hidden focus-visible:outline-none"
          >
            <LogsStreamPane
              sources={sources}
              entries={entries}
              config={config}
              selectedEntryId={workspace.selectedEntryId}
              selectedEntry={workspace.selectedEntry}
              sourceLabels={sourceLabels}
              selectedSource={workspace.selectedSource}
              selectedLevel={workspace.selectedLevel}
              search={workspace.search}
              limit={workspace.limit}
              isEntriesLoading={workspace.entriesQuery.isLoading}
              isEntriesFetching={workspace.entriesQuery.isFetching}
              isSourcesFetching={workspace.sourcesQuery.isFetching}
              isConfigPending={updateConfig.isPending}
              onSourceChange={(v) => workspace.setSelectedSource(v)}
              onLevelChange={(v) => workspace.setSelectedLevel(v)}
              onSearchChange={workspace.setSearch}
              onLimitChange={workspace.setLimit}
              onRefresh={() =>
                void Promise.all([
                  workspace.sourcesQuery.refetch(),
                  workspace.entriesQuery.refetch(),
                ])
              }
              onSelectEntry={workspace.setSelectedEntryId}
              onSaveConfig={(payload) => updateConfig.mutate(payload)}
            />
          </TabsContent>

          {/* Legacy errors: scrollable, standard padding */}
          <TabsContent
            value="errors"
            className="m-0 flex-1 overflow-y-auto bg-background/20 p-6 focus-visible:outline-none xl:p-8"
          >
            <LogsLegacyErrorsCard />
          </TabsContent>
        </Tabs>
      </div>
    </PageShell>
  );
}
