---
description: Delegate task to GLM-4.6 (cost-optimized model) [AUTO ENHANCE]
argument-hint: [task description]
allowed-tools: Read, Grep, Glob, Bash
---

Delegate simple, deterministic tasks to GLM-4.6 for token optimization.

**Workflow:**
- Analyze the task description in `$ARGUMENTS`
- Gather context if needed (read files, check structure)
- Enhance prompt with specific details (file paths, context, success criteria)
- Execute delegation via `ccs glm -p "$ENHANCED_PROMPT"`

**Note:** `$ENHANCED_PROMPT` is an enhanced version that adds specifics like file paths, current implementation context, expected behavior, and success criteria. If the task contains a slash command (e.g., /cook, /plan), keep it at the start of the enhanced prompt.

**Usage:**
```
/ccs:glm "refactor auth.js to use async/await"
/ccs:glm "add tests for UserService"
/ccs:glm "/cook create a landing page"
```
