---
description: Delegate task to Kimi (long-context model) [AUTO ENHANCE]
argument-hint: [task description]
allowed-tools: Read, Grep, Glob, Bash
---

Delegate long-context, multi-file tasks to Kimi for comprehensive analysis.

**Workflow:**
- Analyze the task description in `$ARGUMENTS`
- **IMPORTANT**: Check if task contains a slash command (e.g., /cook, /plan, /commit)
  - If YES: Preserve slash command at the start, add context after
  - If NO: Enhance normally with context
- Gather context across multiple files/directories
- Execute delegation via `ccs kimi -p "$ENHANCED_PROMPT"`

**Slash Command Detection:**
If `$ARGUMENTS` contains a slash command like "/plan for new feature":
- Extract the command: `/plan`
- Enhance the rest: "for new feature across src/ files in /home/user/project"
- Format as: `/plan for new feature across src/ files in /home/user/project`
- NOT: "You are in /home/user/project. Task: /plan for new feature"

**Usage:**
```
/ccs:kimi "analyze all files in src/ and document architecture"
/ccs:kimi "find all deprecated API usages across codebase"
/ccs:kimi "/plan for authentication system"
```
