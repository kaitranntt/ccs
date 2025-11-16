---
description: Continue last GLM delegation session [AUTO ENHANCE]
argument-hint: [follow-up instruction]
allowed-tools: Read, Grep, Glob, Bash
---

Continue last GLM delegation session for iterative refinement.

**Workflow:**
- Review what was accomplished in previous session
- Analyze the follow-up instruction in `$ARGUMENTS`
- **IMPORTANT**: Check if task contains a slash command (e.g., /cook, /plan, /commit)
  - If YES: Preserve slash command at the start, add context after
  - If NO: Enhance normally with context
- Enhance prompt with context (reference files, incomplete tasks, next steps)
- Execute continuation via `ccs glm:continue -p "$ENHANCED_PROMPT"`

**Slash Command Detection:**
If follow-up contains a slash command, format as: `/command enhanced context`
NOT: "Previous work: ... Task: /command ..."

**Usage:**
```
/ccs:glm "fix typo in README"
/ccs:glm:continue "also update the examples section"
/ccs:glm:continue "/commit with descriptive message"
```
