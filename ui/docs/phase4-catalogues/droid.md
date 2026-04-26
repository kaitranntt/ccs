# Droid Page Catalogue — Phase 4 QA Matrix

Source file: `ui/src/pages/droid.tsx` (749 LOC)

## Form Sections

- [x] **Overview tab** — "Runtime & Install" card: binary status, detection source, binary path, install directory, version, override path
- [x] **Overview tab** — "Config Files" card: settings file + legacy config file (path, resolved path, size, last modified, parse/read error)
- [x] **Overview tab** — Warnings card (conditional, shown only if `diagnostics.warnings.length > 0`)
- [x] **BYOK tab** — `DroidSettingsQuickControlsCard` (quick settings: reasoningEffort, autonomyLevel, diffMode, maxTurns, maxToolCalls, autoCompactThreshold, todoEnabled, todoAutoRefresh, autoCompactEnabled, soundEnabled)
- [x] **BYOK tab** — `DroidByokReasoningControlsCard` (per-model reasoning effort + Anthropic budget tokens)
- [x] **BYOK tab** — BYOK Summary card (activeModelSelector, customModelCount, ccsManagedCount, userManagedCount, invalidModelEntryCount, provider breakdown badges)
- [x] **BYOK tab** — Custom Models table (scrollable, columns: model name, provider/apiKeyPreview, baseUrl/host)
- [x] **Docs tab** — Notes section (dynamic from `diagnostics.docsReference.notes`; falls back to static if empty)
- [x] **Docs tab** — Factory Docs links (from `diagnostics.docsReference.links`; falls back to `DEFAULT_DROID_FACTORY_DOC_LINKS`)
- [x] **Docs tab** — Provider fact-check docs (from `diagnostics.docsReference.providerDocs`; falls back to `DEFAULT_DROID_PROVIDER_DOC_LINKS`)
- [x] **Docs tab** — Provider values line + Settings hierarchy line

## Dialogs / Popovers / Wizards

- [x] None — droid page has no dialogs, popups, or wizards

## Toggles / Switches / Checkboxes

All contained within `DroidSettingsQuickControlsCard`:
- [x] `todoEnabled` toggle
- [x] `todoAutoRefresh` toggle
- [x] `autoCompactEnabled` toggle
- [x] `soundEnabled` toggle

## Action Buttons

- [x] **Save** — `handleSaveRawSettings` → validates JSON, calls `saveRawSettingsAsync`, clears draft, shows toast
- [x] **Refresh** — `refreshAll` → calls `refetchDiagnostics()` + `refetchRawSettings()` in parallel
- [x] **BYOK reasoning effort change** — per-model dropdown → `applyReasoningEffortToDroidByokModel`
- [x] **BYOK Anthropic budget change** — per-model input → `applyAnthropicBudgetTokensToDroidByokModel`
- [x] **Quick settings changes** — enum, boolean, number setters → `updateSettingsField`

## Conditional UI

- [x] **Loading state** — diagnosticsLoading → spinner + "Loading diagnostics..." in left pane
- [x] **Error state** — diagnosticsError || !diagnostics → error text in left pane
- [x] **Warnings card** — shown only if `diagnostics.warnings.length > 0`
- [x] **Quick controls disabled** — `rawSettingsLoading || !rawEditorParsed.valid` → disabled with reason
- [x] **BYOK controls disabled** — same condition as quick controls
- [x] **Save button disabled** — `!rawConfigDirty || isSavingRawSettings || rawSettingsLoading || !rawEditorValidation.valid`
- [x] **Parse error** — `rawSettings?.parseError` shown in editor panel
- [x] **Dirty indicator** — `rawConfigDirty` → editor panel shows unsaved indicator
- [x] **File exists guard** — `rawSettings?.exists ? rawSettings.mtime : undefined` for conflict detection
- [x] **Custom models empty** — shows "No custom models" when `customModels.length === 0`
- [x] **Provider badges empty** — shows "none" badge when `providerRows.length === 0`
- [x] **Config file parse/read error** — shows amber/red text per file if error exists

## API Calls / Mutations / Queries

