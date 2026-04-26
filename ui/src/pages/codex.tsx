import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { CodexControlCenterTab } from '@/components/compatible-cli/codex-control-center-tab';
import { CodexDocsTab } from '@/components/compatible-cli/codex-docs-tab';
import { useCodex } from '@/hooks/use-codex';
import { isApiConflictError } from '@/lib/api-client';
import { CodexOverviewTab } from '@/components/compatible-cli/codex-overview-tab';
import { RawConfigEditorPanel } from '@/components/compatible-cli/raw-json-settings-editor-panel';
import {
  getKnownCodexFeatures,
  readCodexFeatureState,
  readCodexMcpServers,
  readCodexModelProviders,
  readCodexProfiles,
  readCodexProjectTrust,
  readCodexTopLevelSettings,
} from '@/lib/codex-config';
import { safeParseTomlObject } from '@shared/toml-object';
import { PageShell, PageHeader } from '@/components/page-shell';
import {
  ConfigLayout,
  SectionRail,
  FormPane,
  FormSection,
  type SectionRailItem,
} from '@/components/config-layout';

// ---------------------------------------------------------------------------
// Section rail definition — anchors for the FormPane scroll-spy
// ---------------------------------------------------------------------------

const CODEX_SECTIONS: SectionRailItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'controls', label: 'Control Center' },
  { id: 'docs', label: 'Docs' },
];

// ---------------------------------------------------------------------------
// CodexPage — single-entity Config archetype
// Identity strip: PageHeader (1c)
// Body: ConfigLayout + SectionRail + FormPane + RawConfigEditorPanel (json slot)
// ---------------------------------------------------------------------------

