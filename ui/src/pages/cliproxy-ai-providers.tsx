import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { AiProviderEntryView, AiProviderFamilyId } from '../../../src/cliproxy/ai-providers';
import { ProviderLogo } from '@/components/cliproxy/provider-logo';
import { ProxyStatusWidget } from '@/components/monitoring/proxy-status-widget';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { getAiProviderFamilyVisual } from '@/lib/provider-config';
import { cn } from '@/lib/utils';
import { FamilyRail, ProviderEntryDialog } from '@/components/cliproxy/ai-providers';
import { EmptyEntryWorkspace } from '@/components/cliproxy/ai-providers/empty-entry-workspace';
import {
  getFamilyStatusBadge,
  getRoutingMode,
  renderModelRuleSummary,
} from '@/components/cliproxy/ai-providers/entry-editor-utils';
import { EntryInspector } from '@/components/cliproxy/ai-providers/entry-inspector';
import { EntrySecretBadge, SummaryCard } from '@/components/cliproxy/ai-providers/entry-primitives';
import {
  useCliproxyAiProviders,
  useCreateCliproxyAiProviderEntry,
  useDeleteCliproxyAiProviderEntry,
  useUpdateCliproxyAiProviderEntry,
} from '@/hooks/use-cliproxy-ai-providers';
import { AlertCircle, Check, ExternalLink, ListFilter, Plus, RefreshCw, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function CliproxyAiProvidersPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data, error, isLoading, isFetching, refetch } = useCliproxyAiProviders();
  const createMutation = useCreateCliproxyAiProviderEntry();
  const updateMutation = useUpdateCliproxyAiProviderEntry();
  const deleteMutation = useDeleteCliproxyAiProviderEntry();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<AiProviderEntryView | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<AiProviderEntryView | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  const families = useMemo(() => data?.families ?? [], [data?.families]);
  const requestedFamily = useMemo(
    () => (new URLSearchParams(location.search).get('family') as AiProviderFamilyId | null) || null,
    [location.search]
  );
  const selectedFamily = useMemo<AiProviderFamilyId>(() => {
    if (requestedFamily && families.some((family) => family.id === requestedFamily)) {
      return requestedFamily;
    }

    return families[0]?.id ?? 'gemini-api-key';
  }, [families, requestedFamily]);

  const selectedFamilyState = useMemo(
    () => families.find((family) => family.id === selectedFamily) || null,
    [families, selectedFamily]
  );

  const effectiveSelectedEntryId = useMemo(() => {
    const entries = selectedFamilyState?.entries ?? [];
    if (entries.length === 0) {
      return null;
    }

    if (selectedEntryId && entries.some((entry) => entry.id === selectedEntryId)) {
      return selectedEntryId;
    }

    return entries[0]?.id ?? null;
  }, [selectedEntryId, selectedFamilyState?.entries]);

  const handleFamilySelect = (family: AiProviderFamilyId) => {
    navigate({ pathname: location.pathname, search: `?family=${family}` }, { replace: true });
  };

  const openCreateDialog = () => {
    setEditingEntry(null);
    setDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 overflow-hidden">
        <Skeleton className="h-full w-80 rounded-none" />
        <Skeleton className="h-full flex-1 rounded-none" />
      </div>
    );
  }

  if (error || !data || !selectedFamilyState) {
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

  const configuredEntries = selectedFamilyState.entries.filter((entry) => entry.secretConfigured);
  const readyFamilies = families.filter((family) => family.status === 'ready').length;
  const selectedEntry =
    selectedFamilyState.entries.find((entry) => entry.id === effectiveSelectedEntryId) ?? null;
  const hasMultipleEntries = selectedFamilyState.entries.length > 1;
  const statusBadge = getFamilyStatusBadge(selectedFamilyState.status);
  const hasEntries = selectedFamilyState.entries.length > 0;
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

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="flex w-80 flex-col border-r bg-muted/30">
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

          <Button
            variant="default"
            size="sm"
            className="w-full gap-2"
            type="button"
            onClick={openCreateDialog}
          >
            <Plus className="h-4 w-4" />
            {selectedFamilyState.supportsNamedEntries
              ? 'Create Connector'
              : `Add ${selectedFamilyState.displayName} Entry`}
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            <div className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Provider Families
            </div>
            <FamilyRail
              families={families}
              selectedFamily={selectedFamily}
              onSelect={handleFamilySelect}
            />
          </div>
        </ScrollArea>

        <div className="border-t p-3">
          <ProxyStatusWidget />
        </div>

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

      <div className="flex min-w-0 flex-1 flex-col bg-background">
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

        {hasEntries ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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

              {hasMultipleEntries ? (
                <div className="flex flex-wrap gap-3">
                  {selectedFamilyState.entries.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setSelectedEntryId(entry.id)}
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
                            {renderModelRuleSummary(entry.models)}
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
                          {renderModelRuleSummary(selectedEntry.models)}
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

            {selectedEntry ? (
              <EntryInspector
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
                onDelete={() => setDeleteEntry(selectedEntry)}
              />
            ) : null}
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="space-y-6 p-6">
              {setupStatusCard}
              <EmptyEntryWorkspace
                family={selectedFamilyState}
                onAddEntry={openCreateDialog}
                onOpenControlPanel={() => navigate('/cliproxy/control-panel')}
                onOpenProfiles={() => navigate('/providers')}
              />
            </div>
          </ScrollArea>
        )}
      </div>

      <ProviderEntryDialog
        key={`${selectedFamily}:${editingEntry?.id ?? 'new'}:${dialogOpen ? 'open' : 'closed'}`}
        family={selectedFamily}
        entry={editingEntry}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={async (payload) => {
          if (editingEntry) {
            await updateMutation.mutateAsync({
              family: selectedFamily,
              entryId: editingEntry.id,
              data: payload,
            });
          } else {
            await createMutation.mutateAsync({ family: selectedFamily, data: payload });
          }
          setDialogOpen(false);
          setEditingEntry(null);
          void refetch();
        }}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />

      <ConfirmDialog
        open={deleteEntry !== null}
        title="Remove provider entry?"
        description={
          deleteEntry
            ? `This removes ${deleteEntry.label} from ${selectedFamilyState.displayName}.`
            : ''
        }
        confirmText="Remove"
        variant="destructive"
        onConfirm={async () => {
          if (!deleteEntry) return;
          await deleteMutation.mutateAsync({
            family: selectedFamily,
            entryId: deleteEntry.id,
          });
          setDeleteEntry(null);
        }}
        onCancel={() => setDeleteEntry(null)}
      />
    </div>
  );
}
