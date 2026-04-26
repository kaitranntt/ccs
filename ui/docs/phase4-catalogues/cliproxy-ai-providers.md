# Phase 4 Catalogue — cliproxy-ai-providers page

Full inventory of every UI element, state, interaction, and API call in the original 1825-LOC monolith.

---

## Page-level state

- [x] `data` — full AI providers response (families + source) from `useCliproxyAiProviders`
- [x] `error` — load error (shows error card)
- [x] `isLoading` — loading skeleton (left-rail + content skeleton)
- [x] `isFetching` — spinner on refresh button
- [x] `createMutation` — via `useCreateCliproxyAiProviderEntry`
- [x] `updateMutation` — via `useUpdateCliproxyAiProviderEntry`
- [x] `deleteMutation` — via `useDeleteCliproxyAiProviderEntry`
- [x] `dialogOpen` — ProviderEntryDialog open/close
- [x] `editingEntry` — AiProviderEntryView | null (null = create mode)
- [x] `deleteEntry` — AiProviderEntryView | null (null = hidden)
- [x] `selectedEntryId` — entry selection within a family
- [x] `selectedFamily` — derived from URL search param `?family=<familyId>`
- [x] URL sync via `useLocation` + `useNavigate` (family selection persists in URL)

---

## API calls / mutations

- [x] `api.cliproxy.aiProviders.list()` — GET providers list
- [x] `api.cliproxy.aiProviders.create(family, data)` — POST new entry
- [x] `api.cliproxy.aiProviders.update(family, entryId, data)` — PUT/PATCH entry
- [x] `api.cliproxy.aiProviders.delete(family, entryId)` — DELETE entry
- [x] `refetch()` — explicit refresh after mutation

---

## Left-rail sidebar

- [x] Brand strip: "CLIProxy Plus" title + "AI Providers" subtitle + Zap icon
- [x] Refresh button (ghost icon, spins when `isFetching`)
- [x] Primary CTA: "Create Connector" or "Add {displayName} Entry" (context-sensitive label)
- [x] Section label: "Provider Families"
- [x] `FamilyRail` — scrollable list of provider families (with logo, name, entry count badge, auth mode badge, status icon)
- [x] `FamilyRail` selection: navigates URL to `?family=<id>`
- [x] `ProxyStatusWidget` — bottom of rail
- [x] Footer summary: "{N} families · {N} ready"

---

## Family Rail items (5 families)

- [x] `gemini-api-key` — Gemini
- [x] `codex-api-key` — Codex
- [x] `claude-api-key` — Claude (API key)
- [x] `vertex-api-key` — Vertex
- [x] `openai-compatibility` — OpenAI compatible connectors

---

## Main content header (per selected family)

- [x] `ProviderLogo` — family logo (lg size)
- [x] Family display name (h2)
- [x] Status badge (ready/partial/empty) — color-coded
- [x] Auth mode badge (uppercase)
- [x] Route path badge (monospace)
- [x] Family description (xs text)
- [x] Refresh button (ghost, spins on `isFetching`)
- [x] "Control Panel" navigation button
- [x] "API Profiles" navigation button (with ExternalLink icon)

---

## Entry list area (when family has entries)

- [x] Section label: "Saved entries" / "Saved entry"
- [x] Entries count badge + secrets count badge
- [x] Multi-entry selector: horizontal cards (when > 1 entry)
  - [x] Entry label
  - [x] `EntrySecretBadge` (Configured / Missing secret)
  - [x] Base URL or route path (truncated)
  - [x] Routing mode badge
  - [x] Model rules summary badge
  - [x] Header count badge
  - [x] Active selection: border-primary/30 bg-primary/5
- [x] Single-entry display card (when exactly 1 entry): same badges but non-clickable

---

## Entry Inspector (right 2-pane split: config form | raw JSON)

### Config/Info tabs (left sub-pane)

