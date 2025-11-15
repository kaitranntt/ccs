---
description: Delegate task to GLM-4.6 model for cost-optimized execution
argument-hint: [task prompt]
allowed-tools: Bash, Read, Task
model: sonnet
---

# /ccs:glm - Delegate to GLM Model

Execute task using cost-optimized GLM-4.6 model via CCS delegation system.

## Your Task

User's delegation request: `$ARGUMENTS`

## Workflow

### Step 1: Enhance Prompt

**CRITICAL**: Never pass raw user input to GLM. Always enhance with context.

```bash
# Get current working directory
CWD=$(pwd)

# Enhance prompt with context
ENHANCED_PROMPT="Task: $ARGUMENTS

Working Directory: $CWD

Requirements:
- Use absolute paths in all responses
- Report all files created/modified
- Clearly indicate WHERE and WHAT was changed
- Follow project standards (read CLAUDE.md if exists)

Success Criteria:
- All changes implemented
- File list reported (created/modified)
- Working directory documented"
```

### Step 2: Invoke Delegation Subagent

Use Task tool to delegate execution:

```typescript
Task({
  subagent_type: "ccs-delegator",
  model: "sonnet",
  description: "Delegating task to GLM-4.6",
  prompt: `You are the CCS delegation executor.

**Profile**: glm
**Enhanced Prompt**:
${ENHANCED_PROMPT}

**Working Directory**: ${CWD}

**Instructions**:
1. Execute task using headless Claude with GLM profile
2. Capture all output
3. Report complete source-of-truth (where/what/files)
4. Format result clearly

Execute now.`
});
```

### Step 3: Format and Display Result

After subagent completes, format the result:

```
[i] Delegated to GLM-4.6 (ccs:glm)
╔══════════════════════════════════════════════════════════════╗
║ Working Directory: /absolute/path/to/project                 ║
║ Model: GLM-4.6                                                ║
║ Duration: 2.3s                                                ║
╚══════════════════════════════════════════════════════════════╝

<delegated task output from subagent>

[OK] Delegation completed

Files Modified:
  - /absolute/path/to/file1.js
  - /absolute/path/to/file2.ts

Files Created:
  - /absolute/path/to/newfile.test.js
```

## Error Handling

### Delegation Execution Failure

If delegation execution fails (profile not configured, network issues, etc.):

```
[X] Delegation failed: <error message>

Common causes:
  - GLM profile not configured (run: ccs doctor)
  - Invalid API key in ~/.ccs/profiles/glm/settings.json
  - Network connectivity issues
  - API rate limiting

Setup GLM profile:
  1. Configure with: ccs --setup glm
  2. Or manually edit: ~/.ccs/profiles/glm/settings.json
  3. Get API key: https://open.bigmodel.cn/usercenter/apikeys

Fallback: Execute directly with main Claude session
```

## Usage Examples

**Simple refactoring**:
```
/ccs:glm "refactor the parseConfig function in utils.js for better readability"
```

**Add tests**:
```
/ccs:glm "add unit tests for the authentication module in src/auth/auth.ts"
```

**Fix typo**:
```
/ccs:glm "fix typos in README.md"
```

**Documentation**:
```
/ccs:glm "add JSDoc comments to all functions in lib/helpers.js"
```

## Notes

- **Cost optimization**: GLM is cheaper than main Claude, use for simple tasks
- **Token savings**: Delegation keeps main context clean
- **Non-blocking**: Fails gracefully if profile not configured
- **Explicit**: Results clearly show GLM was used
- **Enhancement**: Prompts are enriched with context automatically
- **Source of truth**: Results show exactly where/what was changed

## Related

- Kimi delegation: `/ccs:kimi` for long-context tasks
- Custom models: `/ccs:create <model>` to add more delegation targets
- Health check: `ccs doctor` to verify delegation setup
- Configuration: `~/.ccs/profiles/glm/settings.json`
