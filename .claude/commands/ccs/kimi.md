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

### Step 1: Enhance Prompt

**CRITICAL**: Never pass raw user input to Kimi. Always enhance with context.

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
- Leverage long-context capabilities for comprehensive analysis

Success Criteria:
- All changes implemented
- File list reported (created/modified)
- Working directory documented
- Long-context analysis utilized where beneficial"
```

### Step 2: Invoke Delegation Subagent

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

### Step 3: Format and Display Result

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

### Delegation Execution Failure

If delegation execution fails (profile not configured, network issues, etc.):

```
[X] Delegation failed: <error message>

Common causes:
  - Kimi profile not configured (run: ccs doctor)
  - Invalid API key in ~/.ccs/profiles/kimi/settings.json
  - Network connectivity issues
  - API rate limiting

Setup Kimi profile:
  1. Configure with: ccs --setup kimi
  2. Or manually edit: ~/.ccs/profiles/kimi/settings.json
  3. Get API key: https://platform.moonshot.cn/console/api-keys

Fallback: Execute directly with main Claude session
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
- **Non-blocking**: Fails gracefully if profile not configured
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
- Health check: `ccs doctor` to verify delegation setup
- Configuration: `~/.ccs/profiles/kimi/settings.json`
