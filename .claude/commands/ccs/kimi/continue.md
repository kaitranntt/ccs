---
description: Continue last Kimi delegation session [AUTO ENHANCE]
argument-hint: [follow-up instruction]
allowed-tools: Read, Grep, Glob, Bash
---

Continue last Kimi delegation session for multi-turn analysis.

**Workflow:**
- Review analysis/work from previous session
- Analyze the follow-up instruction in `$ARGUMENTS`
- **IMPORTANT**: Check if task contains a slash command (e.g., /cook, /plan, /commit)
  - If YES: Preserve slash command at the start, add context after
  - If NO: Enhance normally with context
- Enhance prompt with comprehensive context (findings, scope, deliverables, priority)
- Execute continuation via `ccs kimi:continue -p "$ENHANCED_PROMPT"`

**Slash Command Detection:**
If follow-up contains a slash command, format as: `/command enhanced context`
NOT: "Previous findings: ... Task: /command ..."

**Usage:**
```
/ccs:kimi "analyze all files in src/"
/ccs:kimi:continue "suggest architectural improvements"
/ccs:kimi:continue "/plan for refactoring with phases"
```
