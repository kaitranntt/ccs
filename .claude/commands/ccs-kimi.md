---
description: Delegate task to Kimi model for long-context tasks
argument-hint: [task prompt]
allowed-tools: Bash, Read, Task
model: sonnet
---

# /ccs:kimi - Delegate to Kimi Model

Execute task using Kimi model for long-context scenarios via CCS delegation system.

## Your Task

User's delegation request: `$ARGUMENTS`

## Workflow

### Step 1: Validate Kimi Profile

**CRITICAL**: Before delegation, validate Kimi setup.

```bash
# Check if delegation validator exists
if [[ -f bin/utils/delegation-validator.js ]]; then
  # Run validation (will output JSON result)
  node bin/utils/delegation-validator.js kimi
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

**CRITICAL**: Never pass raw user input to Kimi.

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
- Leverage long-context capabilities for comprehensive analysis

Success Criteria:
- All changes implemented
- File list reported (created/modified)
- Working directory documented
- Long-context analysis utilized where beneficial"
```

**Note**: In production, use `PromptEnhancer` class from `bin/utils/prompt-enhancer.js`

### Step 3: Invoke Delegation Subagent

Use Task tool to delegate execution:

```typescript
Task({
  subagent_type: "ccs-delegator",
  model: "sonnet",
  description: "Delegating task to Kimi",
  prompt: `You are the CCS delegation executor.

**Profile**: kimi
**Enhanced Prompt**:
${ENHANCED_PROMPT}

**Working Directory**: ${CWD}

**Instructions**:
1. Execute task using headless Claude with Kimi profile
2. Leverage long-context capabilities
3. Capture all output
4. Report complete source-of-truth (where/what/files)
5. Format result clearly

Execute now.`
});
```

### Step 4: Format and Display Result

After subagent completes, format the result:

```
[i] Delegated to Kimi (ccs:kimi)
╔══════════════════════════════════════════════════════════════╗
║ Working Directory: /absolute/path/to/project                 ║
║ Model: Kimi                                                   ║
║ Duration: 3.1s                                                ║
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

If Kimi profile validation fails:

```
[X] Kimi delegation not configured

Profile settings missing or invalid API key detected.

Setup Instructions:
  1. Ensure profile directory exists:
     mkdir -p ~/.ccs/profiles/kimi

  2. Copy base settings:
     cp config/base-kimi.settings.json ~/.ccs/profiles/kimi/settings.json

  3. Edit settings file:
     Edit ~/.ccs/profiles/kimi/settings.json

  4. Set your Kimi API key:
     Replace ANTHROPIC_AUTH_TOKEN value

  5. Get API key:
     https://platform.moonshot.cn/console/api-keys

After setup, try delegation again:
  /ccs:kimi "your task here"
```

### Delegation Execution Failure

If subagent execution fails:

```
[X] Delegation failed: <error message>

Possible causes:
  - Network connectivity issues
  - API rate limiting
  - Invalid Kimi API key

Suggestions:
  - Verify API key in ~/.ccs/profiles/kimi/settings.json
  - Check network connection
  - Retry with: /ccs:kimi "your task here"
  - Or execute directly with main Claude
```

## Usage Examples

**Long document analysis**:
```
/ccs:kimi "analyze all files in src/components/ and create comprehensive documentation"
```

**Multi-file refactoring**:
```
/ccs:kimi "refactor the entire authentication module across all files in src/auth/"
```

**Codebase-wide search**:
```
/ccs:kimi "find all usages of deprecated API and suggest migration path"
```

**Comprehensive review**:
```
/ccs:kimi "review the entire project structure and suggest improvements"
```

## Notes

- **Long context**: Kimi excels at tasks requiring analysis of many files
- **Token capacity**: Can handle larger codebases than GLM
- **Use cases**: Documentation, multi-file refactoring, codebase analysis
- **Validation**: Always checks API key before delegation
- **Enhancement**: Prompts are enriched with context automatically
- **Source of truth**: Results show exactly where/what was changed

## When to Use Kimi vs GLM

**Use Kimi for**:
- Tasks involving >5 files
- Comprehensive codebase analysis
- Long documentation generation
- Multi-module refactoring
- Pattern detection across files

**Use GLM for**:
- Single file modifications
- Simple refactoring
- Unit test creation
- Documentation updates
- Quick fixes

## Related

- GLM delegation: `/ccs:glm` for simple tasks
- Custom models: `/ccs:create <model>` to add more delegation targets
- Configuration: `~/.ccs/delegation-rules.json`
- Validation: `bin/utils/delegation-validator.js`
- Enhancement: `bin/utils/prompt-enhancer.js`
