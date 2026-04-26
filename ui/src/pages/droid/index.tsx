/**
 * DroidPage — Phase 4 design-system rewrite.
 *
 * Architecture: PageShell + PageHeader + ConfigLayout
 *   left  = SectionRail (Overview / BYOK / Docs)
 *   form  = DroidForm   (FormPane > 3x FormSection)
 *   json  = RawJsonSettingsEditorPanel (settings.json editor)
 *
 * State lives here; DroidForm + sections are purely presentational.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useDroid } from '@/hooks/use-droid';
import { isApiConflictError } from '@/lib/api-client';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-shell';
import { ConfigLayout, SectionRail, type SectionRailItem } from '@/components/config-layout';
import { RawJsonSettingsEditorPanel } from '@/components/compatible-cli/raw-json-settings-editor-panel';
import { DroidForm } from './droid-form';

// ---- Section rail items -----------------------------------------------------

const DROID_SECTIONS: SectionRailItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'byok', label: 'BYOK' },
  { id: 'docs', label: 'Docs' },
];

// ---- Helpers ----------------------------------------------------------------

function parseJsonObjectText(
  text: string
): { valid: true; value: Record<string, unknown> } | { valid: false; error: string } {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { valid: false, error: 'JSON root must be an object.' };
    }
    return { valid: true, value: parsed as Record<string, unknown> };
  } catch (error) {
    return { valid: false, error: (error as Error).message };
  }
}

// ---- Component --------------------------------------------------------------

export function DroidPage() {
  const { t } = useTranslation();
  const {
    diagnostics,
    diagnosticsLoading,
    diagnosticsError,
    refetchDiagnostics,
    rawSettings,
    rawSettingsLoading,
    refetchRawSettings,
    saveRawSettingsAsync,
    isSavingRawSettings,
  } = useDroid();

  const [rawDraftText, setRawDraftText] = useState<string | null>(null);
  const rawBaseText = rawSettings?.rawText ?? '{}';
  const rawEditorText = rawDraftText ?? rawBaseText;
  const rawConfigDirty = rawDraftText !== null && rawDraftText !== rawBaseText;
  const rawEditorParsed = parseJsonObjectText(rawEditorText);
  const rawEditorValidation = rawEditorParsed.valid
    ? { valid: true as const }
    : { valid: false as const, error: rawEditorParsed.error };

  const setRawEditorDraftText = (nextText: string) => {
    if (nextText === rawBaseText) {
      setRawDraftText(null);
      return;
    }
    setRawDraftText(nextText);
  };

  /** Update the entire settings object (used by BYOK reasoning / budget handlers). */
  const handleSettingsObjectChange = (nextSettings: Record<string, unknown>) => {
    setRawEditorDraftText(JSON.stringify(nextSettings, null, 2) + '\n');
  };

  /** Update a single settings field (used by quick-settings controls). */
  const handleSettingsFieldChange = (key: string, value: unknown | null) => {
    if (!rawEditorParsed.valid) {
      toast.error(t('droidPage.fixJsonBeforeQuickSettings'));
      return;
    }
    const nextSettings = { ...rawEditorParsed.value };
    if (value === null || value === undefined) {
      delete nextSettings[key];
    } else {
      nextSettings[key] = value;
    }
    handleSettingsObjectChange(nextSettings);
  };

  const handleSaveRawSettings = async () => {
    if (!rawEditorValidation.valid) {
      toast.error(t('droidPage.invalidJson', { value: rawEditorValidation.error }));
      return;
    }
    try {
      await saveRawSettingsAsync({
        rawText: rawEditorText,
        expectedMtime: rawSettings?.exists ? rawSettings.mtime : undefined,
      });
      setRawDraftText(null);
      toast.success(t('droidPage.saved'));
    } catch (error) {
      if (isApiConflictError(error)) {
        toast.error(t('droidPage.changedExternally'));
      } else {
        toast.error((error as Error).message || t('droidPage.failedSave'));
      }
    }
  };

  const refreshAll = async () => {
    await Promise.all([refetchDiagnostics(), refetchRawSettings()]);
  };

  return (
    <PageShell>
      <PageHeader title="Factory Droid" description={t('droidPage.settingsTitle')} />
      <ConfigLayout
        left={<SectionRail sections={DROID_SECTIONS} />}
        form={
          <DroidForm
            diagnostics={diagnostics}
            diagnosticsLoading={diagnosticsLoading}
            diagnosticsError={diagnosticsError}
            rawSettingsLoading={rawSettingsLoading}
            rawEditorText={rawEditorText}
            onSettingsObjectChange={handleSettingsObjectChange}
            onSettingsFieldChange={handleSettingsFieldChange}
          />
        }
        json={
          <RawJsonSettingsEditorPanel
            title={t('droidPage.settingsTitle')}
            pathLabel={rawSettings?.path || '~/.factory/settings.json'}
            loading={rawSettingsLoading}
            parseWarning={rawSettings?.parseError}
            value={rawEditorText}
            dirty={rawConfigDirty}
            saving={isSavingRawSettings}
            saveDisabled={
              !rawConfigDirty ||
              isSavingRawSettings ||
              rawSettingsLoading ||
              !rawEditorValidation.valid
            }
            onChange={setRawEditorDraftText}
            onSave={handleSaveRawSettings}
            onRefresh={refreshAll}
          />
        }
      />
    </PageShell>
  );
}
