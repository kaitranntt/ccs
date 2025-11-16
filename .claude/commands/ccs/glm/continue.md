---
description: Continue last GLM delegation session [AUTO ENHANCE]
argument-hint: [follow-up instruction]
allowed-tools: Read, Grep, Glob, Bash
---

Continue last GLM delegation session for iterative refinement.

**Workflow:**
- Review what was accomplished in previous session
- Analyze the follow-up instruction in `$ARGUMENTS`
- Enhance prompt with context (reference files, incomplete tasks, next steps)
- Execute continuation via `ccs glm:continue -p "$ENHANCED_PROMPT"`

**Note:** `$ENHANCED_PROMPT` is an enhanced version that references previous work, highlights incomplete tasks, and adds specific validation criteria.

**Usage:**
```
/ccs:glm "fix typo in README"
/ccs:glm:continue "also update the examples section"
/ccs:glm:continue "run the tests to verify"
```
