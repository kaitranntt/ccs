# Cursor Page — UI Catalogue (Phase 4)

Exhaustive catalogue of every UI element, section, dialog, action, API call, and side effect in `cursor.tsx` (1413 LOC).

## Page Layout

- [x] Outer split: fixed-width left sidebar (w-80) + flex-1 main content area
- [x] Left sidebar: header, ScrollArea body, footer (port display)
- [x] Main: header bar with title/refresh/save + split (form pane 540px + json pane flex-1)

## Left Sidebar — Header (Identity Strip)

- [x] Cursor SVG icon (`/assets/sidebar/cursor.svg`)
- [x] Page title: `t('cursorPage.title')`
- [x] Deprecated badge: red outline badge `t('cursorPage.deprecated')`
- [x] Integration enabled/disabled badge (computed: `integrationBadge`)
- [x] Refresh status icon button (`refetchStatus()`, spin animation when `statusLoading`)
- [x] Subtitle: `t('cursorPage.subtitle')`

## Left Sidebar — Unofficial Warning Banner

- [x] Yellow bordered/filled warning box
- [x] `AlertTriangle` icon + title `t('cursorPage.unofficialTitle')`
- [x] Bulleted list of 3 items: `unofficialItem1`, `unofficialItem2`, `unofficialItem3`

## Left Sidebar — Supported Path Panel

- [x] Bordered section with label `t('cursorPage.supportedPathTitle')` + description `t('cursorPage.supportedPathDesc')`
- [x] Button: "Start CLIProxy Auth" → `navigate('/cliproxy?provider=cursor&action=auth')`
- [x] Button: "Open CLIProxy Cursor" → `navigate('/cliproxy?provider=cursor')`

## Left Sidebar — Status Items

- [x] `StatusItem` for Integration: `ShieldCheck` icon, ok = `status?.enabled`
- [x] `StatusItem` for Authentication: `Key` icon, ok = `status?.authenticated && !status?.token_expired`, detail shows auth_method or expired/not-connected
- [x] `StatusItem` for Daemon: `Server` icon, ok = `status?.daemon_running`

## Left Sidebar — Live Probe Panel

- [x] Section header: `Code2` icon + "Live Probe" label
- [x] Status badge: outline when probe run (green if ok, red if failed), secondary when not run
- [x] Conditional probe result details (when `visibleProbeResult`):
  - [x] Stage row (font-mono uppercase)
  - [x] HTTP status row
  - [x] Duration (ms) row
  - [x] Model row (conditional: only shown when `visibleProbeResult.model` present)
  - [x] Message text
- [x] Fallback: `t('cursorPage.probeNotRun')` text when no probe result
- [x] Hint text: `t('cursorPage.probeLocalReadinessHint')`

## Left Sidebar — Actions Panel

- [x] "Actions" section label
- [x] Enable/Disable toggle button (conditional):
  - [x] When enabled: Outline "Disable Integration" button (`PowerOff` icon) → `handleToggleEnabled(false)`
  - [x] When disabled: Primary "Enable Integration" button (`Power` icon) → `handleToggleEnabled(true)`
  - [x] Both disabled when `isUpdatingConfig`
- [x] "Auto-detect Auth" button (`Key` icon, spinner when `isAutoDetectingAuth`) → `handleAutoDetectAuth()`
- [x] "Manual Auth Import" button (`Key` icon) → `setManualAuthOpen(true)`
- [x] "Run Live Probe" / "Re-run Live Probe" button (`Code2` icon, spinner when `isRunningProbe`) → `handleRunProbe()`
  - [x] Label changes: probing / re-run / run based on state
- [x] Start/Stop Daemon button (conditional):
  - [x] When running: Outline "Stop Daemon" button (`PowerOff` icon, spinner when `isStoppingDaemon`) → `handleStopDaemon()`
  - [x] When stopped: Primary "Start Daemon" button (`Play` icon, spinner when `isStartingDaemon`) → `handleStartDaemon()`, disabled when `!canStart`

## Left Sidebar — Footer

- [x] Port display: label `t('cursorPage.port')` + value from `status?.port ?? config?.port ?? DEFAULT_CURSOR_PORT`

## Main Area — Header Bar

- [x] Title: `t('cursorPage.configuration')`
- [x] Conditional badge: "cursor.settings.json" when `rawSettings` loaded
- [x] Last-modified timestamp: when `rawSettings.exists` true, shows `new Date(rawSettings.mtime).toLocaleString()`, else `t('cursorPage.neverSaved')`
- [x] Refresh button (ghost, sm): `handleHeaderRefresh()`, disabled when `statusLoading || rawSettingsLoading`, animate-spin
- [x] Save button: `handleSaveAll()`, disabled when `isUpdatingConfig || isSavingRawSettings || !hasChanges || !canSave`
  - [x] Loading state: spinner + `t('cursorPage.saving')`
  - [x] Default state: `Save` icon + `t('cursorPage.save')`

