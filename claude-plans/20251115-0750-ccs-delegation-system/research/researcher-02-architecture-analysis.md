# Research Report: CCS Architecture & Integration Points

**Date**: 2025-11-15
**Researcher**: 02
**Scope**: Codebase architecture for delegation integration

## System Architecture Overview

### Platform Support (3 Implementations)

1. **Node.js** (`bin/ccs.js`): Primary, supports GLMT proxy
2. **Bash** (`lib/ccs`): Unix shell, no GLMT support
3. **PowerShell** (`lib/ccs.ps1`): Windows, no GLMT support

**Critical**: All three must have feature parity (delegation in all)

### Profile Management System

**Two Profile Types**:

1. **Settings-based** (backward compat):
   - Defined in `~/.ccs/config.json`
   - Uses `--settings` flag
   - Models: glm, glmt, kimi, default
   - File: `~/.ccs/<profile>.settings.json`

2. **Account-based** (multi-account):
   - Defined in `~/.ccs/profiles.json`
   - Uses `CLAUDE_CONFIG_DIR` env var
   - Instance isolation in `~/.ccs/instances/<profile>/`
   - Separate sessions/logs/todos per account

### Shared Data Architecture

**Symlinked Directories** (from `~/.ccs/shared/`):
- `commands/` - Custom slash commands
- `skills/` - Agent skills
- `agents/` - Custom subagents

**Per-Instance Data**:
- `settings.json` - Profile-specific settings
- `session-env/` - Session state
- `todos/` - Todo lists
- `logs/` - Debug logs

### Profile Detection Logic (Critical for Delegation)

**Priority Order** (in `detect_profile_type()`):
1. Check settings-based profiles (`config.json`)
2. Check account-based profiles (`profiles.json`)
3. Return error if not found

**Special Case**: "default" profile
- First checks account-based default
- Falls back to settings-based default
- Finally uses Claude's own defaults

## Integration Points for Delegation

### 1. Validation Layer

**Location**: New module `bin/utils/delegation-validator.js`

**Checks**:
- Profile exists in `~/.ccs/profiles/<profile>/settings.json`
- API key != "YOUR_GLM_API_KEY_HERE" (default placeholder)
- File permissions (readable)

### 2. Prompt Enhancement Layer

**Location**: New module `bin/utils/prompt-enhancer.js`

**Inputs**:
- User's raw prompt
- Current working directory
- File context (optional)
- Task scope metadata

**Outputs**:
- Enhanced prompt with:
  - Absolute paths
  - Detailed requirements
  - Success criteria
  - Working directory context

### 3. Headless Execution Layer

**Location**: New module `bin/delegation/headless-executor.js`

**Invocation**:
```javascript
const { spawn } = require('child_process');
const claudeCli = detectClaudeCli();
const settingsPath = `~/.ccs/profiles/${profile}/settings.json`;

spawn(claudeCli, ['-p', enhancedPrompt, '--settings', settingsPath], {
  stdio: 'inherit',
  cwd: targetWorkingDirectory
});
```

**Key**: Single-turn headless mode via `-p` flag

### 4. Delegation Rules Engine

**Location**: `~/.ccs/delegation-rules.json`

**Structure**:
```json
{
  "enabled": true,
  "mode": "manual",
  "rules": {
    "keywords": ["simple", "refactor", "add tests"],
    "file_patterns": ["*.test.js", "*.spec.ts"],
    "max_tokens": 4000
  }
}
```

**Integration**: Read on startup, cache in memory

### 5. Result Formatter

**Location**: New module `bin/delegation/result-formatter.js`

**Format**:
```
[i] Delegated to GLM-4.6 (ccs:glm)
╔══════════════════════════════════════╗
║ Working Directory: /path/to/project  ║
║ Files Modified: 3                     ║
║ Files Created: 1                      ║
╚══════════════════════════════════════╝

<GLM output here>

[OK] Delegation completed (2.3s, 450 tokens)
```

## Critical Constraints

1. **NO_COLOR respect**: All formatters check `NO_COLOR` env var
2. **ASCII only**: Use `[i]`, `[OK]`, `[X]` (no emojis)
3. **Cross-platform**: Node.js/Bash/PowerShell parity
4. **Non-invasive**: Never modify `~/.claude/settings.json`
5. **Idempotent**: All operations safe to re-run

## Recommended Architecture

```
bin/
├── delegation/
│   ├── headless-executor.js      # Spawns claude -p
│   ├── result-formatter.js       # Formats output
│   └── delegation-engine.js      # Rule-based decision
├── utils/
│   ├── delegation-validator.js   # API key + profile checks
│   └── prompt-enhancer.js        # Prompt enrichment
.claude/
├── commands/
│   ├── ccs-glm.md                # /ccs:glm slash command
│   ├── ccs-kimi.md               # /ccs:kimi slash command
│   └── ccs-create.md             # /ccs:create slash command
└── agents/
    └── ccs-delegator.md          # Subagent for auto-delegation
~/.ccs/
└── delegation-rules.json         # User config
```

## Monorepo CWD Handling

**Problem**: User works in monorepo, delegation must respect scope

**Solution**:
1. Capture CWD when slash command invoked
2. Parse prompt for explicit paths
3. If relative path detected, resolve against CWD
4. Pass absolute CWD to headless executor via `cwd` option
5. Include CWD in enhanced prompt: "You are working in /path/to/scope"

**Example**:
```javascript
const targetCwd = resolveDelegationCwd(userPrompt, process.cwd());
spawn(claudeCli, [...], { cwd: targetCwd });
```
