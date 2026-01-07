# CCS Code Standards

Last Updated: 2026-01-06

Code standards, modularization patterns, and conventions for the CCS codebase.

---

## Core Principles

### YAGNI (You Aren't Gonna Need It)
- No features "just in case"
- Only implement what is currently needed
- Delete unused code rather than commenting it out

### KISS (Keep It Simple, Stupid)
- Prefer simple solutions over clever ones
- Reduce complexity at every opportunity
- Use established patterns over custom implementations

### DRY (Don't Repeat Yourself)
- One source of truth for configuration
- Extract common logic into shared utilities
- Use barrel exports to centralize imports

---

## File Organization

### Directory Structure Rules

1. **Domain-based organization**: Group files by business domain, not by file type
2. **Barrel exports required**: Every directory must have an `index.ts` aggregating exports
3. **Flat within depth**: Keep nesting to 3 levels maximum
4. **Co-location**: Keep related files together (component + hooks + utils)

### File Naming Conventions

| Convention | Example | When to Use |
|------------|---------|-------------|
| kebab-case | `cliproxy-executor.ts` | All TypeScript/TSX files |
| kebab-case | `profile-detector.ts` | Multi-word file names |
| PascalCase | `BinaryManager` | Class exports only |
| camelCase | `detectProfile` | Function exports |

**File names should be descriptive**: LLMs should understand the file's purpose from its name alone without reading content.

### Correct Examples

```
src/cliproxy/binary-manager.ts      # Binary management logic
src/commands/doctor-command.ts      # Doctor CLI command handler
ui/src/components/cliproxy/provider-editor/index.tsx
```

### Incorrect Examples

```
src/utils/helper.ts                 # Too vague
src/cliproxy/manager.ts             # Which manager?
ui/src/components/Editor.tsx        # Not kebab-case
```

---

## File Size Limit: 200 Lines

**Target**: All code files should be under 200 lines.

**Exceptions** (with justification):
- Data files (model-pricing.ts, model-catalog.ts)
- Entry points with routing logic (ccs.ts)
- Complex transformation logic that cannot be meaningfully split

### Why 200 Lines?

1. **Context efficiency**: LLMs process smaller files faster
2. **Single responsibility**: Forces focused, testable modules
3. **Navigation**: Easier to scan and understand
4. **Maintainability**: Reduces merge conflicts

### When Files Exceed 200 Lines

If a file grows beyond 200 lines:

1. **Identify extraction candidates**:
   - Helper functions that could be utilities
   - Constants and type definitions
   - Subcomponents within React components
   - Related logic that forms a cohesive unit

2. **Create subdirectory structure**:
   ```
   # Before
   provider-editor.tsx (921 lines)

   # After
   provider-editor/
   ├── index.tsx           # Main component (200 lines)
   ├── model-mapping-form.tsx
   ├── endpoint-config.tsx
   ├── auth-section.tsx
   ├── hooks.ts
   ├── types.ts
   └── utils.ts
   ```

3. **Preserve public API**: Main export remains the same through barrel export

---

## Barrel Export Pattern

### What is a Barrel Export?

An `index.ts` file that aggregates and re-exports module contents:

```typescript
// src/cliproxy/index.ts

// Types (with explicit type keyword)
export type { PlatformInfo, BinaryInfo } from './types';

// Functions
export { detectPlatform } from './platform-detector';
export { BinaryManager } from './binary-manager';

// From subdirectories
export * from './auth';
export * from './services';
```

### Rules for Barrel Exports

1. **Every domain directory must have `index.ts`**
2. **Export types with `export type`** for tree-shaking
3. **Re-export subdirectories** for deep access
4. **Keep barrel exports flat** - no logic, only exports

### Import Patterns

```typescript
// CORRECT: Import from domain barrel
import { execClaudeWithCLIProxy, CLIProxyProvider } from '../cliproxy';
import { Config, Settings } from '../types';

// INCORRECT: Import from specific file (bypasses barrel)
import { execClaudeWithCLIProxy } from '../cliproxy/cliproxy-executor';
```

### Exception: Deep Imports

Allowed when:
- Importing private utilities not exposed in barrel
- Circular dependency avoidance
- Performance-critical tree-shaking

---

## Monster File Splitting Methodology

When splitting large files (500+ lines), follow this process:

### Step 1: Analyze Structure

Identify logical boundaries:
- Render sections in React components
- Handler groups in route files
- Related utility functions
- Constants and types

### Step 2: Extract Types First

```typescript
// types.ts
export interface ProviderEditorProps {
  providerId: string;
  onSave: (config: ProviderConfig) => void;
}

export interface ModelMappingValues {
  model: string;
  endpoint: string;
}
```

### Step 3: Extract Utilities