## Main Area — Form Pane (Left 540px)

### Tabs: Model Config | Settings | Info

#### Tab: Model Config

**Presets Sub-section**
- [x] Section title with `Sparkles` icon: `t('cursorPage.presets')`
- [x] Description: `t('cursorPage.presetsDesc')`
- [x] 3 preset buttons (outline, sm, xs):
  - [x] "GPT-5.3 Codex" (`Zap` icon) → `applyPreset('codex53')`, disabled when `modelsLoading || models.length === 0`
  - [x] "Claude 4.6" (`Zap` icon) → `applyPreset('claude46')`, disabled when `modelsLoading || models.length === 0`
  - [x] "Gemini 3 Pro" (`Zap` icon) → `applyPreset('gemini3')`, disabled when `modelsLoading || models.length === 0`
- [x] `applyPreset` logic: uses `pickModelByAliases` and `pickModelByPatterns` helpers to resolve codex/claude/gemini model ids

**Model Mapping Sub-section**
- [x] Section title: `t('cursorPage.modelMapping')`
- [x] Description: `t('cursorPage.modelMappingDesc')`
- [x] `CursorModelSelector` for Default Model: required, no fallback option
- [x] `CursorModelSelector` for Opus Model: `allowDefaultFallback` → adds "Use default model" option
- [x] `CursorModelSelector` for Sonnet Model: `allowDefaultFallback`
- [x] `CursorModelSelector` for Haiku Model: `allowDefaultFallback`
- [x] Model list is deduped, sorted by name, with custom model prepended if not in list
- [x] Each selector shows model name (font-mono) + provider badge

#### Tab: Settings

- [x] Section title: `t('cursorPage.runtimeSettings')`
- [x] Port input: number, min=1, max=65535, max-w-[150px], value = `effectivePort` → `updateConfigDraft`
- [x] Auto-start daemon toggle: Switch with label + description → `updateConfigDraft`
- [x] Ghost mode toggle: Switch with label + description → `updateConfigDraft`

#### Tab: Info

- [x] Info card: grid layout, 2 rows:
  - [x] Provider: "Cursor IDE (Legacy)"
  - [x] File path: `rawSettings?.path ?? '~/.ccs/cursor.settings.json'` (code element)
  - [x] Description paragraph about env var model mapping (ANTHROPIC_MODEL, _DEFAULT_OPUS_, _DEFAULT_SONNET_, _DEFAULT_HAIKU_)
- [x] Available Models list:
  - [x] Loading state: `Loader2` spinner + `t('cursorPage.loadingModels')`
  - [x] Empty state: `t('cursorPage.noModels')`
  - [x] Model list: each item shows id (font-medium) + name • provider (xs muted), with "Default" badge if `model.id === currentModel`

## Main Area — JSON Pane (Right, flex-1)

- [x] Pane header: `Code2` icon + "Raw Configuration" label
- [x] `RawEditorSection` component: receives `rawJsonContent`, `isRawJsonValid`, `rawJsonEdits`, `rawSettingsEnv`, `onChange`
  - [x] On change: `setRawConfigDirty(true)` + `setRawConfigText(value)`

## Manual Auth Import Dialog

- [x] `Dialog` controlled by `manualAuthOpen` state
- [x] Title: `t('cursorPage.manualImportTitle')`
- [x] Description: `t('cursorPage.manualImportDesc')`
- [x] Input: Access Token (`cursor-manual-token`, value=`manualToken`)
- [x] Input: Machine ID (`cursor-manual-machine-id`, value=`manualMachineId`)
- [x] Cancel button → `setManualAuthOpen(false)`
- [x] Import button: disabled when `isImportingManualAuth`, spinner when loading → `handleManualAuthImport()`

## State Management

- [x] `configDraft: CursorConfigDraft` — local form state
- [x] `configDirty: boolean` — tracks uncommitted config changes
- [x] `rawConfigText: string` — raw JSON editor text
- [x] `rawConfigDirty: boolean` — tracks uncommitted raw JSON changes
- [x] `manualAuthOpen: boolean` — dialog visibility
- [x] `manualToken: string` — dialog access token input
- [x] `manualMachineId: string` — dialog machine ID input
- [x] `probeSnapshotKey: string | null` — caches probe state key for staleness detection

## Derived State / Computed Values

