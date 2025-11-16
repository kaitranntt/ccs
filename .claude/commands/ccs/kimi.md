---
description: Delegate task to Kimi (long-context model)
argument-hint: [task prompt]
allowed-tools: Read, Write, Edit, Bash
---

Delegate long-context tasks to Kimi for multi-file analysis.

```bash
ccs kimi -p "$ARGUMENTS"
```

**Usage:**
```
/ccs:kimi "analyze all files in src/ and document architecture"
/ccs:kimi "review entire project structure and suggest improvements"
/ccs:kimi "find all deprecated API usages across codebase"
```

**Notes:**
- Optimized for long-context tasks (>5 files)
- Supports multi-turn sessions (use `/ccs:kimi:continue` for follow-ups)
- Profile: `~/.ccs/kimi.settings.json`
- See `.claude/skills/ccs-delegation/` for delegation guidelines
