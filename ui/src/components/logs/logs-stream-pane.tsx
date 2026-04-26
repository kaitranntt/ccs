/**
 * logs-stream-pane.tsx
 *
 * 3-pane layout for the "Telemetry Stream" tab:
 *   [Filters sidebar] | [Entry list] | [Detail panel]
 *
 * Each pane is collapsible on desktop (>=1200px). On mobile the panes stack
 * vertically with fixed min-heights.
 *
 * NOTE: This component owns its own height/scroll entirely — do NOT wrap it in
 * another ScrollArea. The inner LogsEntryList and LogsDetailPanel each manage
 * their own virtualized scroll.
 */
import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { LogsConfigCard } from './logs-config-card';
import { LogsDetailPanel } from './logs-detail-panel';
import { LogsEntryList } from './logs-entry-list';
import { LogsFilters } from './logs-filters';
import type { LogsConfig, LogsEntry, LogsSource, UpdateLogsConfigPayload } from '@/lib/api-client';
import type { LogsLevelFilter, LogsSourceFilter } from '@/hooks/use-logs';

const DESKTOP_BREAKPOINT = 1200;
const LEFT_PANEL_WIDTH = 336;
const RIGHT_PANEL_WIDTH = 368;
const COLLAPSED_PANEL_WIDTH = 52;