- [x] `useDroid()` hook → diagnostics query (GET), raw settings query (GET), save mutation (PUT/PATCH)
- [x] `refetchDiagnostics()` — re-fetches diagnostics
- [x] `refetchRawSettings()` — re-fetches raw settings
- [x] `saveRawSettingsAsync({ rawText, expectedMtime })` — saves with optimistic conflict detection
- [x] `isApiConflictError(error)` — checked after save to distinguish conflict vs other error

## Side Effects

- [x] `toast.error(...)` on: invalid JSON save attempt, conflict error, generic save error, fix-JSON-before-quick-settings, fix-JSON-before-reasoning, fix-JSON-before-budget, unable-update-reasoning, Anthropic-only-budget
- [x] `toast.success(t('droidPage.saved'))` on successful save
- [x] `setRawDraftText(null)` after successful save (clears draft)
- [x] `setRawEditorDraftText` auto-clears draft when text matches base (no-op → null)

## Helper Utilities (inline in monolith, preserved verbatim)

- [x] `renderTextWithLinks(text)` — parses URLs from string, renders as `<a>` elements
- [x] `formatTimestamp(value)` — formats millisecond timestamp to locale string, returns 'N/A' for null/invalid
- [x] `formatBytes(value)` — formats byte count to B/KB/MB
- [x] `parseJsonObjectText(text)` — validates JSON as non-array object, returns `{valid, value}` or `{valid, error}`
- [x] `asStringValue(value)` — coerces unknown to string | null
- [x] `asNumberValue(value)` — coerces unknown to finite number | null
- [x] `asBooleanValue(value)` — coerces unknown to boolean | null
- [x] `DetailRow` component — label/value row with optional mono styling

## Static Data (constants, preserved verbatim)

- [x] `DEFAULT_DROID_FACTORY_DOC_LINKS` — 3 factory docs links (fallback if API returns empty)
- [x] `DEFAULT_DROID_PROVIDER_DOC_LINKS` — 3 provider docs links (fallback if API returns empty)

## i18n Keys Used

- [x] `droidPage.fixJsonBeforeQuickSettings`
- [x] `droidPage.invalidJson`
- [x] `droidPage.saved`
- [x] `droidPage.changedExternally`
- [x] `droidPage.failedSave`
- [x] `droidPage.loadingDiagnostics`
- [x] `droidPage.failedDiagnostics`
- [x] `droidPage.overview`
- [x] `droidPage.byok`
- [x] `droidPage.docs`
- [x] `droidPage.runtimeInstall`
- [x] `droidPage.status`
- [x] `droidPage.detected`
- [x] `droidPage.notFound`
- [x] `droidPage.detectionSource`
- [x] `droidPage.binaryPath`
- [x] `droidPage.installDirectory`
- [x] `droidPage.version`
- [x] `droidPage.overridePath`
- [x] `droidPage.configFiles`
- [x] `droidPage.path`
- [x] `droidPage.resolved`
- [x] `droidPage.size`
- [x] `droidPage.lastModified`
- [x] `droidPage.parseWarning`
- [x] `droidPage.readWarning`
- [x] `droidPage.warnings`
- [x] `droidPage.byokSummary`
- [x] `droidPage.activeModelSelector`
- [x] `droidPage.customModels`
- [x] `droidPage.ccsManaged`
- [x] `droidPage.userManaged`
- [x] `droidPage.malformedEntries`
- [x] `droidPage.providers`
- [x] `droidPage.none`
- [x] `droidPage.customModelsTitle`
- [x] `droidPage.modelName`
- [x] `droidPage.provider`
- [x] `droidPage.baseUrl`
- [x] `droidPage.noCustomModels`
- [x] `droidPage.docsAlignedNotes`
- [x] `droidPage.factoryDocs`
- [x] `droidPage.providerFactCheckDocs`
- [x] `droidPage.providerValues`
- [x] `droidPage.settingsHierarchy`
- [x] `droidPage.settingsTitle`
- [x] `droidPage.fixJsonBeforeReasoning`
- [x] `droidPage.fixJsonBeforeBudget`
- [x] `droidPage.unableUpdateReasoning`
- [x] `droidPage.anthropicOnlyBudget`

## Layout

- [x] Resizable split pane (PanelGroup horizontal: left 45% / right 55%, min 35% each)
- [x] Left pane: `border-r bg-muted/20` wrapper
- [x] Right pane: `RawJsonSettingsEditorPanel`
- [x] Resize handle: `GripVertical` icon