- [x] `pristineConfigDraft` — fresh from config (no drafting)
- [x] `effectivePort/AutoStart/GhostMode/Model/OpusModel/SonnetModel/HaikuModel` — draft if dirty else pristine
- [x] `effectiveRawConfigText` — draft text if dirty else stringified rawSettings
- [x] `rawSettingsReady` — boolean
- [x] `rawParseResult` — memoized parseRawSettings result
- [x] `isRawJsonValid` — from parseResult
- [x] `hasChanges` — configDirty || rawConfigDirty
- [x] `canSave` — !rawConfigDirty || (rawSettingsReady && isRawJsonValid)
- [x] `currentProbeSnapshotKey` — built from current status+config
- [x] `visibleProbeResult` — probe shown only when: no changes, snapshot matches current
- [x] `orderedModels` — sorted, deduped, custom prepended if needed
- [x] `canStart` — enabled && authenticated && !token_expired
- [x] `integrationBadge` — enabled/disabled badge

## Handlers / Side Effects

- [x] `handleSaveConfig()` — validates port + model, calls `updateConfigAsync`, clears dirty+probe
- [x] `applyPreset(preset)` — applies model preset with pattern matching logic
- [x] `handleToggleEnabled()` — calls `updateConfigAsync({ enabled })`, clears probe
- [x] `handleAutoDetectAuth()` — calls `autoDetectAuthAsync()`, clears probe
- [x] `handleManualAuthImport()` — validates inputs, calls `importManualAuthAsync()`, clears probe, closes dialog
- [x] `handleStartDaemon()` — calls `startDaemonAsync()`, handles success/error with toast
- [x] `handleStopDaemon()` — calls `stopDaemonAsync()`, handles success/error
- [x] `handleRunProbe()` — guards on hasChanges, calls `runProbeAsync()`, refreshes status, sets snapshot key
- [x] `handleSaveRawSettings()` — validates JSON, calls `saveRawSettingsAsync()`, handles 409 conflict
- [x] `handleSaveAll()` — orchestrates config + raw saves, shows combined toast
- [x] `handleHeaderRefresh()` — clears dirty+probe, refetches all data, resets draft

## API Calls (via useCursor hook)

- [x] GET `/legacy/cursor/status` — `refetchStatus` (polling every 5s)
- [x] GET `/legacy/cursor/settings` — `refetchConfig`
- [x] GET `/legacy/cursor/models` — models + currentModel
- [x] GET `/legacy/cursor/settings/raw` — `refetchRawSettings`
- [x] PUT `/legacy/cursor/settings` — `updateConfigAsync` (enable/disable, save config)
- [x] PUT `/legacy/cursor/settings/raw` — `saveRawSettingsAsync` (with expectedMtime)
- [x] POST `/legacy/cursor/auth/auto-detect` — `autoDetectAuthAsync`
- [x] POST `/legacy/cursor/auth/import` — `importManualAuthAsync` ({ accessToken, machineId })
- [x] POST `/legacy/cursor/daemon/start` — `startDaemonAsync`
- [x] POST `/legacy/cursor/daemon/stop` — `stopDaemonAsync`
- [x] POST `/legacy/cursor/probe` — `runProbeAsync`

## Helper Functions (to be kept in lib/)

- [x] `buildProbeSnapshotKey(status, config)` → string
- [x] `buildConfigDraft(config?)` → CursorConfigDraft
- [x] `pickModelByPatterns(models, patterns, fallback)` → string
- [x] `normalizeModelKey(value)` → string
- [x] `pickModelByAliases(models, aliases, fallback)` → string
- [x] `parseRawSettings(value)` → RawSettingsParseResult

## Section Mapping (for SectionRail)

Given the Tabs structure (Model Config | Settings | Info) and the sidebar panel nature, this page maps to:

| Section ID | Label |
|---|---|
| `models` | Model Config |
| `settings` | Settings |
| `info` | Info |

The page is better served with the **click-to-switch tab fallback** rather than scroll-spy SectionRail, because:
1. The form uses Tabs internally, not a flat scroll
2. Content is visually identical to FormSection tabs
3. Scroll-spy would thrash with only 3 small tab content areas

---

## Section Plan for Rewrite

The rewrite uses FormPane with FormSections instead of Tabs, making it suitable for SectionRail scroll-spy. The sections map naturally:

| Section ID | Content |
|---|---|
| `presets` | Model presets (codex/claude/gemini) |
| `model-mapping` | Default + Opus + Sonnet + Haiku model selectors |
| `runtime-settings` | Port, auto-start, ghost mode |
| `info` | Provider info + file path + available models list |
