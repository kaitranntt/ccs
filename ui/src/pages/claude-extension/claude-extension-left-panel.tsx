/**
 * ClaudeExtensionLeftPanel — Sidebar with binding editor form and saved binding list.
 *
 * Fixed-width left panel containing:
 * - Page identity strip (icon, title, subtitle, count badge, host badge, New button)
 * - BindingEditorSection (form fields + save/delete actions)
 * - BindingListSection (selectable saved bindings)
 *
 * Pure presentational — all state and callbacks come from props.
 */
import { Plus, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type {
  ClaudeExtensionBinding,
  ClaudeExtensionProfileOption,
  ClaudeExtensionHostOption,
} from '@/hooks/use-claude-extension';
import type { BindingDraft } from './lib/claude-extension-draft-utils';
import { BindingEditorSection } from './sections/binding-editor-section';
import { BindingListSection } from './sections/binding-list-section';

interface ClaudeExtensionLeftPanelProps {
  // Identity
  bindings: ClaudeExtensionBinding[];
  selectedBindingId: string | null;
  creating: boolean;
  draft: BindingDraft;
  profiles: ClaudeExtensionProfileOption[];
  hosts: ClaudeExtensionHostOption[];
  selectedProfile: ClaudeExtensionProfileOption | undefined;
  selectedHost: ClaudeExtensionHostOption | undefined;

  // Editor state
  canPersist: boolean;
  isSaving: boolean;
  isDeleting: boolean;

  // Callbacks
  onDraftChange: <K extends keyof BindingDraft>(key: K, value: BindingDraft[K]) => void;
  onSave: () => void;
  onResetForm: () => void;
  onDelete: () => void;
  onSelectBinding: (binding: ClaudeExtensionBinding) => void;
  onNew: () => void;
}

export function ClaudeExtensionLeftPanel({
  bindings,
  selectedBindingId,
  creating,
  draft,
  profiles,
  hosts,
  selectedProfile,
  selectedHost,
  canPersist,
  isSaving,
  isDeleting,
  onDraftChange,
  onSave,
  onResetForm,
  onDelete,
  onSelectBinding,
  onNew,
}: ClaudeExtensionLeftPanelProps) {
  const { t } = useTranslation();

  const bindingCountLabel = `${bindings.length} saved`;

  return (
    <div className="flex w-[348px] shrink-0 flex-col border-r bg-muted/30 xl:w-[372px]">
      {/* Identity strip */}
      <div className="border-b bg-background p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="rounded-lg border bg-muted/40 p-2">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="font-semibold">{t('claudeExtensionPage.title')}</h1>
                <p className="text-xs text-muted-foreground">
                  {t('claudeExtensionPage.savedBindingsSubtitle', {
                    defaultValue: 'Saved IDE bindings for CCS profiles',
                  })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{bindingCountLabel}</Badge>
              {selectedHost ? <Badge variant="outline">{selectedHost.label}</Badge> : null}
            </div>
          </div>
          <Button size="sm" onClick={onNew} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            {t('claudeExtensionPage.new', { defaultValue: 'New' })}
          </Button>
        </div>
      </div>

      {/* Scrollable body: editor + list */}
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-5">
          <BindingEditorSection
            creating={creating}
            draft={draft}
            profiles={profiles}
            hosts={hosts}
            selectedProfile={selectedProfile}
            selectedHost={selectedHost}
            canPersist={canPersist}
            isSaving={isSaving}
            isDeleting={isDeleting}
            onDraftChange={onDraftChange}
            onSave={onSave}
            onResetForm={onResetForm}
            onDelete={onDelete}
          />

          <BindingListSection
            bindings={bindings}
            selectedBindingId={selectedBindingId}
            creating={creating}
            onSelect={onSelectBinding}
          />
        </div>
      </ScrollArea>
    </div>
  );
}
