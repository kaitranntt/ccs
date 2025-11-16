---
description: Continue last GLM delegation session
argument-hint: [follow-up prompt]
allowed-tools: Read, Write, Edit, Bash
---

Continue last GLM delegation session with follow-up prompt.

```bash
ccs glm:continue -p "$ARGUMENTS"
```

**Usage:**
```
/ccs:glm "fix typo in README"
/ccs:glm:continue "also update the examples section"
/ccs:glm:continue "run the tests to make sure nothing broke"
```

**Notes:**
- Requires previous session exists (use `/ccs:glm` to start)
- Preserves context from previous turns
- Cost aggregated across all turns
- See `.claude/skills/ccs-delegation/` for delegation guidelines
