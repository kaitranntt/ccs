/**
 * BindingEditorSection — Left-panel form for creating and editing bindings.
 *
 * Renders the name, profile, host, IDE path, and notes fields plus
 * the save / reset-form / delete actions. Purely presentational —
 * all state and handlers come from props.
 */
import { Loader2, Save, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  ClaudeExtensionProfileOption,
  ClaudeExtensionHostOption,
} from '@/hooks/use-claude-extension';
import type { BindingDraft } from '../lib/claude-extension-draft-utils';

interface BindingEditorSectionProps {
  creating: boolean;
  draft: BindingDraft;
  profiles: ClaudeExtensionProfileOption[];
  hosts: ClaudeExtensionHostOption[];
  selectedProfile: ClaudeExtensionProfileOption | undefined;
  selectedHost: ClaudeExtensionHostOption | undefined;
  canPersist: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  onDraftChange: <K extends keyof BindingDraft>(key: K, value: BindingDraft[K]) => void;
  onSave: () => void;
  onResetForm: () => void;
  onDelete: () => void;
}

export function BindingEditorSection({
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
}: BindingEditorSectionProps) {
  const { t } = useTranslation();

  return (
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
        {/* Name */}
        <div className="space-y-2">
          <div className="text-sm font-medium">{t('settingsPage.thinkingSection.bindingName')}</div>
          <Input
            value={draft.name}
            onChange={(e) => onDraftChange('name', e.target.value)}
            placeholder={t('claudeExtensionPage.bindingNamePlaceholder', {
              defaultValue: 'VS Code · work profile',
            })}
          />
        </div>

        {/* CCS Profile */}
        <div className="space-y-2">
          <div className="text-sm font-medium">
            {t('claudeExtensionPage.ccsProfile', { defaultValue: 'CCS profile' })}
          </div>
          <Select value={draft.profile} onValueChange={(v) => onDraftChange('profile', v)}>
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

        {/* IDE Host */}
        <div className="space-y-2">
          <div className="text-sm font-medium">{t('settingsPage.thinkingSection.ideHost')}</div>
          <Select
            value={draft.host}
            onValueChange={(v) => onDraftChange('host', v as BindingDraft['host'])}
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

        {/* IDE Settings Path */}
        <div className="space-y-2">
          <div className="text-sm font-medium">
            {t('settingsPage.thinkingSection.ideSettingsPath')}
          </div>
          <Input
            value={draft.ideSettingsPath}
            onChange={(e) => onDraftChange('ideSettingsPath', e.target.value)}
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

        {/* Notes */}
        <div className="space-y-2">
          <div className="text-sm font-medium">{t('settingsPage.thinkingSection.notes')}</div>
          <Input
            value={draft.notes}
            onChange={(e) => onDraftChange('notes', e.target.value)}
            placeholder={t('claudeExtensionPage.notesPlaceholder', {
              defaultValue: 'Optional reminder for this machine or workspace',
            })}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button className="flex-1 gap-1.5" onClick={onSave} disabled={!canPersist || isSaving}>
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {creating
              ? t('claudeExtensionPage.create', { defaultValue: 'Create' })
              : t('claudeExtensionPage.save', { defaultValue: 'Save' })}
          </Button>
          <Button variant="outline" onClick={onResetForm}>
            {t('claudeExtensionPage.resetForm', { defaultValue: 'Reset form' })}
          </Button>
        </div>

        {/* Delete — only shown when editing an existing binding */}
        {!creating ? (
          <Button
            variant="outline"
            className="w-full gap-1.5 text-destructive hover:text-destructive"
            onClick={onDelete}
            disabled={isDeleting}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t('claudeExtensionPage.deleteBinding', { defaultValue: 'Delete binding' })}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
