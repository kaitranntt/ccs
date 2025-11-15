# Phase 2: Slash Commands & Subagents

## Context Links

- **Parent Plan**: [plan.md](plan.md)
- **Dependencies**: Phase 1 (validation, prompt enhancement)
- **Research**: [researcher-01-current-implementation.md](research/researcher-01-current-implementation.md)

## Overview

**Date**: 2025-11-15
**Description**: Implement `/ccs:glm`, `/ccs:kimi` slash commands + ccs-delegator subagent
**Priority**: P0 (Critical - core delegation interface)
**Implementation Status**: ⏳ Not Started (blocked by Phase 1)
**Review Status**: ⏳ Awaiting User Review

## Key Insights

- Colon namespace (`:`) enables clean per-model commands
- Slash commands invoke subagent which handles delegation
- Subagent has full Claude functionality (reads CLAUDE.md, uses tools)
- Commands are user-defined in `.claude/commands/`, NOT ccs-managed

## Requirements

### Functional

1. **/ccs:glm Slash Command**
   - Accept arbitrary prompt string
   - Validate GLM profile configured
   - Enhance prompt before delegation
   - Invoke ccs-delegator subagent with enhanced prompt
   - Display formatted result

2. **/ccs:kimi Slash Command**
   - Same structure as `/ccs:glm`
   - Use kimi profile
   - Handle long-context scenarios

3. **ccs-delegator Subagent**
   - Specialized for executing delegated tasks
   - Reads CLAUDE.md from project
   - Operates in delegated CWD
   - Reports full source-of-truth results

### Non-Functional

- Commands feel native to Claude workflow
- Error messages follow CCS format (ASCII only)
- Results clearly show delegation occurred
- Fast startup (<2s overhead)

## Architecture

```
.claude/
├── commands/
│   ├── ccs-glm.md                   # NEW: /ccs:glm slash command
│   └── ccs-kimi.md                  # NEW: /ccs:kimi slash command
└── agents/
    └── ccs-delegator.md             # NEW: Delegation subagent
```

### Slash Command Structure: ccs-glm.md

```markdown
---
description: Delegate task to GLM-4.6 model for execution
argument-hint: [task prompt]
allowed-tools: Task, Bash, Read, Grep, Glob, Edit, Write
model: sonnet
---

# /ccs:glm - Delegate to GLM Model

Execute task using cost-optimized GLM-4.6 model.

## Your Task

Parse user input: `$ARGUMENTS`

## Workflow

1. **Validate GLM Setup**
   - Check ~/.ccs/profiles/glm/settings.json exists
   - Verify API key configured (not default)
   - If validation fails, show error with setup instructions

2. **Enhance Prompt**
   - Capture current working directory
   - Enrich prompt with context:
     - Working directory
     - Absolute path requirements
     - Source-of-truth reporting requirements

3. **Invoke Delegation Subagent**
   - Use Task tool with subagent_type: "ccs-delegator"
   - Pass enhanced prompt
   - Pass profile: "glm"
   - Pass cwd: (current working directory)

4. **Format Result**
   ```
   [i] Delegated to GLM-4.6 (ccs:glm)
   ╔══════════════════════════════════════╗
   ║ Working Directory: /path/to/project  ║
   ║ Model: GLM-4.6                        ║
   ╚══════════════════════════════════════╝

   <delegated task output>

   [OK] Delegation completed
   ```

## Error Handling

If validation fails:
- Show clear error message
- Suggest: `Edit ~/.ccs/profiles/glm/settings.json`
- Suggest: Set ANTHROPIC_AUTH_TOKEN to your Z.AI API key

## Notes

- Never pass raw user prompt to GLM
- Always enhance with context
- Report delegation explicitly
```

### Subagent: ccs-delegator.md

