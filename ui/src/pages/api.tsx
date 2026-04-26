/**
 * API Profiles Page
 * Design system: PageShell + PageHeader + ConfigLayout
 * Archetype: Multi-entity Config — identity strip: PageHeader (1c)
 *
 * Left rail : ApiProfileListPane  (profile list, search, toolbar, promo cards)
 * Form slot : ApiProfileViewPane  (profile editor or empty state — no FormPane
 *             wrapper; ProfileEditor owns its internal scroll — double-scroll
 *             lesson from copilot PR #1093)
 * JSON pane : omitted — no raw-config view for API profiles
 */

import { type ChangeEvent, useMemo, useRef, useState } from 'react';
import { Server } from 'lucide-react';
import { PageShell } from '@/components/page-shell/page-shell';
import { PageHeader } from '@/components/page-shell/page-header';
import { ConfigLayout } from '@/components/config-layout/config-layout';
import { ApiProfileListPane } from '@/components/profiles/api-profile-list-pane';
import { ApiProfileViewPane } from '@/components/profiles/api-profile-view-pane';
import { ProfileCreateDialog } from '@/components/profiles/profile-create-dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Badge } from '@/components/ui/badge';
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
import type { ApiProfileExportBundle } from '@/lib/api-client';
import type { ProviderPreset } from '@/lib/provider-presets';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ApiPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Data
  const { data, isLoading, isError, refetch } = useProfiles();
  const deleteMutation = useDeleteProfile();
  const discoverOrphansMutation = useDiscoverProfileOrphans();
  const registerOrphansMutation = useRegisterProfileOrphans();
  const copyProfileMutation = useCopyProfile();
  const exportProfileMutation = useExportProfile();
  const importProfileMutation = useImportProfile();
  useOpenRouterModels();

  // UI state
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateDialogOpen, setCreateDialogOpen] = useState(false);
  const [createMode, setCreateMode] = useState<ProviderPreset['id'] | 'normal'>('normal');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editorHasChanges, setEditorHasChanges] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);

  const importFileInputRef = useRef<HTMLInputElement>(null);

  // Derived
  const profiles = useMemo(() => data?.profiles ?? [], [data?.profiles]);
  const filteredProfiles = useMemo(
    () => profiles.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [profiles, searchQuery]
  );
  const selectedProfileData = selectedProfile
    ? (profiles.find((p) => p.name === selectedProfile) ?? null)
    : null;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

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
      const validCount = result.orphans.filter((o) => o.validation.valid).length;
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

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const configuredCount = profiles.filter((p) => p.configured).length;

  const headerStatus =
    profiles.length > 0 ? (
      <Badge variant="secondary" className="text-xs font-normal">
        {configuredCount}/{profiles.length} configured
      </Badge>
    ) : null;

  return (
    <PageShell>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" aria-hidden="true" />
            {t('apiProfiles.sidebarTitle')}
          </span>
        }
        description={t('apiProfiles.sidebarSubtitle')}
        status={headerStatus}
      />

      <ConfigLayout
        left={
          <ApiProfileListPane
            profiles={profiles}
            filteredProfiles={filteredProfiles}
            isLoading={isLoading}
            isError={isError}
            searchQuery={searchQuery}
            selectedProfile={selectedProfile}
            isDiscoverPending={discoverOrphansMutation.isPending}
            isRegisterPending={registerOrphansMutation.isPending}
            isImportPending={importProfileMutation.isPending}
            importFileInputRef={importFileInputRef}
            onSearchChange={setSearchQuery}
            onProfileSelect={switchToProfile}
            onDeleteRequest={setDeleteConfirm}
            onDiscoverOrphans={() => void handleDiscoverOrphans()}
            onImportClick={handleImportClick}
            onImportFileChange={(e) => void handleImportFileChange(e)}
            onCreateClick={() => setCreateDialogOpen(true)}
            onCreateOpenRouter={() => {
              setCreateMode('openrouter');
              setCreateDialogOpen(true);
            }}
            onCreateAlibaba={() => {
              setCreateMode('alibaba-coding-plan');
              setCreateDialogOpen(true);
            }}
            onRetry={() => void refetch()}
          />
        }
        form={
          <ApiProfileViewPane
            selectedProfileName={selectedProfile}
            selectedProfileTarget={selectedProfileData?.target}
            profileCount={profiles.length}
            isCopyPending={copyProfileMutation.isPending}
            isExportPending={exportProfileMutation.isPending}
            onCopyProfile={() => void handleCopySelectedProfile()}
            onExportProfile={() => void handleExportSelectedProfile()}
            onDeleteProfile={() =>
              selectedProfileData && setDeleteConfirm(selectedProfileData.name)
            }
            onHasChangesUpdate={setEditorHasChanges}
            onCliproxyClick={() => navigate('/cliproxy/ai-providers')}
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
        }
      />

      {/* Dialogs */}
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
    </PageShell>
  );
}
