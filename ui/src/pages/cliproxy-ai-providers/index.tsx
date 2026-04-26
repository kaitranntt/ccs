/**
 * CLIProxy AI Providers page — Phase 4 design system rewrite.
 *
 * Archetype: Multi-entity Config (Rail-anchored identity, §1b).
 * Identity lives in the left rail (brand + CTA + FamilyRail + ProxyStatusWidget).
 * No top PageHeader — rail carries the page brand per design-system.md §1b.
 *
 * Layout:
 *   Left rail (280px) — brand strip, add CTA, FamilyRail, ProxyStatusWidget, footer summary
 *   Main content — family header, entry list selector, AiProviderForm (or EmptyState)
 *
 * Dialogs:
 *   ProviderEntryDialog — create / edit entry
 *   ConfirmDialog — delete confirmation
 */

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AiProviderFamilyId } from '../../../../src/cliproxy/ai-providers';
import { ProviderLogo } from '@/components/cliproxy/provider-logo';
import { FamilyRail, ProviderEntryDialog } from '@/components/cliproxy/ai-providers';
import { ProxyStatusWidget } from '@/components/monitoring/proxy-status-widget';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useCliproxyAiProviders,
  useCreateCliproxyAiProviderEntry,
  useDeleteCliproxyAiProviderEntry,
  useUpdateCliproxyAiProviderEntry,
} from '@/hooks/use-cliproxy-ai-providers';
import { getAiProviderFamilyVisual } from '@/lib/provider-config';
import { cn } from '@/lib/utils';
import { AlertCircle, Check, ExternalLink, ListFilter, Plus, RefreshCw, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AiProviderForm } from './cliproxy-ai-providers-form';
import { useAiProvidersPage } from './hooks/use-ai-providers-page';
import {
  getFamilyStatusBadge,
  getRoutingMode,
  renderModelRuleSummary,
} from './lib/ai-provider-utils';
import { EntrySecretBadge, SummaryCard } from './sections/provider-entry-primitives';
import { ProviderEmptyState } from './sections/provider-empty-state';

// ---------------------------------------------------------------------------
// Page export — named export matches the App.tsx lazy import
// ---------------------------------------------------------------------------

