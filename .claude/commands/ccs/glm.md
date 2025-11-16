---
description: Delegate task to GLM-4.6 (cost-optimized model) [AUTO ENHANCE]
argument-hint: [task description]
allowed-tools: Read, Grep, Glob, Bash
---

Delegate simple, deterministic tasks to GLM-4.6 for token optimization.

**Workflow:**
- Analyze the task description in `$ARGUMENTS`
- **IMPORTANT**: Check if task contains a slash command (e.g., /cook, /plan, /commit)
  - If YES: Preserve slash command at the start, add context after
  - If NO: Enhance normally with context
- Gather context if needed (read files, check structure)
- Execute delegation via `ccs glm -p "$ENHANCED_PROMPT"`

**Slash Command Detection:**
If `$ARGUMENTS` contains a slash command like "/cook create landing page":
- Extract the command: `/cook`
- Enhance the rest: "create landing page with HTML/CSS/JS in /home/user/project"
- Format as: `/cook create landing page with HTML/CSS/JS in /home/user/project`
- NOT: "You are in /home/user/project. Task: /cook create landing page"

**Usage:**
```
/ccs:glm "refactor auth.js to use async/await"
/ccs:glm "add tests for UserService"
/ccs:glm "/cook create a landing page"
```