function CollapsedPaneToggle({
  side,
  label,
  onExpand,
}: {
  side: 'left' | 'right';
  label: string;
  onExpand: () => void;
}) {
  return (
    <div
      className={cn(
        'flex h-full w-full flex-col items-center justify-center gap-4 bg-muted/5',
        side === 'left' ? 'border-r border-border' : 'border-l border-border'
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={onExpand}
        aria-label={`Show ${label.toLowerCase()}`}
        className="h-9 w-9 rounded-xl border border-border/70 bg-background/85 shadow-sm"
      >
        {side === 'left' ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </Button>
      <span
        className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/45"
        style={{ writingMode: 'vertical-rl' }}
      >
        {label}
      </span>
    </div>
  );
}

interface LogsStreamPaneProps {
  sources: LogsSource[];
  entries: LogsEntry[];
  config: LogsConfig;
  selectedEntryId: string | null;
  /** null when no entry is selected (from useLogsWorkspace). */
  selectedEntry: LogsEntry | null;
  sourceLabels: Record<string, string>;
  selectedSource: LogsSourceFilter;
  selectedLevel: LogsLevelFilter;
  search: string;
  limit: number;
  isEntriesLoading: boolean;
  isEntriesFetching: boolean;
  isSourcesFetching: boolean;
  isConfigPending: boolean;
  onSourceChange: (source: LogsSourceFilter) => void;
  onLevelChange: (level: LogsLevelFilter) => void;
  onSearchChange: (search: string) => void;
  onLimitChange: (limit: number) => void;
  onRefresh: () => void;
  onSelectEntry: (entryId: string) => void;
  onSaveConfig: (payload: UpdateLogsConfigPayload) => void;
}

export function LogsStreamPane({
  sources,
  entries,
  config,
  selectedEntryId,
  selectedEntry,
  sourceLabels,
  selectedSource,
  selectedLevel,
  search,
  limit,
  isEntriesLoading,
  isEntriesFetching,
  isSourcesFetching,
  isConfigPending,
  onSourceChange,
  onLevelChange,
  onSearchChange,
  onLimitChange,
  onRefresh,
  onSelectEntry,
  onSaveConfig,
}: LogsStreamPaneProps) {
  const [isDesktopLayout, setIsDesktopLayout] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= DESKTOP_BREAKPOINT : false
  );
  const [isFiltersCollapsed, setIsFiltersCollapsed] = useState(false);
  const [isDetailsCollapsed, setIsDetailsCollapsed] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`);
    const syncLayout = () => {
      setIsDesktopLayout(window.innerWidth >= DESKTOP_BREAKPOINT);
    };

    syncLayout();
    mediaQuery.addEventListener('change', syncLayout);
    return () => mediaQuery.removeEventListener('change', syncLayout);
  }, []);

  const isRefreshing = isEntriesFetching || isSourcesFetching;

  if (isDesktopLayout) {
    return (
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left: Filters */}
        <div
          data-logs-pane="filters"
          style={{ width: isFiltersCollapsed ? COLLAPSED_PANEL_WIDTH : LEFT_PANEL_WIDTH }}
          className="flex min-h-0 shrink-0 bg-muted/5"
        >
          {isFiltersCollapsed ? (
            <CollapsedPaneToggle
              side="left"
              label="Filters"
              onExpand={() => setIsFiltersCollapsed(false)}
            />
          ) : (
            <div className="flex h-full min-h-0 w-full flex-col border-r border-border p-5 2xl:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/80">
                    Filters
                  </p>
                  <p className="text-[11px] text-muted-foreground/70">
                    Search, source, and retention controls
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsFiltersCollapsed(true)}
                  aria-label="Hide filters"
                  className="h-9 w-9 rounded-xl border border-border/70 bg-background/85 shadow-sm"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>

              <ScrollArea className="min-h-0 flex-1" data-logs-scroll-region="filters">
                <div className="space-y-5 pr-4">
                  <LogsFilters
                    sources={sources}
                    selectedSource={selectedSource}
                    onSourceChange={onSourceChange}
                    selectedLevel={selectedLevel}
                    onLevelChange={onLevelChange}
                    search={search}
                    onSearchChange={onSearchChange}
                    limit={limit}
                    onLimitChange={onLimitChange}
                    onRefresh={onRefresh}
                    isRefreshing={isRefreshing}
                  />
                  <div className="border-t border-border/20 pt-5">
                    <LogsConfigCard
                      config={config}
                      onSave={onSaveConfig}
                      isPending={isConfigPending}
                    />
                  </div>
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        {/* Center: Entry list */}
        <div
          data-logs-pane="entries"
          className="flex min-h-0 min-w-0 flex-1 overflow-hidden border-l border-r border-border bg-background/95"
        >
          <LogsEntryList
            entries={entries}
            selectedEntryId={selectedEntryId}
            onSelect={onSelectEntry}
            sourceLabels={sourceLabels}
            isLoading={isEntriesLoading}
            isFetching={isEntriesFetching}
          />
        </div>

        {/* Right: Detail panel */}
        <div
          data-logs-pane="details"
          style={{ width: isDetailsCollapsed ? COLLAPSED_PANEL_WIDTH : RIGHT_PANEL_WIDTH }}
          className="flex min-h-0 shrink-0 bg-muted/5 shadow-inner"
        >
          {isDetailsCollapsed ? (
            <CollapsedPaneToggle
              side="right"
              label="Details"
              onExpand={() => setIsDetailsCollapsed(false)}
            />
          ) : (
            <div className="flex h-full min-h-0 w-full flex-col">
              <div className="flex items-center justify-between border-b border-border/50 bg-background/60 px-3 py-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/80">
                    Details
                  </p>
                  <p className="text-[11px] text-muted-foreground/70">
                    Selected entry context and raw payload
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsDetailsCollapsed(true)}
                  aria-label="Hide details"
                  className="h-9 w-9 rounded-xl border border-border/70 bg-background/85 shadow-sm"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <LogsDetailPanel
                  entry={selectedEntry}
                  sourceLabel={selectedEntry ? sourceLabels[selectedEntry.source] : undefined}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Mobile: stacked layout
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border bg-muted/5 p-5">
        <div className="flex flex-col gap-6">
          <LogsFilters
            sources={sources}
            selectedSource={selectedSource}
            onSourceChange={onSourceChange}
            selectedLevel={selectedLevel}
            onLevelChange={onLevelChange}
            search={search}
            onSearchChange={onSearchChange}
            limit={limit}
            onLimitChange={onLimitChange}
            onRefresh={onRefresh}
            isRefreshing={isRefreshing}
          />
          <LogsConfigCard config={config} onSave={onSaveConfig} isPending={isConfigPending} />
        </div>
      </div>

      <div className="flex min-h-[32rem] flex-col overflow-hidden border-b border-border bg-background/95">
        <LogsEntryList
          entries={entries}
          selectedEntryId={selectedEntryId}
          onSelect={onSelectEntry}
          sourceLabels={sourceLabels}
          isLoading={isEntriesLoading}
          isFetching={isEntriesFetching}
        />
      </div>

      <div className="flex min-h-[30rem] flex-col overflow-hidden bg-muted/5 shadow-inner">
        <LogsDetailPanel
          entry={selectedEntry}
          sourceLabel={selectedEntry ? sourceLabels[selectedEntry.source] : undefined}
        />
      </div>
    </div>
  );
}
