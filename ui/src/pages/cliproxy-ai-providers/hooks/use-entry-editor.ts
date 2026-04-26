/**
 * Entry editor state hook.
 * Owns: draft fields, raw JSON sync, validation, save/reset/preset logic.
 */

import { useMemo, useState } from 'react';
import type {
  AiProviderEntryView,
  AiProviderFamilyState,
} from '../../../../../src/cliproxy/ai-providers';
import {
  buildEntryConfigRecord,
  buildEntryEditorDraft,
  buildEntryPayload,
  buildSettingsPreview,
  getRequestedUpstreamModelRuleErrors,
  parseDelimitedLines,
  parseEntryConfigDraft,
  parseKeyValueLines,
  parseModelAliasLines,
  type EntryEditorDraft,
} from '../lib/ai-provider-utils';
import type { AiProvidersSourceSummary } from '../../../../../src/cliproxy/ai-providers';

export function useEntryEditor(
  family: AiProviderFamilyState,
  entry: AiProviderEntryView,
  source: AiProvidersSourceSummary
) {
  const [draft, setDraft] = useState<EntryEditorDraft>(() => buildEntryEditorDraft(entry));
  const [rawJsonEdits, setRawJsonEdits] = useState<string | null>(null);
  const [isRawJsonValid, setIsRawJsonValid] = useState(true);
  const [rawJsonError, setRawJsonError] = useState<string | null>(null);
  const [configTab, setConfigTab] = useState('config');
  const [jsonTab, setJsonTab] = useState('raw');

  // Derived JSON content
  const initialRawJsonContent = useMemo(
    () =>
      JSON.stringify(buildEntryConfigRecord(family, entry, buildEntryEditorDraft(entry)), null, 2),
    [entry, family]
  );
  const derivedRawJsonContent = useMemo(
    () => JSON.stringify(buildEntryConfigRecord(family, entry, draft), null, 2),
    [draft, entry, family]
  );
  const rawJsonContent = rawJsonEdits ?? derivedRawJsonContent;

  // Derived computed values
  const settingsPreview = useMemo(
    () => buildSettingsPreview(family, draft, source),
    [draft, family, source]
  );
  const settingsPreviewContent = useMemo(
    () => JSON.stringify(settingsPreview, null, 2),
    [settingsPreview]
  );
  const parsedModelRules = useMemo(
    () => parseModelAliasLines(draft.modelAliasesText),
    [draft.modelAliasesText]
  );
  const modelRuleErrors = useMemo(
    () => getRequestedUpstreamModelRuleErrors(draft.modelAliasesText),
    [draft.modelAliasesText]
  );
  const headerRules = useMemo(() => parseKeyValueLines(draft.headersText), [draft.headersText]);
  const excludedModelRules = useMemo(
    () => parseDelimitedLines(draft.excludedModelsText),
    [draft.excludedModelsText]
  );
  const advancedRuleCount =
    headerRules.length +
    excludedModelRules.length +
    (draft.proxyUrl.trim() ? 1 : 0) +
    (draft.prefix.trim() ? 1 : 0);
  const advancedEnabled =
    family.id === 'openai-compatibility'
      ? draft.headersText.trim().length > 0
      : Boolean(
          draft.proxyUrl.trim() ||
          draft.prefix.trim() ||
          draft.headersText.trim() ||
          draft.excludedModelsText.trim()
        );
  const hasChanges =
    rawJsonEdits !== null
      ? rawJsonEdits !== initialRawJsonContent
      : derivedRawJsonContent !== initialRawJsonContent;

  const missingRequiredFields = useMemo(() => {
    if (family.id === 'openai-compatibility') {
      const missing: string[] = [];
      if (!draft.name.trim()) missing.push('name');
      if (!draft.baseUrl.trim()) missing.push('base-url');
      if (!entry.secretConfigured && parseDelimitedLines(draft.apiKeysText).length === 0) {
        missing.push('api-key-entries');
      }
      return missing;
    }
    if (!entry.secretConfigured && !draft.apiKey.trim()) return ['api-key'];
    return [];
  }, [
    draft.apiKey,
    draft.apiKeysText,
    draft.baseUrl,
    draft.name,
    entry.secretConfigured,
    family.id,
  ]);

  const canSave =
    isRawJsonValid &&
    missingRequiredFields.length === 0 &&
    modelRuleErrors.length === 0 &&
    hasChanges;

  // Mutators
  const updateDraft = (updater: (current: EntryEditorDraft) => EntryEditorDraft) => {
    setDraft((current) => updater(current));
    setRawJsonEdits(null);
    setIsRawJsonValid(true);
    setRawJsonError(null);
  };

  const handleRawJsonChange = (value: string) => {
    setRawJsonEdits(value);
    try {
      const parsedDraft = parseEntryConfigDraft(family, entry, value);
      setDraft(parsedDraft);
      setIsRawJsonValid(true);
      setRawJsonError(null);
    } catch (error) {
      setIsRawJsonValid(false);
      setRawJsonError(error instanceof Error ? error.message : 'Invalid JSON');
    }
  };

  const handleReset = () => {
    setDraft(buildEntryEditorDraft(entry));
    setRawJsonEdits(null);
    setIsRawJsonValid(true);
    setRawJsonError(null);
  };

  const applyPreset = (preset: 'minimal' | 'clean-routing') => {
    updateDraft((current) => {
      if (preset === 'minimal') {
        return family.id === 'openai-compatibility'
          ? { ...current, headersText: '', modelAliasesText: '' }
          : {
              ...current,
              baseUrl: '',
              proxyUrl: '',
              prefix: '',
              headersText: '',
              excludedModelsText: '',
              modelAliasesText: '',
            };
      }
      return {
        ...current,
        proxyUrl: '',
        prefix: '',
        headersText: '',
        excludedModelsText: family.id === 'openai-compatibility' ? current.excludedModelsText : '',
      };
    });
  };

  const getPayload = () => buildEntryPayload(family, entry, draft);

  return {
    draft,
    updateDraft,
    rawJsonContent,
    rawJsonError,
    isRawJsonValid,
    handleRawJsonChange,
    handleReset,
    applyPreset,
    getPayload,
    settingsPreview,
    settingsPreviewContent,
    parsedModelRules,
    modelRuleErrors,
    advancedRuleCount,
    advancedEnabled,
    hasChanges,
    missingRequiredFields,
    canSave,
    configTab,
    setConfigTab,
    jsonTab,
    setJsonTab,
  };
}
