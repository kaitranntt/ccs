# Headless Workflow

**Last Updated**: 2025-11-15

CCS delegation uses Claude Code headless mode with enhanced features for token optimization.

## Core Concept

CCS delegation executes tasks via alternative models using enhanced Claude Code headless mode with JSON output, session management, and cost tracking.

**Actual Command:**
```bash
ccs {profile} -p "prompt"
```

Internally executes:
```bash
claude -p "prompt" --settings ~/.ccs/{profile}.settings.json --output-format json --permission-mode acceptEdits --max-turns <auto>
```

**Docs:** https://code.claude.com/docs/en/headless.md

## How It Works

**Workflow:**
1. User: `/ccs:glm "task"` in Claude Code session
2. CCS detects `-p` flag and routes to HeadlessExecutor
3. HeadlessExecutor spawns: `claude -p "task" --settings ~/.ccs/glm.settings.json --output-format json --permission-mode acceptEdits`
4. Claude Code runs headless with GLM profile + enhanced flags
5. Returns JSON with session_id, cost, turns
6. ResultFormatter displays formatted results with metadata

**Enhanced Features:**
- JSON output parsing (`--output-format json`)
- Session persistence (`~/.ccs/delegation-sessions.json`)
- Cost tracking (displays USD cost per execution)
- Auto-determined max-turns (5/10/20 based on complexity)
- Multi-turn session management (resume via session_id)
- File change tracking (created/modified files)
- Formatted ASCII box output

## Profile Settings

**Location:** `~/.ccs/{profile}.settings.json`

**Examples:**
- GLM: `~/.ccs/glm.settings.json`
- Kimi: `~/.ccs/kimi.settings.json`

**Example content:**
```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "your-glm-api-key",
    "ANTHROPIC_MODEL": "glm-4.6"
  }
}
```

## Output Format

**JSON Mode** (automatically enabled):
```json
{
  "type": "result",
  "subtype": "success",
  "total_cost_usd": 0.0025,
  "is_error": false,
  "duration_ms": 1500,
  "duration_api_ms": 1200,
  "num_turns": 3,
  "result": "Task completed successfully",
  "session_id": "abc123def456"
}
```

**Formatted Output** (displayed to user):
```
[i] Delegated to GLM-4.6 (ccs:glm)
╔══════════════════════════════════════════════════════╗
║ Working Directory: /path/to/project                 ║
║ Model: GLM-4.6                                       ║
║ Duration: 1.5s                                       ║
║ Exit Code: 0                                         ║
║ Files Created: 1                                     ║
║ Files Modified: 2                                    ║
║ Session ID: abc123def456                             ║
║ Cost: $0.0025                                        ║
║ Turns: 3                                             ║
╚══════════════════════════════════════════════════════╝

[OK] Delegation completed
```

**Extracted Fields:**
- `session_id` - For multi-turn (--resume)
- `total_cost_usd` - Cost per execution
- `num_turns` - Turn count
- `is_error` - Error flag
- `result` - Task output

**Exit codes:** 0 = success, non-zero = error

## Multi-Turn Sessions

**Start session:**
```bash
ccs glm -p "implement feature"
```

**Continue session:**
```bash
ccs glm:continue -p "add tests"
ccs glm:continue -p "run tests"
```

Via slash commands:
```
/ccs:glm "implement feature"
/ccs:glm:continue "add tests"
```

**Session Storage:** `~/.ccs/delegation-sessions.json`

**Metadata:**
- Session ID
- Total cost (aggregated across turns)
- Turn count
- Last turn timestamp
- Working directory

**Expiration:** ~30 days, auto-cleanup

## Usage Patterns

**Single execution:**
```bash
ccs glm -p "task description"
```

**With options:**
```bash
ccs glm -p "task" --max-turns 10
ccs glm -p "task" --permission-mode plan
```

**Continue session:**
```bash
ccs glm:continue -p "follow-up task"
```

All standard Claude Code headless flags are supported. See: https://code.claude.com/docs/en/headless.md

## Error Handling

**Common errors:**
- `Settings file not found` - Profile not configured (`ccs doctor` to diagnose)
- `Claude CLI not found` - Install Claude Code
- `Invalid API key` - Check profile settings in `~/.ccs/{profile}.settings.json`

**Diagnostics:**
```bash
ccs doctor          # Check configuration
ccs --version       # Show delegation status
```

---

## Related Documentation

**Entry Point**: `../SKILL.md` - Quick start and decision framework
**Decision Guide**: `delegation-guidelines.md` - When to delegate
**Error Recovery**: `troubleshooting.md` - Common issues

**Official Docs**: https://code.claude.com/docs/en/headless.md