```markdown
---
name: ccs-delegator
description: Executes delegated tasks in isolated GLM/Kimi session
allowed-tools: Bash, Read, Grep, Glob, Edit, Write, WebFetch
default-model: sonnet
---

# CCS Delegator Subagent

Specialized subagent for executing tasks delegated to alternative models (GLM, Kimi).

## Your Role

Execute delegated task using headless Claude CLI with specified profile.

## Inputs (from parent agent)

- **enhanced_prompt**: Enriched task description
- **profile**: Model profile to use (glm, kimi, custom)
- **cwd**: Working directory for execution

## Workflow

1. **Change Directory**
   ```bash
   cd "<absolute_cwd_path>"
   ```

2. **Execute via Headless Mode**
   ```bash
   # Single-turn headless execution
   claude -p "<enhanced_prompt>" --settings ~/.ccs/profiles/<profile>/settings.json
   ```

3. **Capture Output**
   - Capture stdout/stderr
   - Parse for file modifications
   - Extract source-of-truth data

4. **Report Results**
   Format:
   - Working Directory: <path>
   - Files Modified: <list>
   - Files Created: <list>
   - Exit Code: <code>
   - Output: <full output>

## Error Handling

If headless execution fails:
- Report error clearly
- Include exit code
- Suggest retrying with main Claude

## Notes

- You have full Claude functionality
- Can read CLAUDE.md from project
- Operate within delegated CWD
- Report complete source-of-truth
```

## Related Code Files

**Existing Files to Remove**:
- `.claude/commands/ccs.md` (old implementation)
- `.claude/skills/ccs-delegation/` (old skill)

**New Files to Create**:
- `.claude/commands/ccs-glm.md` (200 lines)
- `.claude/commands/ccs-kimi.md` (200 lines)
- `.claude/agents/ccs-delegator.md` (150 lines)

**Integration Points**:
- Uses Phase 1: delegation-validator.js
- Uses Phase 1: prompt-enhancer.js

## Implementation Steps

1. **Remove old .claude/ implementation**
   - Delete `.claude/commands/ccs.md`
   - Delete `.claude/skills/ccs-delegation/`
   - Commit removal separately

2. **Create ccs-glm.md**
   - Implement full slash command logic
   - Add validation step (uses delegation-validator)
   - Add prompt enhancement (uses prompt-enhancer)
   - Add Task tool invocation
   - Add result formatting

3. **Create ccs-kimi.md**
   - Copy structure from ccs-glm.md
   - Adjust for kimi profile
   - Update descriptions

4. **Create ccs-delegator.md subagent**
   - Implement CWD handling (cd to absolute path)
   - Implement headless execution
   - Implement output parsing
   - Implement result reporting

5. **Test slash commands**
   - Test /ccs:glm with simple prompt
   - Test /ccs:kimi with simple prompt
   - Test validation error paths
   - Test result formatting

## Todo List

- [ ] Remove .claude/commands/ccs.md
- [ ] Remove .claude/skills/ccs-delegation/
- [ ] Create .claude/commands/ccs-glm.md
- [ ] Create .claude/commands/ccs-kimi.md
- [ ] Create .claude/agents/ccs-delegator.md
- [ ] Test /ccs:glm with valid prompt
- [ ] Test /ccs:glm with invalid GLM setup
- [ ] Test /ccs:kimi with valid prompt
- [ ] Test CWD handling in monorepo
- [ ] Test result format parsing
- [ ] Verify CLAUDE.md reading in subagent
- [ ] Document slash commands in README

## Success Criteria

- ✓ `/ccs:glm "task"` executes successfully
- ✓ `/ccs:kimi "task"` executes successfully
- ✓ Validation catches default API keys
- ✓ Prompts are enhanced before delegation
- ✓ Results show working directory
- ✓ Results list all modified/created files
- ✓ CWD handling works in monorepos
- ✓ Subagent reads CLAUDE.md correctly
- ✓ Error messages are clear and actionable

## Risk Assessment

**MEDIUM RISK**: Slash command format (colon namespace)

**Mitigation**:
- Test colon namespace support in Claude
- Fallback to `/ccs-glm` if needed
- Document naming convention

**LOW RISK**: Subagent implementation (proven pattern)

## Security Considerations

1. **Command Injection**
   - Sanitize enhanced_prompt before passing to bash
   - Never execute raw user input directly

2. **CWD Validation**
   - Validate CWD is within allowed paths
   - Prevent path traversal attacks

3. **API Key Exposure**
   - Subagent never logs API keys
   - Error messages don't leak credentials

## Next Steps

1. User approves slash command design
2. Remove old .claude/ implementation
3. Create new slash commands
4. Create ccs-delegator subagent
5. Integration test full workflow
6. Move to Phase 3 (headless execution refinement)
