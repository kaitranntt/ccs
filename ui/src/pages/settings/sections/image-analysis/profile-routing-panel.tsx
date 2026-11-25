import { ChevronDown, ChevronUp, GitBranch, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ImageSectionPanel } from './image-section-panel';
import { type MappingDraft, NO_BACKEND, getInsetPanelClass } from './utils';

export function ProfileRoutingPanel({
  showProfileRouting,
  onToggleShow,
  mappingDrafts,
  profileNames,
  configuredBackendIds,
  saving,
  onAddMapping,
  onUpdateMappingRow,
  onCommitMappingDrafts,
}: {
  showProfileRouting: boolean;
  onToggleShow: () => void;
  mappingDrafts: MappingDraft[];
  profileNames: string[];
  configuredBackendIds: string[];
  saving: boolean;
  onAddMapping: () => void;
  onUpdateMappingRow: (rowId: string, patch: Partial<MappingDraft>) => void;
  onCommitMappingDrafts: (nextMappingDrafts: MappingDraft[]) => Promise<void>;
}) {
  const { t } = useTranslation();

  return (
    <ImageSectionPanel
      tone="slate"
      eyebrow="Override lab"
      title="Profile routing"
      description="Only for explicit route overrides."
      icon={<GitBranch className="h-4 w-4" />}
      meta={
        <Badge
          variant="outline"
          className="border-amber-500/25 bg-amber-500/10 text-[10px] text-amber-800 dark:text-amber-200"
        >
          Advanced
        </Badge>
      }
      action={
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onToggleShow}>
            {showProfileRouting ? (
              <ChevronUp className="mr-1 h-4 w-4" />
            ) : (
              <ChevronDown className="mr-1 h-4 w-4" />
            )}
            {showProfileRouting
              ? t('common.hide', { defaultValue: 'Hide' })
              : t('common.show', { defaultValue: 'Show' })}
          </Button>
          {showProfileRouting && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAddMapping}
              disabled={configuredBackendIds.length === 0 || saving}
            >
              <Plus className="mr-1 h-4 w-4" />
              {t('imageAnalysisSection.addMapping', {
                defaultValue: 'Add mapping',
              })}
            </Button>
          )}
        </div>
      }
      className="border-dashed"
    >
      <datalist id="image-profile-suggestions">
        {profileNames.map((profileName) => (
          <option key={profileName} value={profileName} />
        ))}
      </datalist>

      {showProfileRouting ? (
        <div className="space-y-2">
          {mappingDrafts.length === 0 ? (
            <div
              className={cn(
                'rounded-[18px] border border-dashed px-3.5 py-3.5 text-sm text-muted-foreground',
                getInsetPanelClass('slate')
              )}
            >
              No explicit overrides saved.
            </div>
          ) : (
            <div className="space-y-2">
              {mappingDrafts.map((row) => (
                <div
                  key={row.id}
                  className="rounded-[18px] border border-slate-400/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(248,250,252,0.52))] p-3 shadow-sm dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.84),rgba(15,23,42,0.56))]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[11px] leading-4 text-muted-foreground">
                      <span>
                        {t('imageAnalysisSection.directOverride', {
                          defaultValue: 'Direct override',
                        })}
                      </span>
                      {!(row.profileName.trim() && row.backendId) && (
                        <Badge variant="outline" className="text-[10px]">
                          Draft
                        </Badge>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={saving}
                      onClick={() => {
                        const nextMappingDrafts = mappingDrafts.filter(
                          (entry) => entry.id !== row.id
                        );
                        void onCommitMappingDrafts(nextMappingDrafts);
                      }}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      {t('common.remove', { defaultValue: 'Remove' })}
                    </Button>
                  </div>

                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Input
                      value={row.profileName}
                      list="image-profile-suggestions"
                      disabled={saving}
                      placeholder={t('imageAnalysisSection.profileOrVariantName', {
                        defaultValue: 'Profile or variant name',
                      })}
                      className="h-10 border-slate-400/15 bg-background/88 text-base"
                      onChange={(event) => {
                        onUpdateMappingRow(row.id, { profileName: event.target.value });
                      }}
                      onBlur={(event) => {
                        const nextMappingDrafts = mappingDrafts.map((entry) =>
                          entry.id === row.id
                            ? { ...entry, profileName: event.currentTarget.value.trim() }
                            : entry
                        );
                        void onCommitMappingDrafts(nextMappingDrafts);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.currentTarget.blur();
                        }
                      }}
                    />
                    <Select
                      value={row.backendId || NO_BACKEND}
                      disabled={saving}
                      onValueChange={(value) => {
                        const nextMappingDrafts = mappingDrafts.map((entry) =>
                          entry.id === row.id
                            ? { ...entry, backendId: value === NO_BACKEND ? '' : value }
                            : entry
                        );
                        void onCommitMappingDrafts(nextMappingDrafts);
                      }}
                    >
                      <SelectTrigger className="h-10 border-slate-400/15 bg-background/88">
                        <SelectValue
                          placeholder={t('settingsPage.thinkingSection.configureModelFirst')}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {configuredBackendIds.length === 0 ? (
                          <SelectItem value={NO_BACKEND}>
                            {t('settingsPage.thinkingSection.configureModelFirst')}
                          </SelectItem>
                        ) : (
                          configuredBackendIds.map((backendId) => (
                            <SelectItem key={backendId} value={backendId}>
                              {backendId}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div
          className={cn(
            'rounded-[18px] border border-dashed px-3.5 py-3 text-sm text-muted-foreground',
            getInsetPanelClass('slate')
          )}
        >
          Hidden by default.
          {mappingDrafts.length > 0
            ? ` ${mappingDrafts.length} override${mappingDrafts.length === 1 ? '' : 's'} saved.`
            : ' No overrides saved.'}
        </div>
      )}
    </ImageSectionPanel>
  );
}