- [x] Entry header: label, EntrySecretBadge, authMode badge, routePath badge, source label badge
- [x] Action buttons: Reset (disabled when no changes), Remove (opens ConfirmDialog), Save (disabled when invalid/unchanged)
- [x] Tabs: "Config" (SlidersHorizontal icon) | "Info & Usage" (Info icon)

### Config tab

- [x] Workspace presets card
  - [x] "Minimal setup" preset button (clears optional fields)
  - [x] "Clear routing noise" preset button (clears proxy/prefix/headers/excluded)
  - [x] Summary cards: Secret status, Model Rules summary, Advanced count
- [x] Missing required fields banner (amber)
- [x] Connection section (KeyRound icon):
  - [x] API Key field (password input) — for non-openai-compatibility families
    - [x] Placeholder: masked key or "Paste provider API key"
    - [x] Helper: preserve stored or enter new
  - [x] Connector Name field — openai-compatibility only
  - [x] API Keys textarea — openai-compatibility only (one key per line)
  - [x] Base URL input — all families, different placeholder per family
  - [x] Proxy URL input — non-openai-compatibility only
  - [x] Prefix input — non-openai-compatibility only
- [x] Model rules section (Workflow icon):
  - [x] Mapped model count badge
  - [x] Direct model count badge
  - [x] Model aliases textarea (requested=upstream format)
  - [x] Validation error display (destructive color)
- [x] Advanced routing section (SlidersHorizontal icon):
  - [x] Active count badge
  - [x] Headers textarea
  - [x] Excluded Models textarea — non-openai-compatibility only
  - [x] Info note for openai-compatibility (no excluded models)

### Info & Usage tab

- [x] "How this route behaves" card (Route icon): 3 context-sensitive behavior bullets
- [x] "When API Profiles fits better" card — family-specific profile boundary text
- [x] "Editing rule of thumb" card — 3 family-specific edit prompts with hints

### Raw JSON pane (right sub-pane)

- [x] Header: "Raw configuration" + target server info
- [x] Tabs: "Raw Entry Config" (Code2 icon) | "settings.json Preview" (FileJson2 icon)
- [x] Raw Entry Config tab:
  - [x] Secret masking notice (when secretConfigured)
  - [x] JSON validation error banner (destructive)
  - [x] `CodeEditor` component (editable, bidirectional sync with form)
  - [x] `handleRawJsonChange`: parses draft from JSON, syncs form fields
- [x] settings.json Preview tab:
  - [x] `CodeEditor` (readonly) — derived settings.json preview
  - [x] `GlobalEnvIndicator` — shows env vars that would be set
- [x] Bidirectional sync: form changes → JSON, JSON changes → form (if valid)
- [x] `hasChanges` detection (compares derived JSON to initial)
- [x] `canSave` = isRawJsonValid && no missing required && no model errors && hasChanges

---

## Empty state (when family has no entries)

- [x] Setup status card (top): routePath, status badge, entries/secrets summary cards, info note
- [x] `EmptyEntryWorkspace`:
  - [x] "Set up {displayName}" heading + description
  - [x] Primary CTA: "Create connector" or "Add {displayName} entry"
  - [x] Recommended setup flow card:
    - [x] "Do this first" section with family-specific required steps
    - [x] "Only if needed" section with optional steps
  - [x] "Need the other pages?" card with Control Panel + API Profiles buttons
  - [x] What this route does card: routePath + authMode badges + family-specific summary bullets
  - [x] When API Profiles fits better card

---

## Dialogs

- [x] `ProviderEntryDialog` — create or edit provider entry (full-screen dialog)
  - [x] Key prop: `${selectedFamily}:${editingEntry?.id ?? 'new'}:${dialogOpen ? 'open' : 'closed'}` (forces remount on each open)
  - [x] Shared by create (editingEntry=null) and edit (editingEntry set) flows
  - [x] `onSubmit`: creates or updates entry, closes dialog, refetches
