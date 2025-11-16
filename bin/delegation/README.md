# CCS Delegation Module

Enhanced Claude Code delegation system for multi-model task delegation.

## Files

### Core Components
- **headless-executor.js** (405 lines) - Main executor, spawns `claude -p` with enhanced features
- **session-manager.js** (156 lines) - Session persistence and cost tracking
- **settings-parser.js** (88 lines) - Parse tool restrictions from settings
- **result-formatter.js** (326 lines) - Terminal output formatting

**Total**: 975 lines (down from 1,755 lines - 44% reduction)

## Features

### Enhanced Headless Execution
- Stream-JSON output parsing (`--output-format stream-json`)
- Real-time tool use visibility in TTY
- Permission mode acceptEdits (`--permission-mode acceptEdits`)
- Tool restrictions from `.claude/settings.local.json`
- Multi-turn session management (`--resume <session-id>`)
- Time-based limits (10 min default timeout with graceful termination)
- Cost tracking and aggregation

### Session Management
- Persistence: `~/.ccs/delegation-sessions.json`
- Resume via `/ccs:glm:continue` and `/ccs:kimi:continue`
- Auto-cleanup expired sessions (>30 days)
- Cost aggregation across turns

### Settings
- Profile location: `~/.ccs/{profile}.settings.json`
- Examples: `glm.settings.json`, `kimi.settings.json`, `glmt.settings.json`
- Tool restrictions from `.claude/settings.local.json`

## Usage

### Basic Delegation
```javascript
const { HeadlessExecutor } = require('./headless-executor');

const result = await HeadlessExecutor.execute('glm', 'Refactor auth.js', {
  cwd: '/path/to/project',
  outputFormat: 'stream-json',
  permissionMode: 'acceptEdits',
  timeout: 600000  // 10 minutes
});

console.log(result.sessionId);  // For multi-turn
console.log(result.totalCost);  // Cost in USD
console.log(result.content);    // Result text
```

### Multi-Turn Sessions
```javascript
// Start session
const result1 = await HeadlessExecutor.execute('glm', 'Implement feature');
const sessionId = result1.sessionId;

// Continue session
const result2 = await HeadlessExecutor.execute('glm', 'Add tests', {
  resumeSession: true
});

// Or with specific session ID
const result3 = await HeadlessExecutor.execute('glm', 'Run tests', {
  sessionId: sessionId
});
```

### Tool Restrictions
Create `.claude/settings.local.json`:
```json
{
  "permissions": {
    "allow": ["Bash(git:*)", "Read", "Edit"],
    "deny": ["Bash(rm:*)", "Bash(sudo:*)"]
  }
}
```

Automatically applied as CLI flags:
```bash
--allowedTools "Bash(git:*)" "Read" "Edit" \
--disallowedTools "Bash(rm:*)" "Bash(sudo:*)"
```

## Slash Commands

The delegation system is invoked via simple slash commands in `.claude/commands/ccs/`:

### Basic Commands
- `/ccs:glm "task"` - Delegate to GLM-4.6
- `/ccs:kimi "task"` - Delegate to Kimi (long-context)

### Multi-Turn Commands
- `/ccs:glm:continue "follow-up"` - Resume last GLM session
- `/ccs:kimi:continue "follow-up"` - Resume last Kimi session

Each command directly invokes:
```bash
claude -p "$ARGUMENTS" \
  --settings ~/.ccs/{profile}.settings.json \
  --output-format stream-json \
  --permission-mode acceptEdits
```

## Debug Mode

```bash
export CCS_DEBUG=1
```

Enables verbose logging:
- Permission mode selection
- Session resumption details
- Tool restrictions parsing
- CLI args construction
- Session persistence events

## Testing

```bash
# Run all delegation tests
node tests/unit/delegation/json-output.test.js
node tests/unit/delegation/permission-mode.test.js
node tests/unit/delegation/session-manager.test.js
node tests/unit/delegation/settings-parser.test.js
node tests/unit/delegation/max-turns.test.js
node tests/unit/delegation/result-formatter.test.js
```

**Test Coverage:**
- JSON output parsing (6 tests)
- Permission modes (11 tests)
- Session management (7 tests)
- Settings parser (6 tests)
- Auto max-turns (14 tests)
- Result formatting (14 tests)
- **Total: 58 tests**

## Architecture

```
User → SlashCommand (/ccs:glm)
  → Directly invokes: claude -p
    → HeadlessExecutor (monitors execution)
      → SessionManager (load last session)
      → SettingsParser (tool restrictions)
      → Parse JSON response
      → SessionManager (store/update)
      → ResultFormatter.format()
  → Display to user
```

**Key Simplification**: Slash commands invoke `claude -p` directly. No intermediate delegation engine or rule system - just direct headless execution with enhanced features.

## File Permissions

All files should be `644` (rw-r--r--):
```bash
chmod 644 bin/delegation/*.js
```

## Dependencies

- Node.js 14+
- Claude CLI installed and in PATH
- Profile settings configured in `~/.ccs/{profile}.settings.json`

## Migration from Legacy System

**Removed components** (as of 2025-11-15):
- ~~delegation-engine.js~~ - Rule-based decision engine (unused)
- ~~cwd-resolver.js~~ - Working directory resolution (unused)
- ~~rules-schema.js~~ - Schema validation (unused)
- ~~delegation-rules.json~~ - Configuration file (not created)

**Why removed**: Current slash commands directly invoke `claude -p` without intermediate orchestration. The delegation engine, CWD resolver, and rules schema were designed for a more complex system that was never fully integrated.

**Result**: 44% code reduction (1,755 → 975 lines) with same functionality.

## References

- Official docs: https://code.claude.com/docs/en/headless.md
- Skill: `.claude/skills/ccs-delegation/`
- Commands: `.claude/commands/ccs/`
- Tests: `tests/unit/delegation/`
