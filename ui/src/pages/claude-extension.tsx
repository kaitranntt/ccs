import { useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BindingAdvancedTab } from '@/components/claude-extension/binding-advanced-tab';
import { BindingEditorSidebar } from '@/components/claude-extension/binding-editor-sidebar';
import { BindingOverviewTab } from '@/components/claude-extension/binding-overview-tab';
import {
  type BindingDraft,
  EMPTY_BINDINGS,
  bindingToDraft,
  createEmptyDraft,
  isPlainStatusActive,
  normalizeBindingDraft,
} from '@/components/claude-extension/binding-utils';
import {
  type ClaudeExtensionActionTarget,
  useApplyClaudeExtensionBinding,
  useClaudeExtensionBindingStatus,
  useClaudeExtensionBindings,
  useClaudeExtensionOptions,
  useClaudeExtensionSetup,
  useCreateClaudeExtensionBinding,
  useDeleteClaudeExtensionBinding,
  useResetClaudeExtensionBinding,
  useUpdateClaudeExtensionBinding,
} from '@/hooks/use-claude-extension';

export function ClaudeExtensionPage() {
  const { t } = useTranslation();
  const optionsQuery = useClaudeExtensionOptions();
  const bindingsQuery = useClaudeExtensionBindings();
  const createBinding = useCreateClaudeExtensionBinding();
  const updateBinding = useUpdateClaudeExtensionBinding();
  const deleteBinding = useDeleteClaudeExtensionBinding();
  const applyBinding = useApplyClaudeExtensionBinding();
  const resetBinding = useResetClaudeExtensionBinding();

  const profiles = optionsQuery.data?.profiles ?? [];
  const hosts = optionsQuery.data?.hosts ?? [];
  const bindings = bindingsQuery.data?.bindings ?? EMPTY_BINDINGS;
  const defaultProfile = profiles[0]?.name ?? 'default';

  const [isCreating, setIsCreating] = useState(false);
  const [selectedBindingId, setSelectedBindingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BindingDraft>(() => createEmptyDraft('default'));

  const creating = isCreating || bindings.length === 0;
  const selectedBinding =
    !creating && bindings.length > 0
      ? (bindings.find((binding) => binding.id === selectedBindingId) ??
        (selectedBindingId ? null : bindings[0]))
      : null;
  const effectiveSelectedBindingId = selectedBinding?.id ?? null;
  const currentDraft =
    creating || !selectedBinding
      ? draft
      : selectedBindingId
        ? draft
        : bindingToDraft(selectedBinding);

  const setupQuery = useClaudeExtensionSetup(currentDraft.profile, currentDraft.host);
  const statusQuery = useClaudeExtensionBindingStatus(
    creating ? undefined : effectiveSelectedBindingId || undefined
  );

  const selectedHost = hosts.find((host) => host.id === currentDraft.host);
  const selectedProfile = profiles.find((profile) => profile.name === currentDraft.profile);
  const activeError =
    (optionsQuery.error as Error | null) ||
    (bindingsQuery.error as Error | null) ||
    (setupQuery.error as Error | null) ||
    (statusQuery.error as Error | null);

  const isSaving = createBinding.isPending || updateBinding.isPending;
  const isBusyShared =
    (applyBinding.isPending && applyBinding.variables?.target === 'shared') ||
    (resetBinding.isPending && resetBinding.variables?.target === 'shared');
  const isBusyIde =
    (applyBinding.isPending && applyBinding.variables?.target === 'ide') ||
    (resetBinding.isPending && resetBinding.variables?.target === 'ide');
  const canPersist = currentDraft.name.trim().length > 0 && currentDraft.profile.trim().length > 0;

  const setup = setupQuery.data;
  const status = statusQuery.data;

  function startCreateMode(): void {
    setIsCreating(true);
    setSelectedBindingId(null);
    setDraft(createEmptyDraft(defaultProfile));
  }

  async function handleSave(): Promise<void> {
    if (!canPersist) return;

    const payload = normalizeBindingDraft(currentDraft);
    if (!creating && effectiveSelectedBindingId) {
      const result = await updateBinding.mutateAsync({
        id: effectiveSelectedBindingId,
        binding: payload,
      });
      setIsCreating(false);
      setSelectedBindingId(result.binding.id);
      setDraft(bindingToDraft(result.binding));
      return;
    }

    const result = await createBinding.mutateAsync(payload);
    setIsCreating(false);
    setSelectedBindingId(result.binding.id);
    setDraft(bindingToDraft(result.binding));
  }

  async function handleDelete(): Promise<void> {
    if (!effectiveSelectedBindingId || !selectedBinding) return;
    if (
      !window.confirm(
        t('claudeExtensionPage.deleteBindingConfirm', {
          name: selectedBinding.name,
          defaultValue: 'Delete binding "{{name}}"?',
        })
      )
    ) {
      return;
    }

    await deleteBinding.mutateAsync(effectiveSelectedBindingId);
    const remaining = bindings.filter((binding) => binding.id !== effectiveSelectedBindingId);
    if (remaining.length > 0) {
      setSelectedBindingId(remaining[0].id);
      setIsCreating(false);
      setDraft(bindingToDraft(remaining[0]));
    } else {
      startCreateMode();
    }
  }

  function updateDraft<K extends keyof BindingDraft>(key: K, value: BindingDraft[K]): void {
    if (!creating && selectedBinding && !selectedBindingId) {
      setSelectedBindingId(selectedBinding.id);
      setDraft({ ...bindingToDraft(selectedBinding), [key]: value });
      setIsCreating(false);
      return;
    }
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function runBindingAction(target: ClaudeExtensionActionTarget, action: 'apply' | 'reset'): void {
    if (!effectiveSelectedBindingId) return;
    if (action === 'apply') {
      applyBinding.mutate({ id: effectiveSelectedBindingId, target });
      return;
    }
    resetBinding.mutate({ id: effectiveSelectedBindingId, target });
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <BindingEditorSidebar
        bindings={bindings}
        profiles={profiles}
        hosts={hosts}
        selectedHost={selectedHost}
        selectedProfile={selectedProfile}
        creating={creating}
        effectiveSelectedBindingId={effectiveSelectedBindingId}
        currentDraft={currentDraft}
        canPersist={canPersist}
        isSaving={isSaving}
        isDeleting={deleteBinding.isPending}
        onStartCreateMode={startCreateMode}
        onUpdateDraft={updateDraft}
        onSave={handleSave}
        onDelete={handleDelete}
        onSelectBinding={(binding) => {
          setIsCreating(false);
          setSelectedBindingId(binding.id);
          setDraft(bindingToDraft(binding));
        }}
      />

      <div className="min-w-0 flex-1">
        <ScrollArea className="h-full">
          <div className="w-full space-y-6 p-6 xl:p-7 2xl:p-8">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {selectedProfile ? (
                    <Badge variant="outline">{selectedProfile.label}</Badge>
                  ) : null}
                  {selectedHost ? <Badge variant="outline">{selectedHost.label}</Badge> : null}
                  {creating ? (
                    <Badge variant="secondary">{t('settingsPage.thinkingSection.draft')}</Badge>
                  ) : null}
                  {status?.sharedSettings &&
                  isPlainStatusActive(status.sharedSettings) &&
                  isPlainStatusActive(status.ideSettings) ? (
                    <Badge className="bg-emerald-600 hover:bg-emerald-600">
                      {t('settingsPage.thinkingSection.inSync')}
                    </Badge>
                  ) : null}
                </div>
                <div className="max-w-5xl">
                  <h2 className="text-2xl font-semibold tracking-tight">
                    {selectedBinding?.name ||
                      t('claudeExtensionPage.defaultBindingName', {
                        defaultValue: 'Claude extension binding',
                      })}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t('claudeExtensionPage.bindingDescription', {
                      defaultValue:
                        'Manage the shared Claude settings file and the IDE-local settings file as two scoped targets.',
                    })}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => void statusQuery.refetch()}
                  disabled={creating || statusQuery.isFetching}
                >
                  {statusQuery.isFetching ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {t('claudeExtensionPage.verify', { defaultValue: 'Verify' })}
                </Button>
                {setup ? (
                  <CopyButton value={setup.sharedSettings.command} label="Copy persist command" />
                ) : null}
              </div>
            </div>

            {activeError ? (
              <Card className="border-destructive/40 bg-destructive/5">
                <CardContent className="flex items-start gap-3 pt-6 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>{activeError.message}</div>
                </CardContent>
              </Card>
            ) : null}

            {!activeError ? (
              <Tabs defaultValue="overview" className="flex flex-col gap-6">
                <TabsList className="w-full justify-start">
                  <TabsTrigger value="overview">
                    {t('claudeExtensionPage.overview', { defaultValue: 'Overview' })}
                  </TabsTrigger>
                  <TabsTrigger value="advanced">
                    {t('settingsPage.thinkingSection.advanced')}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-0 space-y-6">
                  <BindingOverviewTab
                    selectedHost={selectedHost}
                    currentDraft={currentDraft}
                    setup={setup}
                    status={status}
                    creating={creating}
                    isBusyShared={isBusyShared}
                    isBusyIde={isBusyIde}
                    isApplyingAll={
                      applyBinding.isPending && applyBinding.variables?.target === 'all'
                    }
                    isResettingAll={resetBinding.isPending}
                    onRunBindingAction={runBindingAction}
                  />
                </TabsContent>

                <TabsContent value="advanced" className="mt-0 space-y-6">
                  <BindingAdvancedTab
                    setup={setup}
                    status={status}
                    selectedHost={selectedHost}
                    currentDraft={currentDraft}
                  />
                </TabsContent>
              </Tabs>
            ) : null}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
