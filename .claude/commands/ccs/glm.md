---
description: Delegate task to GLM-4.6 (cost-optimized model)
argument-hint: [task prompt]
allowed-tools: Read, Write, Edit, Bash
---

Delegate simple, deterministic tasks to GLM-4.6 for token optimization.

```bash
ccs glm -p "$ARGUMENTS"
```

**Usage:**
```
/ccs:glm "refactor auth.js to use async/await"
/ccs:glm "add unit tests for UserService"
/ccs:glm "fix typos in README.md"
```

**Notes:**
- Supports multi-turn sessions (use `/ccs:glm:continue` for follow-ups)
- Profile: `~/.ccs/glm.settings.json`
- See `.claude/skills/ccs-delegation/` for delegation guidelines