```typescript
// utils.ts
export function validateEndpoint(url: string): boolean { ... }
export function formatModelName(name: string): string { ... }
```

### Step 4: Extract Hooks

```typescript
// hooks.ts
export function useProviderConfig(providerId: string) { ... }
export function useModelValidation() { ... }
```

### Step 5: Extract Subcomponents

```typescript
// model-mapping-form.tsx
export function ModelMappingForm({ values, onChange }: Props) { ... }
```

### Step 6: Compose in Index

```typescript
// index.tsx
import { ModelMappingForm } from './model-mapping-form';
import { useProviderConfig } from './hooks';
import type { ProviderEditorProps } from './types';

export function ProviderEditor({ providerId, onSave }: ProviderEditorProps) {
  const config = useProviderConfig(providerId);
  return (
    <div>
      <ModelMappingForm values={config.mapping} onChange={...} />
    </div>
  );
}

// Re-export types for consumers
export type { ProviderEditorProps, ModelMappingValues } from './types';
```

---

## TypeScript Standards

### Strict Mode Required

All projects use TypeScript strict mode:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### Type Annotations

```typescript
// CORRECT: Explicit return types for public functions
export function detectProfile(args: string[]): DetectedProfile { ... }

// CORRECT: Inferred types for internal functions
const formatName = (name: string) => name.trim().toLowerCase();

// INCORRECT: any type
function processData(data: any) { ... }  // Use unknown or proper type
```

### Type Exports

```typescript
// CORRECT: Use type keyword for type-only exports
export type { Config, Settings } from './config';

// CORRECT: Group type exports in barrel
export type {
  PlatformInfo,
  BinaryInfo,
  DownloadProgress,
} from './types';
```

---

## ESLint Rules (Enforced)

| Rule | Level | Notes |
|------|-------|-------|
| `@typescript-eslint/no-unused-vars` | error | Ignore `_` prefix |
| `@typescript-eslint/no-explicit-any` | error | Use proper types |
| `@typescript-eslint/no-non-null-assertion` | error | No `!` assertions |
| `prefer-const` | error | Immutable by default |
| `no-var` | error | Use const/let |
| `eqeqeq` | error | Strict equality |
| `react-hooks/*` | recommended | (UI only) |

---

## Terminal Output Standards

### ASCII Only

```typescript
// CORRECT
console.log('[OK] Operation successful');
console.log('[!] Warning message');
console.log('[X] Error occurred');
console.log('[i] Information');

// INCORRECT - NO EMOJIS
console.log('Operation successful');  // NO
console.log('Warning message');       // NO
```

### Color Handling

```typescript
import { colors } from '../utils/ui';

// Colors are TTY-aware and respect NO_COLOR
console.log(colors.green('[OK]') + ' Operation successful');
```

### Box Borders

Use ASCII box drawing for error displays:

```
+=====================================+
|  [X] ERROR: Configuration failed    |
|                                     |
|  Details: Unable to parse config    |
+=====================================+
```

---

## React Component Standards (UI)

### Component Structure

```typescript
// component-name.tsx

// 1. Imports (grouped: react, external, internal, relative)
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useProfiles } from '@/hooks';
import { formatName } from './utils';
import type { ComponentProps } from './types';

// 2. Types (if not in separate file)
interface Props {
  id: string;
  onSave: () => void;
}

// 3. Component
export function ComponentName({ id, onSave }: Props) {
  // Hooks first
  const profiles = useProfiles();
  const [state, setState] = useState(null);

  // Handlers
  const handleClick = () => { ... };

  // Render
  return ( ... );
}
```

### Naming Conventions

| Item | Convention | Example |
|------|------------|---------|
| Component files | kebab-case.tsx | `provider-editor.tsx` |
| Component exports | PascalCase | `ProviderEditor` |
| Hook files | use-*.ts | `use-profiles.ts` |
| Hook exports | useCamelCase | `useProfiles` |
| Utility files | kebab-case.ts | `path-utils.ts` |
| Utility exports | camelCase | `formatPath` |

---

## Input State Persistence Patterns

When building forms and editors that allow users to make changes, follow these patterns to prevent data loss.

### Pattern 1: Key-Based Remounting

**Use when**: Component has complex local state that should reset on prop changes.

```typescript
// Parent component
<ProfileEditor
  key={profileId}  // Forces remount when profile changes
  profileId={profileId}
  onSave={handleSave}
/>
```

**Why**: Without `key`, React reuses the component instance. Local `useState` values persist even when props change, causing stale data bugs.

### Pattern 2: Unsaved Changes Confirmation

**Use when**: User might navigate away while editing.

