# Delegation Guide

Complete workflow for using CCS delegation commands within Claude Code sessions.

## Delegation Commands

**All commands work ONLY inside Claude Code sessions** (not terminal).

### /ccs:glm "task"

Delegate to GLM-4.6 (cost-optimized model).

**Syntax:**
```
/ccs:glm "your task description"
```

**Example:**
```
/ccs:glm "refactor src/auth.js to use async/await instead of callbacks"
/ccs:glm "add unit tests for the UserService class"
/ccs:glm "fix linting errors in packages/api/"
```

**What happens:**
1. Validates GLM profile has valid API key
2. Enhances prompt with context (CWD, files, requirements)
3. Spawns isolated GLM session via `claude -p` (headless mode)
4. Executes task in correct working directory
5. Returns formatted report with files changed

### /ccs:kimi "task"

Delegate to Kimi (optimized for long-context tasks).

**Syntax:**
```
/ccs:kimi "your task description"
```

**Example:**
```
/ccs:kimi "analyze this 10,000 line codebase and document the architecture"
/ccs:kimi "review all test files and identify missing edge cases"
```

**Use when:**
- Task requires reading many files
- Long context needed (>100k tokens)
- Comprehensive codebase analysis

### /ccs:create <model> [--force]

Create custom delegation command for user-defined models.

**Syntax:**
```
/ccs:create <model-name>
/ccs:create <model-name> --force
```

**Example:**
```
/ccs:create gpt4
/ccs:create claude-opus --force
```

**Requirements:**
1. Profile must exist at `~/.ccs/profiles/<model-name>/`
2. Profile must have valid `settings.json` with API key
3. API key must not be placeholder (YOUR_*_API_KEY_HERE)

**What it does:**
1. Validates profile exists and is configured
2. Reads `.claude/commands/ccs-glm.md` template
3. Substitutes "glm" → "<model-name>" throughout
4. Creates `.claude/commands/ccs-<model-name>.md`
5. Confirms creation and shows usage

**--force flag:**
Overwrites existing command if present.

## Working Directory Resolution

Delegation automatically resolves working directory from prompt hints.

**Explicit path:**
```
/ccs:glm "in packages/api, add validation middleware"
→ CWD: packages/api/
```

**File reference:**
```
/ccs:glm "fix src/utils/auth.js"
→ CWD: src/utils/
```

**Monorepo patterns:**
```
/ccs:glm "update packages/web component"
→ CWD: packages/web/
```

**Default:**
If no hints, uses current working directory.

## Result Format

Delegation returns ASCII-boxed report:

```
[i] Delegated to GLM-4.6 (ccs:glm)

╔══════════════════════════════════════╗
║ Working Directory: /path             ║
║ Model: GLM-4.6                        ║
║ Duration: 2.3s                        ║
║ Exit Code: 0                          ║
╚══════════════════════════════════════╝

<task output>

[i] Created Files:
  - tests/auth.test.js

[i] Modified Files:
  - src/auth.js
  - package.json

[OK] Delegation completed successfully
```

**On failure (exit code ≠ 0):**
```
[X] Delegation failed (exit code: 1)

Stderr:
<error messages>

Review output above for details.
```
