/**
 * CursorForm — orchestrates all form sections and the JSON pane.
 *
 * Owns: all local form state (config draft, raw JSON draft, manual-auth dialog,
 * probe snapshot), derived values, and all handler callbacks. Delegates
 * rendering to the individual section components.
 */

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Code2, Loader2, RefreshCw, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { isApiConflictError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FormPane, SectionRail } from '@/components/config-layout';
import { RawEditorSection } from '@/components/copilot/config-form/raw-editor-section';
import type { CursorStatus, CursorConfig, CursorProbeResult } from '@/hooks/use-cursor';

import {
  buildConfigDraft,
  buildProbeSnapshotKey,
  pickModelByAliases,
  pickModelByPatterns,
  parseRawSettings,
  type CursorConfigDraft,
} from './lib/cursor-config-helpers';
import { PresetsSection } from './sections/presets-section';
import { ModelMappingSection } from './sections/model-mapping-section';
import { RuntimeSettingsSection } from './sections/runtime-settings-section';
import { InfoSection } from './sections/info-section';
import { ManualAuthDialog } from './sections/manual-auth-dialog';
import { StatusSidebar } from './sections/status-sidebar';

// ---------------------------------------------------------------------------
// Section rail items
// ---------------------------------------------------------------------------

const SECTION_RAIL_ITEMS = [
  { id: 'presets', label: 'Presets' },
  { id: 'model-mapping', label: 'Model Mapping' },
  { id: 'runtime-settings', label: 'Settings' },
  { id: 'info', label: 'Info' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CursorModel {
  id: string;
  name: string;
  provider: string;
}

interface CursorRawSettings {
  settings: { env?: Record<string, string> };
  mtime: number;
  path: string;
  exists: boolean;
}

interface CursorFormProps {
  status: CursorStatus | undefined;
  statusLoading: boolean;
  config: CursorConfig | undefined;
  models: CursorModel[];
  modelsLoading: boolean;
  currentModel: string | null;
  rawSettings: CursorRawSettings | undefined;
  rawSettingsLoading: boolean;
  probeResult: CursorProbeResult | undefined;
  isUpdatingConfig: boolean;
  isSavingRawSettings: boolean;
  isAutoDetectingAuth: boolean;
  isImportingManualAuth: boolean;
  isStartingDaemon: boolean;
  isStoppingDaemon: boolean;
  isRunningProbe: boolean;
  refetchStatus: () => Promise<{ data?: CursorStatus }>;
  refetchConfig: () => Promise<{ data?: CursorConfig }>;
  refetchRawSettings: () => void;
  updateConfigAsync: (updates: Partial<CursorConfig>) => Promise<unknown>;
  saveRawSettingsAsync: (data: {
    settings: CursorRawSettings['settings'];
    expectedMtime?: number;
  }) => Promise<unknown>;
  autoDetectAuthAsync: () => Promise<unknown>;
  importManualAuthAsync: (data: { accessToken: string; machineId: string }) => Promise<unknown>;
  startDaemonAsync: () => Promise<{ success: boolean; pid?: number; error?: string }>;
  stopDaemonAsync: () => Promise<{ success: boolean; error?: string }>;
  runProbeAsync: () => Promise<CursorProbeResult>;
  resetProbe: () => void;
}

// ---------------------------------------------------------------------------
// CursorForm
// ---------------------------------------------------------------------------

export function CursorForm({
  status,
  statusLoading,
  config,
  models,
  modelsLoading,
  currentModel,
  rawSettings,
  rawSettingsLoading,
  probeResult,
  isUpdatingConfig,
  isSavingRawSettings,
  isAutoDetectingAuth,
  isImportingManualAuth,
  isStartingDaemon,
  isStoppingDaemon,
  isRunningProbe,
  refetchStatus,
  refetchConfig,
  refetchRawSettings,
  updateConfigAsync,
  saveRawSettingsAsync,
  autoDetectAuthAsync,
  importManualAuthAsync,
  startDaemonAsync,
  stopDaemonAsync,
  runProbeAsync,
  resetProbe,
}: CursorFormProps) {
  const { t } = useTranslation();

  // -------------------------------------------------------------------------
  // Local state
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Derived values
  // -------------------------------------------------------------------------

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

  // Deduplicated, sorted model list — prepends custom model if not in server list
  const orderedModels = useMemo(() => {
    const seen = new Set<string>();
    const sorted = [...models].sort((a, b) => a.name.localeCompare(b.name));
    const deduped = sorted.filter((model) => {
      if (seen.has(model.id)) return false;
      seen.add(model.id);
      return true;
    });
    if (effectiveModel && !sorted.some((model) => model.id === effectiveModel)) {
      return [{ id: effectiveModel, name: effectiveModel, provider: 'custom' }, ...deduped];
    }
    return deduped;
  }, [models, effectiveModel]);

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

  // -------------------------------------------------------------------------
  // Draft helpers
  // -------------------------------------------------------------------------

  const updateConfigDraft = (updater: (draft: CursorConfigDraft) => CursorConfigDraft) => {
    setConfigDraft((prev) => {
      const base = configDirty ? prev : pristineConfigDraft;
      return updater(base);
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

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

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
      if (!suppressSuccessToast) toast.success(t('cursorPage.savedConfig'));
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

    const fallback = effectiveModel || currentModel || models[0]?.id || 'gpt-5.3-codex';
    const codex53 = pickModelByAliases(
      models,
      ['gpt-5.3-codex', 'gpt53codex', 'GPT-5.3 Codex'],
      pickModelByPatterns(models, [/gpt[-.]?5.*codex/i], fallback)
    );
    const codexMax = pickModelByAliases(
      models,
      ['gpt-5.1-codex-max', 'gpt51codexmax', 'GPT-5.1 Codex Max'],
      pickModelByPatterns(models, [/gpt[-.]?5.*codex.*max/i], codex53)
    );
    const codexFast = pickModelByAliases(
      models,
      ['gpt-5-fast', 'gpt5fast', 'GPT-5 Fast'],
      pickModelByPatterns(models, [/gpt[-.]?5.*fast/i], codex53)
    );
    const codexMini = pickModelByAliases(
      models,
      ['gpt-5-mini', 'gpt5mini', 'GPT-5 Mini'],
      pickModelByPatterns(models, [/gpt[-.]?5.*mini/i], codexFast)
    );
    const opus46 = pickModelByAliases(
      models,
      ['claude-4.6-opus', 'claude46opus', 'Claude 4.6 Opus'],
      pickModelByPatterns(models, [/claude[-.]?4\.?6.*opus/i, /claude.*opus/i], codex53)
    );
    const sonnet45 = pickModelByAliases(
      models,
      ['claude-4.5-sonnet', 'claude45sonnet', 'Claude 4.5 Sonnet'],
      pickModelByPatterns(models, [/claude[-.]?4\.?5.*sonnet/i, /claude.*sonnet/i], codex53)
    );
    const haiku45 = pickModelByAliases(
      models,
      ['claude-4.5-haiku', 'claude45haiku', 'Claude 4.5 Haiku'],
      pickModelByPatterns(models, [/claude[-.]?4\.?5.*haiku/i, /haiku/i], sonnet45)
    );
    const gemini3Pro = pickModelByAliases(
      models,
      ['gemini-3-pro', 'gemini3pro', 'Gemini 3 Pro'],
      pickModelByPatterns(models, [/gemini[-.]?3.*pro/i], codex53)
    );
    const gemini3Flash = pickModelByAliases(
      models,
      ['gemini-3-flash', 'gemini3flash', 'Gemini 3 Flash'],
      pickModelByPatterns(models, [/gemini[-.]?3.*flash/i, /gemini[-.]?2\.?5.*flash/i], gemini3Pro)
    );

    if (preset === 'codex53') {
      updateConfigDraft((d) => ({
        ...d,
        model: codex53,
        opus_model: codexMax,
        sonnet_model: codex53,
        haiku_model: codexMini,
      }));
      toast.success(t('cursorPage.appliedCodexPreset'));
      return;
    }
    if (preset === 'claude46') {
      updateConfigDraft((d) => ({
        ...d,
        model: opus46,
        opus_model: opus46,
        sonnet_model: sonnet45,
        haiku_model: haiku45,
      }));
      toast.success(t('cursorPage.appliedClaudePreset'));
      return;
    }
    updateConfigDraft((d) => ({
      ...d,
      model: gemini3Pro,
      opus_model: gemini3Pro,
      sonnet_model: gemini3Pro,
      haiku_model: gemini3Flash,
    }));
    toast.success(t('cursorPage.appliedGeminiPreset'));
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
      const refreshed = await refetchStatus();
      setProbeSnapshotKey(buildProbeSnapshotKey(refreshed.data ?? status, config));
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
      if (!suppressSuccessToast) toast.success(t('cursorPage.rawSaved'));
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
    const saveRaw = rawConfigDirty;
    if (saveConfig) {
      const saved = await handleSaveConfig({ suppressSuccessToast: saveRaw });
      if (!saved) return;
    }
    if (saveRaw) {
      const saved = await handleSaveRawSettings({ suppressSuccessToast: saveConfig });
      if (!saved) return;
    }
    if (saveConfig && saveRaw) toast.success(t('cursorPage.savedAll'));
  };

  const handleHeaderRefresh = async () => {
    setRawConfigDirty(false);
    clearProbeState();
    const [, refreshedConfig] = await Promise.all([
      refetchStatus(),
      refetchConfig(),
      refetchRawSettings(),
    ]);
    resetConfigDraft((refreshedConfig as { data?: CursorConfig }).data ?? config);
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
      {/* Status sidebar (left) */}
      <StatusSidebar
        status={status}
        config={config}
        statusLoading={statusLoading}
        visibleProbeResult={visibleProbeResult ?? null}
        integrationBadge={integrationBadge}
        canStart={canStart}
        isUpdatingConfig={isUpdatingConfig}
        isAutoDetectingAuth={isAutoDetectingAuth}
        isImportingManualAuth={isImportingManualAuth}
        isRunningProbe={isRunningProbe}
        isStartingDaemon={isStartingDaemon}
        isStoppingDaemon={isStoppingDaemon}
        onRefreshStatus={refetchStatus}
        onToggleEnabled={handleToggleEnabled}
        onAutoDetectAuth={handleAutoDetectAuth}
        onOpenManualAuth={() => setManualAuthOpen(true)}
        onRunProbe={handleRunProbe}
        onStartDaemon={handleStartDaemon}
        onStopDaemon={handleStopDaemon}
      />

      {/* Main content (right) */}
      <div className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden">
        {/* Page-level header bar */}
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
                className={cn('w-4 h-4', (statusLoading || rawSettingsLoading) && 'animate-spin')}
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

        {/* 3-column: SectionRail | FormPane (540px) | JsonPane */}
        <div className="flex-1 min-h-0 flex divide-x overflow-hidden">
          {/* SectionRail — click-to-scroll anchor nav */}
          <div className="w-[180px] shrink-0 border-r">
            <SectionRail sections={SECTION_RAIL_ITEMS} />
          </div>

          {/* FormPane — scrollable form body */}
          <div className="w-[540px] shrink-0 flex flex-col min-h-0 overflow-hidden">
            <FormPane>
              <PresetsSection
                modelsLoading={modelsLoading}
                hasModels={models.length > 0}
                onApplyPreset={applyPreset}
              />
              <ModelMappingSection
                models={orderedModels}
                modelsLoading={modelsLoading}
                effectiveModel={effectiveModel}
                effectiveOpusModel={effectiveOpusModel}
                effectiveSonnetModel={effectiveSonnetModel}
                effectiveHaikuModel={effectiveHaikuModel}
                onChangeModel={(v) => updateConfigDraft((d) => ({ ...d, model: v }))}
                onChangeOpusModel={(v) => updateConfigDraft((d) => ({ ...d, opus_model: v }))}
                onChangeSonnetModel={(v) => updateConfigDraft((d) => ({ ...d, sonnet_model: v }))}
                onChangeHaikuModel={(v) => updateConfigDraft((d) => ({ ...d, haiku_model: v }))}
              />
              <RuntimeSettingsSection
                effectivePort={effectivePort}
                effectiveAutoStart={effectiveAutoStart}
                effectiveGhostMode={effectiveGhostMode}
                onChangePort={(v) => updateConfigDraft((d) => ({ ...d, port: v }))}
                onChangeAutoStart={(v) => updateConfigDraft((d) => ({ ...d, auto_start: v }))}
                onChangeGhostMode={(v) => updateConfigDraft((d) => ({ ...d, ghost_mode: v }))}
              />
              <InfoSection
                rawSettingsPath={rawSettings?.path}
                models={models}
                modelsLoading={modelsLoading}
                currentModel={currentModel}
              />
            </FormPane>
          </div>

          {/* JSON / raw settings pane */}
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

      {/* Manual auth dialog */}
      <ManualAuthDialog
        open={manualAuthOpen}
        manualToken={manualToken}
        manualMachineId={manualMachineId}
        isImporting={isImportingManualAuth}
        onOpenChange={setManualAuthOpen}
        onChangeToken={setManualToken}
        onChangeMachineId={setManualMachineId}
        onImport={handleManualAuthImport}
      />
    </>
  );
}
