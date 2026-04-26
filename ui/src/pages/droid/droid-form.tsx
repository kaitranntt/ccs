/**
 * DroidForm — composes the three FormSections for the droid page.
 *
 * Sits inside ConfigLayout's `form` slot. The FormPane wrapper provides the
 * scrollable container; individual sections use FormSection for SectionRail anchoring.
 *
 * No FormPane wrapper here — the sections use their own internal scroll via FormPane
 * in the parent (index.tsx). Following the copilot lesson: skip double-wrap.
 */

import { useMemo } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { FormPane } from '@/components/config-layout';
import {
  applyAnthropicBudgetTokensToDroidByokModel,
  applyReasoningEffortToDroidByokModel,
  extractDroidByokModels,
} from '@/lib/droid-byok-custom-models';
import { OverviewSection } from './sections/overview-section';
import { ByokSection } from './sections/byok-section';
import { DocsSection } from './sections/docs-section';
import type { DroidDashboardDiagnostics } from '@/hooks/use-droid';
import type { DroidQuickSettingsValues } from '@/components/compatible-cli/droid-settings-quick-controls-card';

// ---- Helpers (verbatim from monolith) ---------------------------------------

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

function asStringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
function asNumberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function asBooleanValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

// ---- Props ------------------------------------------------------------------

interface DroidFormProps {
  diagnostics: DroidDashboardDiagnostics | null | undefined;
  diagnosticsLoading: boolean;
  diagnosticsError: unknown;
  rawSettingsLoading: boolean;
  rawEditorText: string;
  onSettingsObjectChange: (next: Record<string, unknown>) => void;
  onSettingsFieldChange: (key: string, value: unknown | null) => void;
}

// ---- Component --------------------------------------------------------------

export function DroidForm({
  diagnostics,
  diagnosticsLoading,
  diagnosticsError,
  rawSettingsLoading,
  rawEditorText,
  onSettingsObjectChange,
  onSettingsFieldChange,
}: DroidFormProps) {
  const { t } = useTranslation();

  const rawEditorParsed = parseJsonObjectText(rawEditorText);

  // Derive quick-settings values from parsed JSON (verbatim from monolith)
  const quickSettingsValues: DroidQuickSettingsValues = rawEditorParsed.valid
    ? {
        reasoningEffort: asStringValue(rawEditorParsed.value.reasoningEffort),
        autonomyLevel: asStringValue(rawEditorParsed.value.autonomyLevel),
        diffMode: asStringValue(rawEditorParsed.value.diffMode),
        maxTurns: asNumberValue(rawEditorParsed.value.maxTurns),
        maxToolCalls: asNumberValue(rawEditorParsed.value.maxToolCalls),
        autoCompactThreshold: asNumberValue(rawEditorParsed.value.autoCompactThreshold),
        todoEnabled: asBooleanValue(rawEditorParsed.value.todoEnabled),
        todoAutoRefresh: asBooleanValue(rawEditorParsed.value.todoAutoRefresh),
        autoCompactEnabled: asBooleanValue(rawEditorParsed.value.autoCompactEnabled),
        soundEnabled: asBooleanValue(rawEditorParsed.value.soundEnabled),
      }
    : {
        reasoningEffort: null,
        autonomyLevel: null,
        diffMode: null,
        maxTurns: null,
        maxToolCalls: null,
        autoCompactThreshold: null,
        todoEnabled: null,
        todoAutoRefresh: null,
        autoCompactEnabled: null,
        soundEnabled: null,
      };

  const byokModels = rawEditorParsed.valid ? extractDroidByokModels(rawEditorParsed.value) : [];

  const customModels = diagnostics?.byok.customModels ?? [];
  const providerRows = useMemo(
    () => Object.entries(diagnostics?.byok.providerBreakdown ?? {}).sort((a, b) => b[1] - a[1]),
    [diagnostics?.byok.providerBreakdown]
  );

  // ---- Handlers (verbatim logic from monolith) ------------------------------

  const handleEnumSettingChange = (key: string, value: string | null) => {
    if (!rawEditorParsed.valid) {
      toast.error(t('droidPage.fixJsonBeforeQuickSettings'));
      return;
    }
    onSettingsFieldChange(key, value);
  };

  const handleBooleanSettingChange = (key: string, value: boolean | null) => {
    if (!rawEditorParsed.valid) {
      toast.error(t('droidPage.fixJsonBeforeQuickSettings'));
      return;
    }
    onSettingsFieldChange(key, value);
  };

  const handleNumberSettingChange = (key: string, value: number | null) => {
    if (!rawEditorParsed.valid) {
      toast.error(t('droidPage.fixJsonBeforeQuickSettings'));
      return;
    }
    onSettingsFieldChange(key, value);
  };

  const handleEffortChange = (modelId: string, effort: string | null) => {
    if (!rawEditorParsed.valid) {
      toast.error(t('droidPage.fixJsonBeforeReasoning'));
      return;
    }
    const nextSettings = applyReasoningEffortToDroidByokModel(
      rawEditorParsed.value,
      modelId,
      effort
    );
    if (!nextSettings) {
      toast.error(t('droidPage.unableUpdateReasoning'));
      return;
    }
    onSettingsObjectChange(nextSettings);
  };

  const handleAnthropicBudgetChange = (modelId: string, budgetTokens: number | null) => {
    if (!rawEditorParsed.valid) {
      toast.error(t('droidPage.fixJsonBeforeBudget'));
      return;
    }
    const nextSettings = applyAnthropicBudgetTokensToDroidByokModel(
      rawEditorParsed.value,
      modelId,
      budgetTokens
    );
    if (!nextSettings) {
      toast.error(t('droidPage.anthropicOnlyBudget'));
      return;
    }
    onSettingsObjectChange(nextSettings);
  };

  return (
    <FormPane>
      <OverviewSection
        diagnostics={diagnostics}
        diagnosticsLoading={diagnosticsLoading}
        diagnosticsError={diagnosticsError}
      />
      <ByokSection
        diagnostics={diagnostics}
        quickSettingsValues={quickSettingsValues}
        byokModels={byokModels}
        rawSettingsLoading={rawSettingsLoading}
        rawEditorParsed={rawEditorParsed}
        customModels={customModels}
        providerRows={providerRows}
        onEnumSettingChange={handleEnumSettingChange}
        onBooleanSettingChange={handleBooleanSettingChange}
        onNumberSettingChange={handleNumberSettingChange}
        onEffortChange={handleEffortChange}
        onAnthropicBudgetChange={handleAnthropicBudgetChange}
      />
      <DocsSection diagnostics={diagnostics} />
    </FormPane>
  );
}
