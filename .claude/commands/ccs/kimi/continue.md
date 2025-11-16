---
description: Continue last Kimi delegation session [AUTO ENHANCE]
argument-hint: [follow-up instruction]
allowed-tools: Read, Grep, Glob, Bash
---

Continue last Kimi delegation session for multi-turn analysis.

**Workflow:**
- Review analysis/work from previous session
- Analyze the follow-up instruction in `$ARGUMENTS`
- Enhance prompt with comprehensive context (findings, scope, deliverables, priority)
- Execute continuation via `ccs kimi:continue -p "$ENHANCED_PROMPT"`

**Note:** `$ENHANCED_PROMPT` is an enhanced version that references previous findings, specifies next scope, and adds actionable deliverables with priorities. If the follow-up contains a slash command (e.g., /plan), keep it at the start of the enhanced prompt.

**Usage:**
```
/ccs:kimi "analyze all files in src/"
/ccs:kimi:continue "suggest architectural improvements"
/ccs:kimi:continue "/plan for refactoring with phases"
```
