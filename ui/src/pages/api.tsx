import { type ChangeEvent, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  Search,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Server,
  FileJson,
  RefreshCw,
  Copy,
  Download,
  Upload,
} from 'lucide-react';
import { ProfileEditor } from '@/components/profile-editor';
import { ProfileCreateDialog } from '@/components/profiles/profile-create-dialog';
import { OpenRouterBanner } from '@/components/profiles/openrouter-banner';
import { OpenRouterQuickStart } from '@/components/profiles/openrouter-quick-start';
import { OpenRouterPromoCard } from '@/components/profiles/openrouter-promo-card';
import { AlibabaCodingPlanPromoCard } from '@/components/profiles/alibaba-coding-plan-promo-card';
import { CcsBarBanner } from '@/components/profiles/ccs-bar-banner';
import { CcsBarPromoCard } from '@/components/profiles/ccs-bar-promo-card';
import {
  useProfiles,
  useDeleteProfile,
  useDiscoverProfileOrphans,
  useRegisterProfileOrphans,
  useCopyProfile,
  useExportProfile,
  useImportProfile,
} from '@/hooks/use-profiles';
import { useOpenRouterModels } from '@/hooks/use-openrouter-models';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import type { ApiProfileExportBundle, Profile } from '@/lib/api-client';
import type { ProviderPreset } from '@/lib/provider-presets';
import { cn } from '@/lib/utils';
import { CopyButton } from '@/components/ui/copy-button';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

// CCS Bar is installed via the `ccs bar install` CLI command, not from the
// dashboard. The promo CTA therefore opens the user-facing docs page where the
// install/launch steps live, rather than triggering an in-app action.
const CCS_BAR_DOCS_URL = 'https://github.com/kaitranntt/ccs/blob/main/docs/ccs-bar.md';

function openCcsBarDocs() {
  window.open(CCS_BAR_DOCS_URL, '_blank', 'noopener,noreferrer');
}