export function CodexPage() {
  const { t } = useTranslation();
  const featureCatalog = getKnownCodexFeatures();
  const {
    diagnostics,
    diagnosticsLoading,
    diagnosticsError,
    refetchDiagnostics,
    rawConfig,
    rawConfigLoading,
    rawConfigError,
    refetchRawConfig,
    saveRawConfigAsync,
    isSavingRawConfig,
    patchConfigAsync,
    isPatchingConfig,
  } = useCodex();

  const [rawDraftText, setRawDraftText] = useState<string | null>(null);
  const rawBaseText = rawConfig?.rawText ?? '';
  const rawEditorText = rawDraftText ?? rawBaseText;
  const rawConfigDirty = rawDraftText !== null && rawDraftText !== rawBaseText;
  const rawEditorParsed = safeParseTomlObject(rawEditorText);
  const rawEditorValidation = rawEditorParsed.parseError
    ? { valid: false as const, error: rawEditorParsed.parseError }
    : { valid: true as const };
  const controlsConfig = rawConfig?.config ?? null;
  const structuredControlsDisabled =
    rawConfigLoading ||
    !rawConfig ||
    rawConfigDirty ||
    rawConfig?.parseError !== null ||
    rawConfig?.readError !== null;
  const controlsDisabledReason = rawConfigError
    ? /* TODO i18n: missing key for "Structured controls unavailable: failed to load the current config.toml." */ 'Structured controls unavailable: failed to load the current config.toml.'
    : rawConfig?.readError
      ? /* TODO i18n: missing key for controls unavailable with read error */ `Structured controls unavailable: ${rawConfig.readError}`
      : rawConfigDirty
        ? rawEditorValidation.valid
          ? /* TODO i18n: missing key for "Save or discard raw TOML edits before using structured controls." */ 'Save or discard raw TOML edits before using structured controls.'
          : /* TODO i18n: missing key for "Fix or discard raw TOML edits before using structured controls." */ 'Fix or discard raw TOML edits before using structured controls.'
        : rawConfig?.parseError
          ? /* TODO i18n: missing key for controls disabled with parse error */ `Structured controls disabled: ${rawConfig.parseError}`
          : null;

  const topLevelSettings = useMemo(
    () => readCodexTopLevelSettings(controlsConfig),
    [controlsConfig]
  );
  const projectTrustEntries = useMemo(
    () => readCodexProjectTrust(controlsConfig),
    [controlsConfig]
  );
  const profileEntries = useMemo(() => readCodexProfiles(controlsConfig), [controlsConfig]);
  const modelProviderEntries = useMemo(
    () => readCodexModelProviders(controlsConfig),
    [controlsConfig]
  );
  const mcpServerEntries = useMemo(() => readCodexMcpServers(controlsConfig), [controlsConfig]);
  const featureState = useMemo(() => readCodexFeatureState(controlsConfig), [controlsConfig]);

  const setRawEditorDraftText = (nextText: string) => {
    if (nextText === rawBaseText) {
      setRawDraftText(null);
      return;
    }
    setRawDraftText(nextText);
  };

  const refreshAll = async () => {
    try {
      const results = await Promise.all([refetchDiagnostics(), refetchRawConfig()]);
      const refreshFailed = results.some(
        (result) => !result || result.status === 'error' || result.isError || result.error
      );

      if (refreshFailed) {
        toast.error(t('toasts.codexRefreshFailed'));
        return;
      }

      setRawDraftText(null);
    } catch (error) {
      toast.error((error as Error).message || t('toasts.codexRefreshError'));
    }
  };

  const handleSaveRawConfig = async () => {
    if (!rawEditorValidation.valid) {
      toast.error(t('toasts.codexFixToml'));
      return;
    }

    try {
      await saveRawConfigAsync({
        rawText: rawEditorText,
        expectedMtime: rawConfig?.exists ? rawConfig.mtime : undefined,
      });
      setRawDraftText(null);
      toast.success(t('toasts.codexSaved'));
      await refetchDiagnostics();
    } catch (error) {
      if (isApiConflictError(error)) {
        toast.error(t('toasts.codexChangedExternally'));
      } else {
        toast.error((error as Error).message || t('toasts.codexSaveFailed'));
      }
    }
  };

  const runConfigPatch = async (
    patch: Parameters<typeof patchConfigAsync>[0],
    successMessage: string
  ) => {
    try {
      await patchConfigAsync({
        ...patch,
        expectedMtime: rawConfig?.exists ? rawConfig.mtime : undefined,
      });
      setRawDraftText(null);
      toast.success(successMessage);
    } catch (error) {
      if (isApiConflictError(error)) {
        toast.error(t('toasts.codexChangedExternally'));
      } else {
        toast.error((error as Error).message || t('toasts.codexUpdateFailed'));
      }
    }
  };

  // ---------------------------------------------------------------------------
  // FormPane body — three FormSections matching the SectionRail anchors
  // ---------------------------------------------------------------------------

  const renderFormBody = () => {
    if (diagnosticsLoading) {
      return (
        <div className="flex h-full items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          {
            /* TODO i18n: missing key for "Loading Codex diagnostics..." */ 'Loading Codex diagnostics...'
          }
        </div>
      );
    }

    if (diagnosticsError || !diagnostics) {
      return (
        <div className="flex h-full items-center justify-center px-6 text-center text-destructive">
          {
            /* TODO i18n: missing key for "Failed to load Codex diagnostics." */ 'Failed to load Codex diagnostics.'
          }
        </div>
      );
    }

    return (
      <>
        <FormSection id="overview" title={t('codexPage.overview')}>
          <CodexOverviewTab diagnostics={diagnostics} />
        </FormSection>

        <FormSection id="controls" title={t('codexPage.controlCenter')}>
          <CodexControlCenterTab
            workspacePath={diagnostics.workspacePath}
            activeProfile={diagnostics.config.activeProfile}
            topLevelSettings={topLevelSettings}
            projectTrustEntries={projectTrustEntries}
            profileEntries={profileEntries}
            modelProviderEntries={modelProviderEntries}
            mcpServerEntries={mcpServerEntries}
            featureCatalog={featureCatalog}
            featureState={featureState}
            disabled={structuredControlsDisabled}
            disabledReason={controlsDisabledReason}
            saving={isPatchingConfig}
            onPatch={runConfigPatch}
          />
        </FormSection>

        <FormSection id="docs" title={t('codexPage.docs')}>
          <CodexDocsTab diagnostics={diagnostics} />
        </FormSection>
      </>
    );
  };

  return (
    <PageShell>
      <PageHeader
        title={/* TODO i18n: missing key for "Codex" page title */ 'Codex'}
        description={
          /* TODO i18n: missing key for codex page description */ 'Configure and manage your Codex CLI integration'
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            disabled={diagnosticsLoading || rawConfigLoading}
            aria-label={/* TODO i18n: missing key for "Refresh Codex" */ 'Refresh Codex'}
          >
            <RefreshCw
              className={
                diagnosticsLoading || rawConfigLoading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'
              }
            />
            {/* TODO i18n: missing key for "Refresh" */ 'Refresh'}
          </Button>
        }
      />
      <ConfigLayout
        left={<SectionRail sections={CODEX_SECTIONS} />}
        form={<FormPane>{renderFormBody()}</FormPane>}
        json={
          <RawConfigEditorPanel
            /* TODO i18n: missing key for "Codex config.toml" title */
            title="Codex config.toml"
            pathLabel={rawConfig?.path || diagnostics?.file.path || '$CODEX_HOME/config.toml'}
            loading={rawConfigLoading}
            parseWarning={
              rawEditorValidation.valid ? rawConfig?.parseError : rawEditorValidation.error
            }
            readWarning={rawConfig?.readError}
            value={rawEditorText}
            dirty={rawConfigDirty}
            readOnly={Boolean(rawConfig?.readError)}
            saving={isSavingRawConfig}
            saveDisabled={
              !rawConfigDirty ||
              isSavingRawConfig ||
              rawConfigLoading ||
              !rawEditorValidation.valid ||
              Boolean(rawConfig?.readError)
            }
            onChange={(next) => {
              setRawEditorDraftText(next);
            }}
            onSave={handleSaveRawConfig}
            onRefresh={refreshAll}
            onDiscard={() => setRawDraftText(null)}
            language="toml"
            /* TODO i18n: missing key for "Loading config.toml..." */
            loadingLabel="Loading config.toml..."
            /* TODO i18n: missing key for "TOML warning" */
            parseWarningLabel="TOML warning"
            ownershipNotice={
              <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
                {/* TODO i18n: missing keys for ownership notice paragraphs */}
                <p className="font-medium">This file is upstream-owned by Codex CLI.</p>
                <p>
                  CCS does not keep <code>~/.codex/config.toml</code> in sync for you.
                </p>
                <p>
                  CCS-backed Codex launches may apply transient <code>-c</code> overrides and
                  <code> CCS_CODEX_API_KEY</code>; those effective values may not appear here.
                </p>
              </div>
            }
          />
        }
      />
    </PageShell>
  );
}
