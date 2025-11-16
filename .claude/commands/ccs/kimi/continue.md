---
description: Continue last Kimi delegation session
argument-hint: [follow-up prompt]
allowed-tools: Read, Write, Edit, Bash
---

Continue last Kimi delegation session with follow-up prompt.

```bash
ccs kimi:continue -p "$ARGUMENTS"
```

**Usage:**
```
/ccs:kimi "analyze all files in src/"
/ccs:kimi:continue "now suggest architectural improvements"
/ccs:kimi:continue "create a migration plan"
```

**Notes:**
- Requires previous session exists (use `/ccs:kimi` to start)
- Preserves context from previous turns
- Cost aggregated across all turns
- See `.claude/skills/ccs-delegation/` for delegation guidelines
