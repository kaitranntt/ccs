# Claude Extension Page — Phase 4 Catalogue

Exhaustive inventory of every UI element, flow, API call, and side effect in `ui/src/pages/claude-extension.tsx` (1118 LOC).

## Utility Functions (file-level)

- [x] `EMPTY_BINDINGS` — stable empty array reference to prevent render thrash
- [x] `BindingDraft` interface — local form state shape (`name`, `profile`, `host`, `ideSettingsPath`, `notes`)
- [x] `createEmptyDraft(profile)` — create default blank draft with a given profile
- [x] `bindingToDraft(binding)` — project a saved `ClaudeExtensionBinding` into draft form
- [x] `normalizeBindingDraft(draft)` — trim + strip empty optionals before API call
- [x] `isPlainStatusActive(status)` — returns true when `status.state === 'applied'`
- [x] `formatPathForDisplay(value)` — insert zero-width spaces after path separators

## Shared Sub-components (file-local)

- [x] `StatusBadge({ state })` — colored `<Badge>` variant for `applied | drifted | missing | unconfigured`
- [x] `DetailRow({ label, value, mono?, copyValue? })` — two-column label/value grid row; path variant shows monospace block + `CopyButton`
- [x] `CodeBlockCard({ title, description, value })` — card wrapping a `<pre>` code block with a copy button in the header
- [x] `TargetStatusCard(...)` — card showing file path, file presence, status message, apply+reset buttons; used for both shared and IDE targets
- [x] `BindingListItem({ binding, isSelected, onSelect })` — clickable binding row in the left panel list

## Hooks / API Calls

- [x] `useClaudeExtensionOptions()` — fetch profile list + host list
- [x] `useClaudeExtensionBindings()` — fetch all saved bindings
- [x] `useClaudeExtensionSetup(profile, host)` — fetch generated JSON payloads + env + warnings + notes for current draft
- [x] `useClaudeExtensionBindingStatus(id?)` — fetch live file state for both shared and IDE targets
- [x] `useCreateClaudeExtensionBinding()` — POST new binding
- [x] `useUpdateClaudeExtensionBinding()` — PATCH existing binding
- [x] `useDeleteClaudeExtensionBinding()` — DELETE binding
- [x] `useApplyClaudeExtensionBinding()` — POST apply action for `shared | ide | all`
- [x] `useResetClaudeExtensionBinding()` — POST reset action for `shared | ide | all`

## State Variables

- [x] `isCreating: boolean` — true when creating new; false when editing existing
- [x] `selectedBindingId: string | null` — id of the binding being viewed/edited; null = auto-select first
- [x] `draft: BindingDraft` — local form state (name, profile, host, ideSettingsPath, notes)

## Derived State

- [x] `creating` — `isCreating || bindings.length === 0`
- [x] `selectedBinding` — resolved from `selectedBindingId` or auto-first if not creating
- [x] `effectiveSelectedBindingId` — `selectedBinding?.id ?? null`
- [x] `currentDraft` — draft when creating/editing, or bindingToDraft(selectedBinding) for view mode
- [x] `selectedHost` — host object for `currentDraft.host`
- [x] `selectedProfile` — profile object for `currentDraft.profile`
- [x] `activeError` — first non-null error across options/bindings/setup/status queries
- [x] `bindingCountLabel` — `"N saved"` string for badge
- [x] `isSaving` — createBinding or updateBinding pending
- [x] `isBusyShared` — apply/reset pending for `shared` target
- [x] `isBusyIde` — apply/reset pending for `ide` target
- [x] `canPersist` — name.trim + profile.trim both non-empty
- [x] `hiddenEnvCount` — env entries beyond first 6
- [x] `envPreview` — first 6 env entries

## Event Handlers

- [x] `startCreateMode()` — sets isCreating=true, clears selectedBindingId, resets draft to empty
- [x] `handleSave()` — if editing existing: updateBinding.mutateAsync; if creating: createBinding.mutateAsync; updates state from result
- [x] `handleDelete()` — window.confirm gate, deleteBinding.mutateAsync, then selects next binding or enters create mode
- [x] `updateDraft(key, value)` — generic draft field updater; if viewing (not creating + no selectedBindingId), transitions to edit mode first
- [x] `runBindingAction(target, action)` — guard on effectiveSelectedBindingId, calls applyBinding or resetBinding mutate

## Left Panel (348px / xl:372px sidebar)

### Header
- [x] Sparkles icon in rounded bordered box
- [x] Page title `t('claudeExtensionPage.title')`
- [x] Subtitle `'Saved IDE bindings for CCS profiles'`
- [x] `bindingCountLabel` badge (secondary variant)
- [x] `selectedHost.label` badge (outline variant) — conditional
- [x] `New` button (Plus icon) → `startCreateMode()`

### Binding Editor Card
- [x] Dynamic title: `'Create binding'` vs `'Binding editor'` based on `creating`
- [x] Fixed description about save-once-then-apply workflow
- [x] **Name field** — `<Input>` bound to `currentDraft.name` via `updateDraft('name', ...)`
  - Placeholder: `'VS Code · work profile'`
