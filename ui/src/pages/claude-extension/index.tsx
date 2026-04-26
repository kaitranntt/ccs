/**
 * ClaudeExtensionPage — root entry for /claude-extension route.
 *
 * Owns all state and side-effects; delegates rendering entirely to
 * ClaudeExtensionLeftPanel (sidebar) and ClaudeExtensionContentPanel (main).
 *
 * Layout: fixed-width left panel (348px/xl:372px) + flex-1 right panel.
 * This bespoke split is preserved from the original monolith — the page
 * simultaneously acts as its own "list" and "form" (the sidebar combines both),
 * so the standard 3-pane ConfigLayout does not apply here.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useApplyClaudeExtensionBinding,
  useClaudeExtensionBindingStatus,
  useClaudeExtensionBindings,
  useClaudeExtensionOptions,
  useClaudeExtensionSetup,
  useCreateClaudeExtensionBinding,
  useDeleteClaudeExtensionBinding,
  useResetClaudeExtensionBinding,
  useUpdateClaudeExtensionBinding,
  type ClaudeExtensionBinding,
  type ClaudeExtensionActionTarget,
} from '@/hooks/use-claude-extension';
import {
  type BindingDraft,
  createEmptyDraft,
  bindingToDraft,
  normalizeBindingDraft,
} from './lib/claude-extension-draft-utils';
import { ClaudeExtensionLeftPanel } from './claude-extension-left-panel';
import { ClaudeExtensionContentPanel } from './claude-extension-content-panel';

/** Stable empty reference — prevents query hook identity churn. */
const EMPTY_BINDINGS: ClaudeExtensionBinding[] = [];

export function ClaudeExtensionPage() {
  const { t } = useTranslation();

  // -------------------------------------------------------------------------
  // Server state
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Local UI state
  // -------------------------------------------------------------------------
  const [isCreating, setIsCreating] = useState(false);
  const [selectedBindingId, setSelectedBindingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BindingDraft>(() => createEmptyDraft('default'));

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------
  const creating = isCreating || bindings.length === 0;

  const selectedBinding =
    !creating && bindings.length > 0
      ? (bindings.find((b) => b.id === selectedBindingId) ??
        (selectedBindingId ? null : bindings[0]))
      : null;

  const effectiveSelectedBindingId = selectedBinding?.id ?? null;

  // When viewing (not editing) an existing binding, show the saved data;
  // otherwise show the local draft being edited.
  const currentDraft =
    creating || !selectedBinding
      ? draft
      : selectedBindingId
        ? draft
        : bindingToDraft(selectedBinding);

  const setupQuery = useClaudeExtensionSetup(currentDraft.profile, currentDraft.host);
  const statusQuery = useClaudeExtensionBindingStatus(
    creating ? undefined : (effectiveSelectedBindingId ?? undefined)
  );

  const selectedHost = hosts.find((h) => h.id === currentDraft.host);
  const selectedProfile = profiles.find((p) => p.name === currentDraft.profile);

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

  const isApplyingAll = applyBinding.isPending && applyBinding.variables?.target === 'all';

  const isResettingAll = resetBinding.isPending && resetBinding.variables?.target === 'all';

  const canPersist = currentDraft.name.trim().length > 0 && currentDraft.profile.trim().length > 0;

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
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
    )
      return;

    await deleteBinding.mutateAsync(effectiveSelectedBindingId);
    const remaining = bindings.filter((b) => b.id !== effectiveSelectedBindingId);
    if (remaining.length > 0) {
      setSelectedBindingId(remaining[0].id);
      setIsCreating(false);
      setDraft(bindingToDraft(remaining[0]));
    } else {
      startCreateMode();
    }
  }

  function updateDraft<K extends keyof BindingDraft>(key: K, value: BindingDraft[K]): void {
    // Transition from view mode to edit mode on first change
    if (!creating && selectedBinding && !selectedBindingId) {
      setSelectedBindingId(selectedBinding.id);
      setDraft({ ...bindingToDraft(selectedBinding), [key]: value });
      setIsCreating(false);
      return;
    }
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleSelectBinding(binding: ClaudeExtensionBinding): void {
    setIsCreating(false);
    setSelectedBindingId(binding.id);
    setDraft(bindingToDraft(binding));
  }

  function runBindingAction(target: ClaudeExtensionActionTarget, action: 'apply' | 'reset'): void {
    if (!effectiveSelectedBindingId) return;
    if (action === 'apply') {
      applyBinding.mutate({ id: effectiveSelectedBindingId, target });
    } else {
      resetBinding.mutate({ id: effectiveSelectedBindingId, target });
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <ClaudeExtensionLeftPanel
        bindings={bindings}
        selectedBindingId={effectiveSelectedBindingId}
        creating={creating}
        draft={currentDraft}
        profiles={profiles}
        hosts={hosts}
        selectedProfile={selectedProfile}
        selectedHost={selectedHost}
        canPersist={canPersist}
        isSaving={isSaving}
        isDeleting={deleteBinding.isPending}
        onDraftChange={updateDraft}
        onSave={() => void handleSave()}
        onResetForm={startCreateMode}
        onDelete={() => void handleDelete()}
        onSelectBinding={handleSelectBinding}
        onNew={startCreateMode}
      />

      <ClaudeExtensionContentPanel
        selectedBinding={selectedBinding}
        selectedProfile={selectedProfile}
        selectedHost={selectedHost}
        creating={creating}
        draft={currentDraft}
        setup={setupQuery.data}
        sharedStatus={statusQuery.data?.sharedSettings}
        ideStatus={statusQuery.data?.ideSettings}
        activeError={activeError}
        isVerifying={statusQuery.isFetching}
        onVerify={() => void statusQuery.refetch()}
        isBusyShared={isBusyShared}
        isBusyIde={isBusyIde}
        isApplyingAll={isApplyingAll}
        isResettingAll={isResettingAll}
        onApplyShared={() => runBindingAction('shared', 'apply')}
        onResetShared={() => runBindingAction('shared', 'reset')}
        onApplyIde={() => runBindingAction('ide', 'apply')}
        onResetIde={() => runBindingAction('ide', 'reset')}
        onApplyAll={() => runBindingAction('all', 'apply')}
        onResetAll={() => runBindingAction('all', 'reset')}
      />
    </div>
  );
}