export function CliproxyAiProvidersPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data, error, isLoading, isFetching, refetch } = useCliproxyAiProviders();
  const createMutation = useCreateCliproxyAiProviderEntry();
  const updateMutation = useUpdateCliproxyAiProviderEntry();
  const deleteMutation = useDeleteCliproxyAiProviderEntry();

  const families = useMemo(() => data?.families ?? [], [data?.families]);

  const page = useAiProvidersPage(families);

  // -------------------------------------------------------------------------
  // Loading skeleton
  // -------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 overflow-hidden">
        <Skeleton className="h-full w-80 rounded-none" />
        <Skeleton className="h-full flex-1 rounded-none" />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------
  if (error || !data || !page.selectedFamilyState) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to load CLIProxy AI providers. Check the local server and try again.';

    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-muted/10 p-6">
        <div className="w-full max-w-2xl rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-destructive/10">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-lg font-semibold">{t('aiProvidersPage.unableToLoad')}</div>
              <div className="mt-2 text-sm text-muted-foreground">{message}</div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" onClick={() => void refetch()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/cliproxy/control-panel')}
                >
                  Control Panel
                </Button>
                <Button type="button" variant="outline" onClick={() => navigate('/providers')}>
                  API Profiles
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Derived display values
  // -------------------------------------------------------------------------
  const { selectedFamily, selectedFamilyState, effectiveSelectedEntryId } = page;
  const readyFamilies = families.filter((f) => f.status === 'ready').length;
  const configuredEntries = selectedFamilyState.entries.filter((e) => e.secretConfigured);
  const hasEntries = selectedFamilyState.entries.length > 0;
  const hasMultipleEntries = selectedFamilyState.entries.length > 1;
  const selectedEntry =
    selectedFamilyState.entries.find((e) => e.id === effectiveSelectedEntryId) ?? null;
  const statusBadge = getFamilyStatusBadge(selectedFamilyState.status);

  // Setup status card (shown in empty state scroll area)
  const setupStatusCard = (
    <div className="rounded-xl border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Setup status
          </div>
          <div className="mt-1 text-sm font-medium">{selectedFamilyState.routePath}</div>
        </div>
        <Badge variant="secondary" className={statusBadge.className}>
          {statusBadge.label}
        </Badge>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <SummaryCard
          label="Entries"
          value={`${selectedFamilyState.entries.length}`}
          hint="configured rows"
        />
        <SummaryCard
          label="Secrets"
          value={`${configuredEntries.length}/${selectedFamilyState.entries.length || 0}`}
          hint="stored in CLIProxy"
        />
      </div>
      <div className="mt-3 rounded-lg border bg-muted/15 p-3 text-xs leading-5 text-muted-foreground">
        Overview handles OAuth sign-ins. This page stores CLIProxy-managed keys and connectors. API
        Profiles remains for CCS-native Anthropic-compatible profiles.
      </div>
    </div>
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* ------------------------------------------------------------------ */}
      {/* Left rail — rail-anchored identity (§1b)                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex w-80 flex-col border-r bg-muted/30">
        {/* Brand strip */}
        <div className="border-b bg-background p-4">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              <h1 className="font-semibold">CLIProxy Plus</h1>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            </Button>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">AI Providers</p>

          {/* Primary CTA — context-sensitive label */}
          <Button
            variant="default"
            size="sm"
            className="w-full gap-2"
            type="button"
            onClick={page.openCreateDialog}
          >
            <Plus className="h-4 w-4" />
            {selectedFamilyState.supportsNamedEntries
              ? 'Create Connector'
              : `Add ${selectedFamilyState.displayName} Entry`}
          </Button>
        </div>

        {/* FamilyRail */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            <div className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Provider Families
            </div>
            <FamilyRail
              families={families}
              selectedFamily={selectedFamily}
              onSelect={page.handleFamilySelect}
            />
          </div>
        </ScrollArea>

        {/* ProxyStatusWidget */}
        <div className="border-t p-3">
          <ProxyStatusWidget />
        </div>

        {/* Footer summary */}
        <div className="border-t bg-background p-3 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>{families.length} families</span>
            <span className="flex items-center gap-1">
              <Check className="h-3 w-3 text-emerald-600" />
              {readyFamilies} ready
            </span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Main content area                                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        {/* Family header */}
        <div className="shrink-0 border-b bg-background px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <ProviderLogo
                provider={getAiProviderFamilyVisual(selectedFamilyState.id)}
                size="lg"
              />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{selectedFamilyState.displayName}</h2>
                  <Badge variant="secondary" className={statusBadge.className}>
                    {statusBadge.label}
                  </Badge>
                  <Badge variant="outline" className="uppercase">
                    {selectedFamilyState.authMode}
                  </Badge>
                  <Badge variant="outline" className="font-mono text-[11px]">
                    {selectedFamilyState.routePath}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {selectedFamilyState.description}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/cliproxy/control-panel')}
              >
                Control Panel
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate('/providers')}>
                API Profiles
                <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Entry list + inspector OR empty state */}
        {hasEntries ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* Entry selector strip */}
            <div className="shrink-0 border-b bg-muted/5 px-6 py-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <ListFilter className="h-3 w-3" />
                  {hasMultipleEntries ? 'Saved entries' : 'Saved entry'}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-[11px]">
                    {selectedFamilyState.entries.length} entries
                  </Badge>
                  <Badge variant="outline" className="text-[11px]">
                    {configuredEntries.length}/{selectedFamilyState.entries.length} secrets stored
                  </Badge>
                </div>
              </div>

              {/* Multi-entry card selector */}
              {hasMultipleEntries ? (
                <div className="flex flex-wrap gap-3">
                  {selectedFamilyState.entries.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => page.setSelectedEntryId(entry.id)}
                      className={cn(
                        'min-w-[220px] max-w-[280px] flex-1 rounded-xl border bg-background px-4 py-3 text-left transition-colors',
                        entry.id === effectiveSelectedEntryId
                          ? 'border-primary/30 bg-primary/5 shadow-sm'
                          : 'border-border/60 hover:bg-muted/50'
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-sm font-medium">{entry.label}</div>
                        <EntrySecretBadge configured={entry.secretConfigured} />
                      </div>
                      <div className="mt-2 truncate text-xs text-muted-foreground">
                        {entry.baseUrl || selectedFamilyState.routePath}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="text-[10px]">
                          {getRoutingMode(entry)}
                        </Badge>
                        {entry.models.length > 0 ? (
                          <Badge variant="outline" className="text-[10px]">
                            {renderModelRuleSummary(
                              entry.models.map((m) => ({
                                name: m.name ?? '',
                                alias: m.alias ?? '',
                              }))
                            )}
                          </Badge>
                        ) : null}
                        <Badge variant="outline" className="text-[10px]">
                          {entry.headers.length} hdr
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              ) : selectedEntry ? (
                /* Single-entry display card */
                <div className="rounded-xl border bg-background px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-sm font-medium">{selectedEntry.label}</div>
                        <EntrySecretBadge configured={selectedEntry.secretConfigured} />
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {selectedEntry.baseUrl || selectedFamilyState.routePath}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="text-[10px]">
                        {getRoutingMode(selectedEntry)}
                      </Badge>
                      {selectedEntry.models.length > 0 ? (
                        <Badge variant="outline" className="text-[10px]">
                          {renderModelRuleSummary(
                            selectedEntry.models.map((m) => ({
                              name: m.name ?? '',
                              alias: m.alias ?? '',
                            }))
                          )}
                        </Badge>
                      ) : null}
                      <Badge variant="outline" className="text-[10px]">
                        {selectedEntry.headers.length} hdr
                      </Badge>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Entry inspector — keyed by entry id to force remount on selection change */}
            {selectedEntry ? (
              <AiProviderForm
                key={selectedEntry.id}
                family={selectedFamilyState}
                entry={selectedEntry}
                source={data.source}
                isSaving={updateMutation.isPending}
                onSave={async (payload) => {
                  await updateMutation.mutateAsync({
                    family: selectedFamily,
                    entryId: selectedEntry.id,
                    data: payload,
                  });
                  void refetch();
                }}
                onDelete={() => page.setDeleteEntry(selectedEntry)}
              />
            ) : null}
          </div>
        ) : (
          /* Empty state */
          <ScrollArea className="flex-1">
            <div className="space-y-6 p-6">
              {setupStatusCard}
              <ProviderEmptyState
                family={selectedFamilyState}
                onAddEntry={page.openCreateDialog}
                onOpenControlPanel={() => navigate('/cliproxy/control-panel')}
                onOpenProfiles={() => navigate('/providers')}
              />
            </div>
          </ScrollArea>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Dialogs                                                              */}
      {/* ------------------------------------------------------------------ */}

      {/* Create / edit dialog — keyed to force remount per open/family/entry */}
      <ProviderEntryDialog
        key={`${selectedFamily}:${page.editingEntry?.id ?? 'new'}:${page.dialogOpen ? 'open' : 'closed'}`}
        family={selectedFamily as AiProviderFamilyId}
        entry={page.editingEntry}
        open={page.dialogOpen}
        onOpenChange={page.setDialogOpen}
        onSubmit={async (payload) => {
          if (page.editingEntry) {
            await updateMutation.mutateAsync({
              family: selectedFamily,
              entryId: page.editingEntry.id,
              data: payload,
            });
          } else {
            await createMutation.mutateAsync({ family: selectedFamily, data: payload });
          }
          page.setDialogOpen(false);
          page.setEditingEntry(null);
          void refetch();
        }}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />

      {/* Delete confirm dialog */}
      <ConfirmDialog
        open={page.deleteEntry !== null}
        title="Remove provider entry?"
        description={
          page.deleteEntry
            ? `This removes ${page.deleteEntry.label} from ${selectedFamilyState.displayName}.`
            : ''
        }
        confirmText="Remove"
        variant="destructive"
        onConfirm={async () => {
          if (!page.deleteEntry) return;
          await deleteMutation.mutateAsync({
            family: selectedFamily,
            entryId: page.deleteEntry.id,
          });
          page.setDeleteEntry(null);
        }}
        onCancel={() => page.setDeleteEntry(null)}
      />
    </div>
  );
}