export function ApiPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useProfiles();
  const deleteMutation = useDeleteProfile();
  const discoverOrphansMutation = useDiscoverProfileOrphans();
  const registerOrphansMutation = useRegisterProfileOrphans();
  const copyProfileMutation = useCopyProfile();
  const exportProfileMutation = useExportProfile();
  const importProfileMutation = useImportProfile();
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateDialogOpen, setCreateDialogOpen] = useState(false);
  const [createMode, setCreateMode] = useState<ProviderPreset['id'] | 'normal'>('normal');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editorHasChanges, setEditorHasChanges] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  useOpenRouterModels();
  const profiles = useMemo(() => data?.profiles || [], [data?.profiles]);
  const filteredProfiles = useMemo(
    () => profiles.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [profiles, searchQuery]
  );
  const selectedProfileData = selectedProfile
    ? profiles.find((p) => p.name === selectedProfile)
    : null;

  const switchToProfile = (name: string) => {
    if (editorHasChanges && selectedProfile !== name) {
      setPendingSwitch(name);
    } else {
      setSelectedProfile(name);
    }
  };

  const handleDelete = (name: string) => {
    deleteMutation.mutate(name, {
      onSuccess: () => {
        if (selectedProfile === name) {
          setSelectedProfile(null);
          setEditorHasChanges(false);
          setPendingSwitch(null);
        }
        setDeleteConfirm(null);
      },
    });
  };

  const handleCreateSuccess = (name: string) => {
    setCreateDialogOpen(false);
    switchToProfile(name);
  };
  const handleProfileSelect = (name: string) => {
    switchToProfile(name);
  };

  const triggerDownload = (filename: string, bundle: ApiProfileExportBundle) => {
    const content = JSON.stringify(bundle, null, 2) + '\n';
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const handleDiscoverOrphans = async () => {
    try {
      const result = await discoverOrphansMutation.mutateAsync();
      if (result.orphans.length === 0) {
        toast.success(t('apiProfiles.noOrphansFound'));
        return;
      }

      const validCount = result.orphans.filter((orphan) => orphan.validation.valid).length;
      const shouldRegister = window.confirm(
        t('apiProfiles.confirmRegisterOrphans', {
          total: result.orphans.length,
          valid: validCount,
        })
      );

      if (!shouldRegister) return;

      const registration = await registerOrphansMutation.mutateAsync({});
      const skippedMessage =
        registration.skipped.length > 0
          ? t('apiProfiles.registeredWithSkipped', { count: registration.skipped.length })
          : '';
      toast.success(
        t('apiProfiles.registeredProfiles', { count: registration.registered.length }) +
          skippedMessage
      );
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleCopySelectedProfile = async () => {
    if (!selectedProfileData) return;
    const destinationInput = window.prompt(
      t('apiProfiles.copyPrompt', { name: selectedProfileData.name }),
      `${selectedProfileData.name}-copy`
    );
    if (!destinationInput) return;
    const destination = destinationInput.trim();
    if (!destination) {
      toast.error(t('apiProfiles.destinationEmpty'));
      return;
    }

    try {
      const result = await copyProfileMutation.mutateAsync({
        name: selectedProfileData.name,
        data: { destination },
      });
      switchToProfile(destination);
      if (result.warnings && result.warnings.length > 0) {
        toast.info(result.warnings.join('\n'));
      }
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleExportSelectedProfile = async () => {
    if (!selectedProfileData) return;
    try {
      const result = await exportProfileMutation.mutateAsync({ name: selectedProfileData.name });
      triggerDownload(`${selectedProfileData.name}.ccs-profile.json`, result.bundle);
      if (result.redacted) {
        toast.info(t('apiProfiles.exportRedacted'));
      } else {
        toast.success(t('apiProfiles.exportDownloaded'));
      }
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleImportClick = () => {
    importFileInputRef.current?.click();
  };

  const handleImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const rawText = await file.text();
      const bundle = JSON.parse(rawText) as ApiProfileExportBundle;
      const result = await importProfileMutation.mutateAsync({ bundle });
      if (result.name) {
        switchToProfile(result.name);
      }
      if (result.warnings && result.warnings.length > 0) {
        toast.info(result.warnings.join('\n'));
      }
    } catch (error) {
      toast.error((error as Error).message || t('apiProfiles.importFailed'));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <OpenRouterBanner onCreateClick={() => setCreateDialogOpen(true)} />
      <CcsBarBanner onInstallClick={() => openCcsBarDocs()} />
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="w-80 border-r flex flex-col bg-muted/30">
          <div className="p-4 border-b bg-background">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Server className="w-5 h-5 text-primary" />
                <div className="min-w-0">
                  <h1 className="font-semibold">{t('apiProfiles.sidebarTitle')}</h1>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleDiscoverOrphans()}
                  disabled={discoverOrphansMutation.isPending || registerOrphansMutation.isPending}
                  aria-label={t('apiProfiles.discoverOrphans')}
                  title={t('apiProfiles.discoverOrphans')}
                >
                  <RefreshCw
                    className={`w-4 h-4 ${discoverOrphansMutation.isPending ? 'animate-spin' : ''}`}
                  />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleImportClick}
                  disabled={importProfileMutation.isPending}
                  aria-label={t('apiProfiles.importProfileBundle')}
                  title={t('apiProfiles.importProfileBundle')}
                >
                  <Upload className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setCreateDialogOpen(true);
                  }}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {t('apiProfiles.new')}
                </Button>
              </div>
            </div>

            <p className="mb-3 text-xs leading-4 text-muted-foreground">
              {t('apiProfiles.sidebarSubtitle')}
            </p>

            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('apiProfiles.searchPlaceholder')}
                className="pl-8 h-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            {isLoading ? (
              <div className="p-4 text-sm text-muted-foreground">
                {t('apiProfiles.loadingProfiles')}
              </div>
            ) : isError ? (
              <div className="p-4 text-center">
                <div className="space-y-3 py-8">
                  <AlertCircle className="w-12 h-12 mx-auto text-destructive/50" />
                  <div>
                    <p className="text-sm font-medium">{t('apiProfiles.failedLoadTitle')}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('apiProfiles.failedLoadDesc')}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => refetch()}>
                    <RefreshCw className="w-4 h-4 mr-1" />
                    {t('apiProfiles.retry')}
                  </Button>
                </div>
              </div>
            ) : filteredProfiles.length === 0 ? (
              <div className="p-4 text-center">
                {profiles.length === 0 ? (
                  <div className="space-y-3 py-8">
                    <FileJson className="w-12 h-12 mx-auto text-muted-foreground/50" />
                    <div>
                      <p className="text-sm font-medium">{t('apiProfiles.noProfilesYet')}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('apiProfiles.noProfilesDesc')}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setCreateDialogOpen(true);
                      }}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      {t('apiProfiles.createProfile')}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4">
                    {t('apiProfiles.noProfileMatch', { query: searchQuery })}
                  </p>
                )}
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredProfiles.map((profile) => (
                  <ProfileListItem
                    key={profile.name}
                    profile={profile}
                    isSelected={selectedProfile === profile.name}
                    onSelect={() => handleProfileSelect(profile.name)}
                    onDelete={() => setDeleteConfirm(profile.name)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>

          {profiles.length > 0 && (
            <div className="p-3 border-t bg-background text-xs text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>{t('apiProfiles.profileCount', { count: profiles.length })}</span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-green-600" />
                  {t('apiProfiles.configuredCount', {
                    count: profiles.filter((p) => p.configured).length,
                  })}
                </span>
              </div>
            </div>
          )}

          <OpenRouterPromoCard
            onCreateClick={() => {
              setCreateMode('openrouter');
              setCreateDialogOpen(true);
            }}
          />
          <AlibabaCodingPlanPromoCard
            onCreateClick={() => {
              setCreateMode('alibaba-coding-plan');
              setCreateDialogOpen(true);
            }}
          />
          <CcsBarPromoCard onInstallClick={() => openCcsBarDocs()} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col min-w-0 overflow-hidden">
          {selectedProfileData ? (
            <>
              <div className="px-4 py-2 border-b bg-background flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleCopySelectedProfile()}
                  disabled={copyProfileMutation.isPending}
                >
                  <Copy className="w-4 h-4 mr-1" />
                  Copy
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleExportSelectedProfile()}
                  disabled={exportProfileMutation.isPending}
                >
                  <Download className="w-4 h-4 mr-1" />
                  Export
                </Button>
              </div>
              <ProfileEditor
                key={selectedProfileData.name}
                profileName={selectedProfileData.name}
                profileTarget={selectedProfileData.target}
                onDelete={() => setDeleteConfirm(selectedProfileData.name)}
                onHasChangesUpdate={setEditorHasChanges}
              />
            </>
          ) : (
            <OpenRouterQuickStart
              hasProfiles={profiles.length > 0}
              profileCount={profiles.length}
              onCliproxyClick={() => {
                navigate('/cliproxy/ai-providers');
              }}
              onOpenRouterClick={() => {
                setCreateMode('openrouter');
                setCreateDialogOpen(true);
              }}
              onAlibabaCodingPlanClick={() => {
                setCreateMode('alibaba-coding-plan');
                setCreateDialogOpen(true);
              }}
              onOllamaClick={() => {
                setCreateMode('ollama');
                setCreateDialogOpen(true);
              }}
              onLlamacppClick={() => {
                setCreateMode('llamacpp');
                setCreateDialogOpen(true);
              }}
              onCustomClick={() => {
                setCreateMode('normal');
                setCreateDialogOpen(true);
              }}
            />
          )}
        </div>
      </div>

      <input
        ref={importFileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(event) => void handleImportFileChange(event)}
      />

      <ProfileCreateDialog
        open={isCreateDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={handleCreateSuccess}
        initialMode={createMode}
      />

      <ConfirmDialog
        open={!!deleteConfirm}
        title={t('apiProfiles.deleteProfileTitle')}
        description={t('apiProfiles.deleteProfileDesc', { name: deleteConfirm ?? '' })}
        confirmText={t('apiProfiles.delete')}
        variant="destructive"
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />

      <ConfirmDialog
        open={!!pendingSwitch}
        title={t('apiProfiles.unsavedChangesTitle')}
        description={t('apiProfiles.unsavedChangesDesc', {
          current: selectedProfile ?? '',
          next: pendingSwitch ?? '',
        })}
        confirmText={t('apiProfiles.discardSwitch')}
        variant="destructive"
        onConfirm={() => {
          setEditorHasChanges(false);
          setSelectedProfile(pendingSwitch);
          setPendingSwitch(null);
        }}
        onCancel={() => setPendingSwitch(null)}
      />
    </div>
  );
}

function ProfileListItem({
  profile,
  isSelected,
  onSelect,
  onDelete,
}: {
  profile: Profile;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-3 py-2.5 rounded-md cursor-pointer transition-colors',
        isSelected
          ? 'bg-primary/10 border border-primary/20'
          : 'hover:bg-muted border border-transparent'
      )}
      onClick={onSelect}
    >
      {profile.configured ? (
        <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
      ) : (
        <AlertCircle className="w-4 h-4 text-yellow-600 shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="font-medium text-sm truncate">{profile.name}</div>
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 uppercase">
            {profile.target || 'claude'}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="text-xs text-muted-foreground truncate flex-1">
            {profile.settingsPath}
          </div>
          <CopyButton
            value={profile.settingsPath}
            size="icon"
            className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
          />
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 className="w-3.5 h-3.5 text-destructive" />
      </Button>
    </div>
  );
}