- [x] `ConfirmDialog` — delete confirmation
  - [x] Title: "Remove provider entry?"
  - [x] Description includes entry label + family name
  - [x] Confirm text: "Remove" (destructive)
  - [x] `onConfirm`: deleteMutation → clears deleteEntry state

---

## Loading / error states

- [x] Loading: 2-column skeleton (left rail + main content)
- [x] Error (API fail or no data): centered error card with AlertCircle icon, error message, Retry + Control Panel + API Profiles buttons
- [x] `isFetching`: spinner on header refresh button + rail refresh button

---

## Per-family business logic

### Family guide text (getFamilyGuide) — per family ID

- [x] `gemini-api-key` — requiredNow, optionalLater, emptyStateSummary, profileBoundary, editPrompts
- [x] `codex-api-key` — same shape
- [x] `claude-api-key` — same shape
- [x] `vertex-api-key` — same shape
- [x] `openai-compatibility` — same shape (connector-specific fields)

### EntryEditorDraft shape

- [x] `name` — connector name (openai-compatibility only)
- [x] `baseUrl`
- [x] `proxyUrl` — non-openai-compatibility only
- [x] `prefix` — non-openai-compatibility only
- [x] `headersText` — newline-delimited "Key: Value"
- [x] `excludedModelsText` — newline-delimited model IDs (non-openai-compatibility only)
- [x] `modelAliasesText` — requested=upstream format
- [x] `apiKey` — single key (non-openai-compatibility)
- [x] `apiKeysText` — multi-key (openai-compatibility only)

### Payload builders

- [x] `buildEntryPayload` — converts draft → API payload (preserveSecrets logic)
- [x] `buildEntryConfigRecord` — converts draft → raw config JSON shape
- [x] `parseEntryConfigDraft` — parses raw JSON → draft (bidirectional sync)
- [x] `buildSettingsPreview` — derives settings.json preview from draft
- [x] `buildHeaderRecord` / `buildRawConfigModelArray` / `buildExcludedModelsArray` — field parsers
- [x] `parseDelimitedLines` / `parseKeyValueLines` / `parseModelAliasLines` — text parsers
- [x] `formatHeaders` / `formatExcludedModels` / `formatModelAliases` / `formatRawConfigModelArray`

### Model rules

- [x] `parseRequestedUpstreamModelRules` (from lib/provider-config)
- [x] `formatRequestedUpstreamModelRules`
- [x] `getRequestedUpstreamModelRuleErrors` — validation
- [x] `getMappedModelCount` / `getDirectModelCount` / `renderModelRuleSummary`

### Routing mode

- [x] `getRoutingMode(entry)` — Proxy override | Prefixed route | Direct upstream | Default runtime

---

## Utility / helper components (defined inline in monolith)

- [x] `SummaryCard` — label/value/hint card
- [x] `EntrySecretBadge` — Configured / Missing secret badge
- [x] `SetupStepSection` — numbered step list with badge
- [x] `EntryEditorField` — label + helper wrapper for form inputs
- [x] `EntryEditorTextArea` — styled textarea
- [x] `getFamilyStatusBadge` — ready/partial/empty → className + label
- [x] `getRoutingMode` — entry → routing label
- [x] `getMappedModelCount` / `getDirectModelCount` / `renderModelRuleSummary`

---

## Privacy / security notes

- API keys shown as `type="password"` inputs
- Stored secrets shown as `<stored in CLIProxy>` placeholder
- `STORED_SECRET_PLACEHOLDER` constant prevents accidental transmission
- `preserveSecrets` flag tells API not to overwrite existing secrets when form left blank

---

## Section boundary map (for FormPane decomposition)

1. **Overview** — workspace presets, summary cards, missing required fields banner
2. **Connection** — API key / connector name, API keys (multi), base URL, proxy URL, prefix
3. **Model Rules** — model aliases textarea, validation errors
4. **Advanced Routing** — headers, excluded models
5. **Info & Usage** (separate tab) — route behavior, profile boundary, edit prompts

---

*Last updated: 2026-04-25 | Author: fullstack-developer agent*