```typescript
// Parent tracks dirty state
const [editorHasChanges, setEditorHasChanges] = useState(false);
const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);

// Child notifies parent of dirty state
useEffect(() => {
  onHasChangesUpdate?.(computedHasChanges);
}, [computedHasChanges, onHasChangesUpdate]);

// Intercept navigation
const handleSelect = (id: string) => {
  if (editorHasChanges && currentId !== id) {
    setPendingSwitch(id);  // Show confirmation dialog
  } else {
    setCurrentId(id);
  }
};
```

**Flow**:
1. Child computes `hasChanges` from local state vs saved data
2. Child notifies parent via callback
3. Parent intercepts navigation when dirty
4. Show confirmation dialog: "Discard & Switch" or "Cancel"
5. On confirm: reset dirty state, then switch

### Pattern 3: Auto-Save with Visual Feedback

**Use when**: Simple inputs that should save immediately.

```typescript
const [saved, setSaved] = useState(false);

const handleBlur = async () => {
  if (value !== savedValue) {
    await saveToBackend(value);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }
};

return (
  <div className="flex items-center gap-2">
    <Input value={value} onChange={...} onBlur={handleBlur} />
    {saved && (
      <span className="text-green-600 text-xs flex items-center gap-1">
        <Check className="w-3.5 h-3.5" /> Saved
      </span>
    )}
  </div>
);
```

**When to use which**:
| Scenario | Pattern |
|----------|---------|
| Complex multi-field editor | Pattern 2 (confirmation dialog) |
| Simple single input | Pattern 3 (auto-save + feedback) |
| List item selection | Pattern 1 (key-based remount) + Pattern 2 |

---

## Quality Gates

### Pre-Commit Sequence

```bash
# Main project
bun run format
bun run lint:fix
bun run validate

# UI project (if changed)
cd ui
bun run format
bun run lint:fix
bun run validate
```

### Validate Runs

| Project | Command | Checks |
|---------|---------|--------|
| Main | `bun run validate` | typecheck + lint + format:check + test |
| UI | `bun run validate` | typecheck + lint + format:check |

---

## Conventional Commits

All commits must follow conventional commit format:

```
<type>(<scope>): <description>
```

### Types

| Type | When to Use | Version Bump |
|------|-------------|--------------|
| `feat` | New feature | MINOR |
| `fix` | Bug fix | PATCH |
| `perf` | Performance | PATCH |
| `docs` | Documentation | None |
| `style` | Formatting | None |
| `refactor` | Code restructure | None |
| `test` | Tests | None |
| `chore` | Maintenance | None |

### Examples

```bash
# Correct
git commit -m "feat(cliproxy): add OAuth token refresh"
git commit -m "fix(doctor): handle missing config gracefully"
git commit -m "refactor(ui): split provider-editor into modules"

# Incorrect - REJECTED
git commit -m "added new feature"
git commit -m "Fixed bug"
```

---

## Anti-Patterns to Avoid

### 1. God Files

```typescript
// BAD: One file doing everything
// src/utils.ts (2000 lines with mixed concerns)

// GOOD: Split by domain
// src/utils/ui/colors.ts
// src/utils/ui/boxes.ts
// src/utils/shell-executor.ts
// src/utils/config-manager.ts
```

### 2. Barrel Import Bypass

```typescript
// BAD: Direct import bypassing barrel
import { detectPlatform } from '../cliproxy/platform-detector';

// GOOD: Import from domain barrel
import { detectPlatform } from '../cliproxy';
```

### 3. Inline Everything

```typescript
// BAD: Huge inline functions in components
function Component() {
  const handleComplexOperation = () => {
    // 100 lines of logic...
  };
}

// GOOD: Extract to hooks or utilities
function Component() {
  const { handleComplexOperation } = useComplexOperation();
}
```

### 4. Type Duplication

```typescript
// BAD: Same types defined in multiple files
// file1.ts
interface Config { ... }
// file2.ts
interface Config { ... }

// GOOD: Single source of truth
// types/config.ts
export interface Config { ... }
```

### 5. Config Priority Pattern

When resolving configuration from multiple sources, follow this priority order:

```typescript
// proxy-config-resolver.ts pattern
// Priority: CLI flags > Environment variables > config.yaml > defaults

const resolved = {
  ...DEFAULT_CONFIG,                    // 4. Defaults (lowest)
  ...yamlConfig,                        // 3. config.yaml
  ...envConfig,                         // 2. Environment variables
  ...cliFlags,                          // 1. CLI flags (highest)
};
```

This pattern is used in:
- `src/cliproxy/proxy-config-resolver.ts` - Remote proxy config
- `src/config/unified-config-loader.ts` - Main config loading

---

## Related Documentation

- [Codebase Summary](./codebase-summary.md) - Full directory structure
- [System Architecture](./system-architecture.md) - Architecture diagrams
- [CLAUDE.md](../CLAUDE.md) - AI-facing development guidance
