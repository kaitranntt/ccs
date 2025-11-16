---
description: Delegate task to Kimi (long-context model) [AUTO ENHANCE]
argument-hint: [task description]
allowed-tools: Read, Grep, Glob, Bash
---

Delegate long-context, multi-file tasks to Kimi for comprehensive analysis.

**Workflow:**
- Analyze the task description in `$ARGUMENTS`
- Gather context across multiple files/directories
- Enhance prompt with comprehensive details (structure, relationships, scope)
- Execute delegation via `ccs kimi -p "$ENHANCED_PROMPT"`

**Note:** `$ENHANCED_PROMPT` is an enhanced version that adds directory structures, cross-file relationships, architecture context, and deliverables. If the task contains a slash command (e.g., /plan, /commit), keep it at the start of the enhanced prompt.

**Usage:**
```
/ccs:kimi "analyze all files in src/ and document architecture"
/ccs:kimi "find all deprecated API usages across codebase"
/ccs:kimi "/plan for authentication system"
```