- [x] **CCS Profile select** — `<Select>` bound to `currentDraft.profile` via `updateDraft('profile', ...)`
  - Options: `profiles[]` each showing `label (profileType)`
  - Helper text: `selectedProfile.description` or default hint
- [x] **IDE Host select** — `<Select>` bound to `currentDraft.host` via `updateDraft('host', ...)`
  - Options: `hosts[]` each showing `host.label`
- [x] **IDE Settings Path input** — `<Input>` bound to `currentDraft.ideSettingsPath`
  - Placeholder: `selectedHost.defaultSettingsPath` or fallback text
  - Helper text referencing `selectedHost.label`
- [x] **Notes input** — `<Input>` bound to `currentDraft.notes`
  - Placeholder: optional reminder text
- [x] **Save/Create button** (flex-1, Save/Loader2 icon) — `handleSave()`, disabled when `!canPersist || isSaving`
  - Label changes: `'Create'` vs `'Save'`
- [x] **Reset form button** (outline) → `startCreateMode()`
- [x] **Delete binding button** (outline, text-destructive, Trash2 icon) — conditional: hidden when `creating`, calls `handleDelete()`; disabled while `deleteBinding.isPending`

### Saved Bindings List
- [x] Section label `'Saved bindings'` (muted, uppercase)
- [x] `bindings.map` → `<BindingListItem>` with selection state; click → setIsCreating(false), setSelectedBindingId, setDraft
- [x] Empty state card (dashed border) when `bindings.length === 0`

## Right Panel (flex-1 main content)

### Content Header
- [x] `selectedProfile` badge (outline) — conditional
- [x] `selectedHost` badge (outline) — conditional
- [x] `'Draft'` badge (secondary) — shown when `creating`
- [x] `'In Sync'` badge (emerald-600) — shown when both shared + IDE targets `state === 'applied'`
- [x] Heading: `selectedBinding.name` or default `'Claude extension binding'`
- [x] Description text
- [x] **Verify button** (RefreshCw / Loader2 icon) — `statusQuery.refetch()`; disabled when `creating || statusQuery.isFetching`
- [x] **Copy persist command button** — `<CopyButton>` with `setup.sharedSettings.command`; conditional on `setup`

### Error Banner
- [x] `activeError` card (destructive border, AlertTriangle icon) — shown when any query errors

### Tabs (hidden entirely when `activeError` is set)
#### Overview Tab
- [x] `TargetStatusCard` for shared Claude settings
  - status: `status.sharedSettings`
  - Apply/Reset labels, handlers, disabled/busy flags
- [x] `TargetStatusCard` for IDE settings.json
  - title: `${selectedHost.label || 'IDE'} settings.json`
  - status: `status.ideSettings`
- [x] **Resolved Binding card** (wider xl column)
  - DetailRow: Profile, Profile type, IDE host, IDE path mode (custom vs default), Effective IDE path (copyable), Persist command, Notes (conditional)
- [x] **Managed Payload card** (narrower xl column)
  - Env badges preview (first 6) + `+N more` badge
  - Info block: env count when non-empty vs native defaults message
  - **Apply both targets** button + **Reset both targets** button — conditional on `!creating`
  - Draft placeholder block when `creating`
- [x] **Warnings card** — conditional (`setup && setup.warnings.length > 0 || setup.notes.length > 0`)
  - Per-warning AlertTriangle row
  - Empty state text
- [x] **Notes card** — companion to Warnings card
  - Per-note ShieldCheck row
  - Empty state text

#### Advanced Tab
- [x] **Shared Claude settings JSON** `<CodeBlockCard>` — `setup.sharedSettings.json`
- [x] **IDE settings JSON** `<CodeBlockCard>` — `setup.ideSettings.json`; title uses `selectedHost.label`
- [x] **Resolved environment payload** card — copy button in header, full JSON pre block or empty state
- [x] **Shared target metadata** card — Target path (copyable), Command, Current state
- [x] **IDE target metadata** card — Target path (copyable), Settings key, Current state
- [x] No-setup placeholder card (Settings2 icon) — shown when `!setup`

---

## Section Boundaries (for SectionRail)

Proposed 5 sections mapped to FormSections:

| id | Label | Content |
|----|-------|---------|
| `binding-editor` | Binding | Name/profile/host/path/notes form + save/delete |
| `saved-bindings` | Saved | Binding list |
| `targets` | Targets | TargetStatusCard × 2 (shared + IDE) |
| `resolved` | Resolved | Resolved Binding card + Managed Payload card |
| `diagnostics` | Diagnostics | Warnings + Notes cards |
| `advanced` | Advanced | CodeBlockCards + env payload + metadata cards |

> **Architecture decision:** The page uses a sidebar+main split layout (left binding editor, right content panes). This maps to the existing bespoke layout rather than the standard 3-pane ConfigLayout, since the left panel serves as both the form AND the list panel simultaneously. The rewrite preserves the visual architecture while extracting into composed sub-components.
