import { Loader2, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  ClaudeExtensionBinding,
  ClaudeExtensionHostOption,
  ClaudeExtensionProfileOption,
} from '@/hooks/use-claude-extension';
import type { BindingDraft } from './binding-utils';
import { BindingListItem } from './extension-ui-primitives';

export function BindingEditorSidebar({
  bindings,
  profiles,
  hosts,
  selectedHost,
  selectedProfile,
  creating,
  effectiveSelectedBindingId,
  currentDraft,
  canPersist,
  isSaving,
  isDeleting,
  onStartCreateMode,
  onUpdateDraft,
  onSave,
  onDelete,
  onSelectBinding,
}: {
  bindings: ClaudeExtensionBinding[];
  profiles: ClaudeExtensionProfileOption[];
  hosts: ClaudeExtensionHostOption[];
  selectedHost?: ClaudeExtensionHostOption;
  selectedProfile?: ClaudeExtensionProfileOption;
  creating: boolean;
  effectiveSelectedBindingId: string | null;
  currentDraft: BindingDraft;
  canPersist: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  onStartCreateMode: () => void;
  onUpdateDraft: <K extends keyof BindingDraft>(key: K, value: BindingDraft[K]) => void;
  onSave: () => Promise<void>;
  onDelete: () => Promise<void>;
  onSelectBinding: (binding: ClaudeExtensionBinding) => void;
}) {
  const { t } = useTranslation();
  const bindingCountLabel = `${bindings.length} saved`;

  return (
    <div className="flex w-[348px] shrink-0 flex-col border-r bg-muted/30 xl:w-[372px]">
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
          <Button size="sm" onClick={onStartCreateMode} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            {t('claudeExtensionPage.new', { defaultValue: 'New' })}
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-5">
          <Card className="border-border/60 bg-card/80">
            <CardHeader>
              <CardTitle className="text-base">
                {creating
                  ? t('claudeExtensionPage.createBinding', { defaultValue: 'Create binding' })
                  : t('claudeExtensionPage.bindingEditor', { defaultValue: 'Binding editor' })}
              </CardTitle>
              <CardDescription>
                {t('claudeExtensionPage.bindingEditorDescription', {
                  defaultValue:
                    'Save a profile + IDE path once, then apply or reset it from the dashboard.',
                })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-medium">
                  {t('settingsPage.thinkingSection.bindingName')}
                </div>
                <Input
                  value={currentDraft.name}
                  onChange={(event) => onUpdateDraft('name', event.target.value)}
                  placeholder={t('claudeExtensionPage.bindingNamePlaceholder', {
                    defaultValue: 'VS Code · work profile',
                  })}
                />
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">
                  {t('claudeExtensionPage.ccsProfile', { defaultValue: 'CCS profile' })}
                </div>
                <Select
                  value={currentDraft.profile}
                  onValueChange={(value) => onUpdateDraft('profile', value)}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t('claudeExtensionPage.selectProfile', {
                        defaultValue: 'Select a profile',
                      })}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((profile) => (
                      <SelectItem key={profile.name} value={profile.name}>
                        {profile.label} ({profile.profileType})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {selectedProfile?.description ||
                    t('claudeExtensionPage.chooseProfileHint', {
                      defaultValue: 'Choose which CCS profile the IDE should inherit.',
                    })}
                </p>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">
                  {t('settingsPage.thinkingSection.ideHost')}
                </div>
                <Select
                  value={currentDraft.host}
                  onValueChange={(value) => onUpdateDraft('host', value as BindingDraft['host'])}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t('claudeExtensionPage.selectHost', {
                        defaultValue: 'Select a host',
                      })}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {hosts.map((host) => (
                      <SelectItem key={host.id} value={host.id}>
                        {host.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">
                  {t('settingsPage.thinkingSection.ideSettingsPath')}
                </div>
                <Input
                  value={currentDraft.ideSettingsPath}
                  onChange={(event) => onUpdateDraft('ideSettingsPath', event.target.value)}
                  placeholder={
                    selectedHost?.defaultSettingsPath ||
                    t('claudeExtensionPage.ideSettingsPathPlaceholder', {
                      defaultValue: 'Leave blank for the default user settings path',
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {t('claudeExtensionPage.ideSettingsPathHint', {
                    defaultValue: 'Leave blank to use the default user settings path for',
                  })}{' '}
                  {selectedHost?.label || 'this IDE'}.
                </p>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">{t('settingsPage.thinkingSection.notes')}</div>
                <Input
                  value={currentDraft.notes}
                  onChange={(event) => onUpdateDraft('notes', event.target.value)}
                  placeholder={t('claudeExtensionPage.notesPlaceholder', {
                    defaultValue: 'Optional reminder for this machine or workspace',
                  })}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  className="flex-1 gap-1.5"
                  onClick={() => void onSave()}
                  disabled={!canPersist || isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  {creating
                    ? t('claudeExtensionPage.create', { defaultValue: 'Create' })
                    : t('claudeExtensionPage.save', { defaultValue: 'Save' })}
                </Button>
                <Button variant="outline" onClick={onStartCreateMode}>
                  {t('claudeExtensionPage.resetForm', { defaultValue: 'Reset form' })}
                </Button>
              </div>

              {!creating ? (
                <Button
                  variant="outline"
                  className="w-full gap-1.5 text-destructive hover:text-destructive"
                  onClick={() => void onDelete()}
                  disabled={isDeleting}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t('claudeExtensionPage.deleteBinding', { defaultValue: 'Delete binding' })}
                </Button>
              ) : null}
            </CardContent>
          </Card>

          <div className="space-y-2">
            <div className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('claudeExtensionPage.savedBindings', { defaultValue: 'Saved bindings' })}
            </div>
            <div className="space-y-2">
              {bindings.length > 0 ? (
                bindings.map((binding) => (
                  <BindingListItem
                    key={binding.id}
                    binding={binding}
                    isSelected={binding.id === effectiveSelectedBindingId && !creating}
                    onSelect={() => onSelectBinding(binding)}
                  />
                ))
              ) : (
                <Card className="border-dashed border-border/60 bg-card/60">
                  <CardContent className="pt-6 text-sm text-muted-foreground">
                    {t('claudeExtensionPage.emptyBindings', {
                      defaultValue:
                        'No saved bindings yet. Create one to manage apply, reset, and drift checks from the dashboard.',
                    })}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
