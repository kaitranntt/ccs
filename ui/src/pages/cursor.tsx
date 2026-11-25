/**
 * Cursor Page
 * Dedicated dashboard surface for Cursor integration.
 */

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Code2, Loader2, RefreshCw, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useCursor } from '@/hooks/use-cursor';
import { isApiConflictError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RawEditorSection } from '@/components/copilot/config-form/raw-editor-section';
import { CursorConfigTabs } from '@/components/cursor/cursor-config-tabs';
import { CursorManualAuthDialog } from '@/components/cursor/cursor-manual-auth-dialog';
import { CursorSidebar } from '@/components/cursor/cursor-sidebar';
import {
  type CursorConfigDraft,
  buildConfigDraft,
  buildProbeSnapshotKey,
  parseRawSettings,
  resolveCursorPresetPatch,
} from '@/components/cursor/cursor-utils';

export function CursorPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    status,
    statusLoading,
    refetchStatus,
    config,
    refetchConfig,
    updateConfigAsync,
    isUpdatingConfig,
    models,
    modelsLoading,
    currentModel,
    rawSettings,
    rawSettingsLoading,
    refetchRawSettings,
    saveRawSettingsAsync,
    isSavingRawSettings,
    autoDetectAuthAsync,
    isAutoDetectingAuth,
    importManualAuthAsync,
    isImportingManualAuth,
    startDaemonAsync,
    isStartingDaemon,
    stopDaemonAsync,
    isStoppingDaemon,
    runProbeAsync,
    isRunningProbe,
    probeResult,
    resetProbe,
  } = useCursor();

  const [configDraft, setConfigDraft] = useState<CursorConfigDraft>(() => buildConfigDraft());
  const [configDirty, setConfigDirty] = useState(false);
  const [rawConfigText, setRawConfigText] = useState<string>('{}');
  const [rawConfigDirty, setRawConfigDirty] = useState(false);
  const [manualAuthOpen, setManualAuthOpen] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [manualMachineId, setManualMachineId] = useState('');
  const [probeSnapshotKey, setProbeSnapshotKey] = useState<string | null>(() =>
    probeResult ? buildProbeSnapshotKey(status, config) : null
  );

  const pristineConfigDraft = buildConfigDraft(config);

  const effectivePort = configDirty ? configDraft.port : pristineConfigDraft.port;
  const effectiveAutoStart = configDirty ? configDraft.auto_start : pristineConfigDraft.auto_start;
  const effectiveGhostMode = configDirty ? configDraft.ghost_mode : pristineConfigDraft.ghost_mode;
  const effectiveModel = configDirty ? configDraft.model : pristineConfigDraft.model;
  const effectiveOpusModel = configDirty ? configDraft.opus_model : pristineConfigDraft.opus_model;
  const effectiveSonnetModel = configDirty
    ? configDraft.sonnet_model
    : pristineConfigDraft.sonnet_model;
  const effectiveHaikuModel = configDirty
    ? configDraft.haiku_model
    : pristineConfigDraft.haiku_model;
  const effectiveRawConfigText = rawConfigDirty
    ? rawConfigText
    : JSON.stringify(rawSettings?.settings ?? {}, null, 2);
  const rawSettingsReady = Boolean(rawSettings);
  const rawParseResult = useMemo(
    () => parseRawSettings(effectiveRawConfigText),
    [effectiveRawConfigText]
  );
  const isRawJsonValid = rawParseResult.isValid;
  const hasChanges = configDirty || rawConfigDirty;
  const canSave = !rawConfigDirty || (rawSettingsReady && isRawJsonValid);
  const currentProbeSnapshotKey = buildProbeSnapshotKey(status, config);
  const visibleProbeResult =
    probeResult &&
    !hasChanges &&
    probeSnapshotKey !== null &&
    probeSnapshotKey === currentProbeSnapshotKey
      ? probeResult
      : null;
  const orderedModels = useMemo(() => {
    const seen = new Set<string>();
    const sorted = [...models].sort((a, b) => a.name.localeCompare(b.name));
    const deduped = sorted.filter((model) => {
      if (seen.has(model.id)) return false;
      seen.add(model.id);
      return true;
    });

    if (effectiveModel && !sorted.some((model) => model.id === effectiveModel)) {
      return [
        {
          id: effectiveModel,
          name: effectiveModel,
          provider: 'custom',
        },
        ...deduped,
      ];
    }

    return deduped;
  }, [models, effectiveModel]);

  const updateConfigDraft = (updater: (draft: CursorConfigDraft) => CursorConfigDraft) => {
    setConfigDraft((previousDraft) => {
      const baseDraft = configDirty ? previousDraft : pristineConfigDraft;
      return updater(baseDraft);
    });
    setConfigDirty(true);
  };

  const clearProbeState = () => {
    resetProbe();
    setProbeSnapshotKey(null);
  };

  const resetConfigDraft = (nextConfig = config) => {
    setConfigDraft(buildConfigDraft(nextConfig));
    setConfigDirty(false);
  };

  const canStart = Boolean(status?.enabled && status?.authenticated && !status?.token_expired);
  const integrationBadge = useMemo(
    () =>
      status?.enabled ? (
        <Badge>{t('cursorPage.enabled')}</Badge>
      ) : (
        <Badge variant="secondary">{t('cursorPage.disabled')}</Badge>
      ),
    [status?.enabled, t]
  );

  const handleSaveConfig = async ({
    suppressSuccessToast = false,
  }: { suppressSuccessToast?: boolean } = {}) => {
    const parsedPort = Number(effectivePort);
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      toast.error(t('cursorPage.invalidPort'));
      return false;
    }
    if (!effectiveModel.trim()) {
      toast.error(t('cursorPage.defaultModelRequired'));
      return false;
    }

    try {
      await updateConfigAsync({
        port: parsedPort,
        auto_start: effectiveAutoStart,
        ghost_mode: effectiveGhostMode,
        model: effectiveModel,
        opus_model: effectiveOpusModel || undefined,
        sonnet_model: effectiveSonnetModel || undefined,
        haiku_model: effectiveHaikuModel || undefined,
      });
      setConfigDirty(false);
      setConfigDraft(
        buildConfigDraft({
          port: parsedPort,
          auto_start: effectiveAutoStart,
          ghost_mode: effectiveGhostMode,
          model: effectiveModel,
          opus_model: effectiveOpusModel || undefined,
          sonnet_model: effectiveSonnetModel || undefined,
          haiku_model: effectiveHaikuModel || undefined,
        })
      );
      clearProbeState();
      if (!suppressSuccessToast) {
        toast.success(t('cursorPage.savedConfig'));
      }
      return true;
    } catch (error) {
      toast.error((error as Error).message || t('cursorPage.failedSaveConfig'));
      return false;
    }
  };

  const applyPreset = (preset: 'codex53' | 'claude46' | 'gemini3') => {
    if (modelsLoading) {
      toast.error(t('cursorPage.modelsLoadingWait'));
      return;
    }

    if (models.length === 0) {
      toast.error(t('cursorPage.noModelsAvailable'));
      return;
    }

    const fallbackModel = effectiveModel || currentModel || models[0]?.id || 'gpt-5.3-codex';
    const patch = resolveCursorPresetPatch(preset, models, fallbackModel);
    updateConfigDraft((draft) => ({ ...draft, ...patch }));

    if (preset === 'codex53') {
      toast.success(t('cursorPage.appliedCodexPreset'));
    } else if (preset === 'claude46') {
      toast.success(t('cursorPage.appliedClaudePreset'));
    } else {
      toast.success(t('cursorPage.appliedGeminiPreset'));
    }
  };

  const handleToggleEnabled = async (enabled: boolean) => {
    try {
      await updateConfigAsync({ enabled });
      clearProbeState();
      toast.success(
        enabled ? t('cursorPage.integrationEnabled') : t('cursorPage.integrationDisabled')
      );
    } catch (error) {
      toast.error((error as Error).message || t('cursorPage.failedUpdateIntegration'));
    }
  };

  const handleAutoDetectAuth = async () => {
    try {
      await autoDetectAuthAsync();
      clearProbeState();
      toast.success(t('cursorPage.credentialsImported'));
    } catch (error) {
      toast.error((error as Error).message || t('cursorPage.autoDetectFailed'));
    }
  };

  const handleManualAuthImport = async () => {
    if (!manualToken.trim() || !manualMachineId.trim()) {
      toast.error(t('cursorPage.manualRequired'));
      return;
    }

    try {
      await importManualAuthAsync({
        accessToken: manualToken.trim(),
        machineId: manualMachineId.trim(),
      });
      clearProbeState();
      toast.success(t('cursorPage.credentialsImported'));
      setManualAuthOpen(false);
      setManualToken('');
      setManualMachineId('');
    } catch (error) {
      toast.error((error as Error).message || t('cursorPage.manualImportFailed'));
    }
  };

  const handleStartDaemon = async () => {
    try {
      const result = await startDaemonAsync();
      if (!result.success) {
        toast.error(result.error || t('cursorPage.failedStartDaemon'));
        return;
      }
      clearProbeState();
      toast.success(
        result.pid
          ? t('cursorPage.daemonStartedWithPid', { pid: result.pid })
          : t('cursorPage.daemonStarted')
      );
    } catch (error) {
      toast.error((error as Error).message || t('cursorPage.failedStartDaemon'));
    }
  };

  const handleStopDaemon = async () => {
    try {
      const result = await stopDaemonAsync();
      if (!result.success) {
        toast.error(result.error || t('cursorPage.failedStopDaemon'));
        return;
      }
      clearProbeState();
      toast.success(t('cursorPage.daemonStopped'));
    } catch (error) {
      toast.error((error as Error).message || t('cursorPage.failedStopDaemon'));
    }
  };

  const handleRunProbe = async () => {
    if (hasChanges) {
      toast.error(t('cursorPage.probeSaveFirst'));
      return;
    }

    try {
      const result = await runProbeAsync();
      const refreshedStatus = await refetchStatus();
      setProbeSnapshotKey(buildProbeSnapshotKey(refreshedStatus.data ?? status, config));
      if (result.ok) {
        toast.success(t('cursorPage.probeSucceeded'));
        return;
      }

      toast.error(result.message || t('cursorPage.probeFailed'));
    } catch (error) {
      toast.error((error as Error).message || t('cursorPage.probeFailed'));
    }
  };

  const handleSaveRawSettings = async ({
    suppressSuccessToast = false,
  }: { suppressSuccessToast?: boolean } = {}) => {
    if (!rawSettingsReady) {
      toast.error(t('cursorPage.rawLoading'));
      return false;
    }

    if (!rawParseResult.isValid || !rawParseResult.settings) {
      toast.error(rawParseResult.error || t('cursorPage.invalidJson'));
      return false;
    }

    try {
      await saveRawSettingsAsync({
        settings: rawParseResult.settings,
        expectedMtime: rawSettings?.mtime,
      });
      setRawConfigDirty(false);
      clearProbeState();
      if (!suppressSuccessToast) {
        toast.success(t('cursorPage.rawSaved'));
      }
      return true;
    } catch (error) {
      if (isApiConflictError(error)) {
        toast.error(t('cursorPage.rawChanged'));
      } else {
        toast.error((error as Error).message || t('cursorPage.failedSaveRaw'));
      }
      return false;
    }
  };

  const handleSaveAll = async () => {
    if (!hasChanges) return;

    const saveConfig = configDirty;
    const saveRawSettings = rawConfigDirty;

    if (saveConfig) {
      const saved = await handleSaveConfig({
        suppressSuccessToast: saveRawSettings,
      });
      if (!saved) return;
    }

    if (saveRawSettings) {
      const saved = await handleSaveRawSettings({
        suppressSuccessToast: saveConfig,
      });
      if (!saved) return;
    }

    if (saveConfig && saveRawSettings) {
      toast.success(t('cursorPage.savedAll'));
    }
  };

  const handleHeaderRefresh = async () => {
    setRawConfigDirty(false);
    clearProbeState();
    const [, refreshedConfig] = await Promise.all([
      refetchStatus(),
      refetchConfig(),
      refetchRawSettings(),
    ]);
    resetConfigDraft(refreshedConfig.data ?? config);
  };

  return (
    <>
      <div className="flex h-full min-h-0 overflow-hidden">
        <CursorSidebar
          status={status}
          configPort={config?.port}
          statusLoading={statusLoading}
          integrationBadge={integrationBadge}
          visibleProbeResult={visibleProbeResult}
          canStart={canStart}
          isUpdatingConfig={isUpdatingConfig}
          isAutoDetectingAuth={isAutoDetectingAuth}
          isRunningProbe={isRunningProbe}
          isStartingDaemon={isStartingDaemon}
          isStoppingDaemon={isStoppingDaemon}
          onRefetchStatus={() => refetchStatus()}
          onNavigateCliproxyAuth={() => navigate('/cliproxy?provider=cursor&action=auth')}
          onNavigateCliproxyCursor={() => navigate('/cliproxy?provider=cursor')}
          onToggleEnabled={handleToggleEnabled}
          onAutoDetectAuth={handleAutoDetectAuth}
          onOpenManualAuth={() => setManualAuthOpen(true)}
          onRunProbe={handleRunProbe}
          onStartDaemon={handleStartDaemon}
          onStopDaemon={handleStopDaemon}
        />

        <div className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden">
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b bg-background flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{t('cursorPage.configuration')}</h2>
                    {rawSettings && (
                      <Badge variant="outline" className="text-xs">
                        cursor.settings.json
                      </Badge>
                    )}
                  </div>
                  {rawSettings && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t('cursorPage.lastModified')}{' '}
                      {rawSettings.exists
                        ? new Date(rawSettings.mtime).toLocaleString()
                        : t('cursorPage.neverSaved')}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleHeaderRefresh}
                  disabled={statusLoading || rawSettingsLoading}
                  aria-label={t('cursorPage.refreshConfiguration')}
                  title={t('cursorPage.refreshConfiguration')}
                >
                  <RefreshCw
                    className={cn(
                      'w-4 h-4',
                      (statusLoading || rawSettingsLoading) && 'animate-spin'
                    )}
                  />
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveAll}
                  disabled={isUpdatingConfig || isSavingRawSettings || !hasChanges || !canSave}
                >
                  {isUpdatingConfig || isSavingRawSettings ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      {t('cursorPage.saving')}
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-1" />
                      {t('cursorPage.save')}
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="flex-1 min-h-0 flex divide-x overflow-hidden">
              <CursorConfigTabs
                modelsLoading={modelsLoading}
                modelsCount={models.length}
                orderedModels={orderedModels}
                currentModel={currentModel}
                rawSettingsPath={rawSettings?.path}
                effectivePort={effectivePort}
                effectiveAutoStart={effectiveAutoStart}
                effectiveGhostMode={effectiveGhostMode}
                effectiveModel={effectiveModel}
                effectiveOpusModel={effectiveOpusModel}
                effectiveSonnetModel={effectiveSonnetModel}
                effectiveHaikuModel={effectiveHaikuModel}
                onApplyPreset={applyPreset}
                onUpdateConfigDraft={updateConfigDraft}
              />

              <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                <div className="px-6 py-2 bg-muted/30 border-b flex items-center gap-2 shrink-0 h-[45px]">
                  <Code2 className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">
                    {t('cursorPage.rawConfiguration')}
                  </span>
                </div>
                <RawEditorSection
                  rawJsonContent={effectiveRawConfigText}
                  isRawJsonValid={isRawJsonValid}
                  rawJsonEdits={rawConfigDirty ? rawConfigText : null}
                  rawSettingsEnv={rawSettings?.settings?.env}
                  onChange={(value) => {
                    setRawConfigDirty(true);
                    setRawConfigText(value);
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <CursorManualAuthDialog
        open={manualAuthOpen}
        onOpenChange={setManualAuthOpen}
        manualToken={manualToken}
        onManualTokenChange={setManualToken}
        manualMachineId={manualMachineId}
        onManualMachineIdChange={setManualMachineId}
        isImporting={isImportingManualAuth}
        onImport={handleManualAuthImport}
      />
    </>
  );
}
