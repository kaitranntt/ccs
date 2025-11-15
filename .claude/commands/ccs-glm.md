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

### Step 1: Validate GLM Profile

**CRITICAL**: Before delegation, validate GLM setup.

```bash
# Check if delegation validator exists
if [[ -f bin/utils/delegation-validator.js ]]; then
  # Run validation (will output JSON result)
  node bin/utils/delegation-validator.js glm
else
  echo "[X] Delegation system not initialized"
  echo "Run: npm install to set up CCS delegation"
  exit 1
fi
```

**Handle validation result**:
- If validation fails, show error message with setup instructions
- Do NOT proceed with delegation if validation fails
- Error message should include exact path to settings file

### Step 2: Enhance Prompt

**CRITICAL**: Never pass raw user input to GLM.

Use prompt enhancer to add context:

```bash
# Get current working directory
CWD=$(pwd)

# Enhance prompt (simplified - real implementation uses Node.js module)
ENHANCED_PROMPT="Task: $ARGUMENTS

Working Directory: $CWD

Requirements:
- Use absolute paths in all responses
- Report all files created/modified
- Clearly indicate WHERE and WHAT was changed
- Follow project standards (read CLAUDE.md)

Success Criteria:
- All changes implemented
- File list reported (created/modified)
- Working directory documented"
```

**Note**: In production, use `PromptEnhancer` class from `bin/utils/prompt-enhancer.js`

### Step 3: Invoke Delegation Subagent

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

### Step 4: Format and Display Result

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

### Validation Failure

If GLM profile validation fails:

```
[X] GLM delegation not configured

Profile settings missing or invalid API key detected.

Setup Instructions:
  1. Ensure profile directory exists:
     mkdir -p ~/.ccs/profiles/glm

  2. Copy base settings:
     cp config/base-glm.settings.json ~/.ccs/profiles/glm/settings.json

  3. Edit settings file:
     Edit ~/.ccs/profiles/glm/settings.json

  4. Set your Z.AI API key:
     Replace ANTHROPIC_AUTH_TOKEN value

  5. Get API key:
     https://open.bigmodel.cn/usercenter/apikeys

After setup, try delegation again:
  /ccs:glm "your task here"
```

### Delegation Execution Failure

If subagent execution fails:

```
[X] Delegation failed: <error message>

Possible causes:
  - Network connectivity issues
  - API rate limiting
  - Invalid GLM API key

Suggestions:
  - Verify API key in ~/.ccs/profiles/glm/settings.json
  - Check network connection
  - Retry with: /ccs:glm "your task here"
  - Or execute directly with main Claude
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
- **Explicit**: Results clearly show GLM was used
- **Validation**: Always checks API key before delegation
- **Enhancement**: Prompts are enriched with context automatically
- **Source of truth**: Results show exactly where/what was changed

## Related

- Kimi delegation: `/ccs:kimi` for long-context tasks
- Custom models: `/ccs:create <model>` to add more delegation targets
- Configuration: `~/.ccs/delegation-rules.json`
- Validation: `bin/utils/delegation-validator.js`
- Enhancement: `bin/utils/prompt-enhancer.js`
