---
description: Continue last Kimi delegation session [AUTO ENHANCE]
argument-hint: [follow-up instruction]
allowed-tools: Read, Grep, Glob, Bash
---

Continue last Kimi delegation session with enhanced follow-up prompt.

## Workflow

1. **Review** analysis/work from previous session
2. **Analyze** the follow-up instruction in `$ARGUMENTS`
3. **Enhance prompt** with comprehensive context:
   - Reference previous findings
   - Specify next analysis scope
   - Add actionable deliverables
   - Include priority/ordering
4. **Continue** session with enhanced prompt

## Enhancement Guidelines

**Vague next step** (add structure):
- User: "continue"
- Enhanced: "Continue the codebase analysis from previous session. Based on findings in src/api/, src/services/, and src/utils/, now: 1) Document cross-module dependencies, 2) Identify circular dependency risks, 3) Suggest refactoring priorities. Output as markdown report in docs/architecture-analysis.md."

**Build on analysis** (add specifics):
- User: "now suggest improvements"
- Enhanced: "Based on the architecture analysis completed in previous session, suggest concrete improvements. Focus areas: 1) Breaking identified circular dependencies (priority: high), 2) Consolidating duplicate utility functions (priority: medium), 3) Modernizing deprecated patterns (priority: low). Provide specific file-level refactoring steps with estimated effort."

**Implementation request** (add constraints):
- User: "create migration plan"
- Enhanced: "Create detailed migration plan based on previous architectural analysis. Include: 1) Phase breakdown (3-4 phases max), 2) File-by-file changes with dependencies, 3) Testing strategy per phase, 4) Rollback procedures, 5) Estimated timeline. Consider: ~50 files affected, must maintain backward compatibility, CI/CD integration required."

## Decision Logic

**Continue if:**
- Previous session exists
- Building on previous analysis
- Long-context still needed

**Start new session if:**
- No previous session
- Different codebase area
- Analysis complete, now simple fix

## Execution

After enhancement, continue:

```bash
ccs kimi:continue -p "$ENHANCED_PROMPT"
```

**Usage Examples:**

```
/ccs:kimi "analyze all files in src/"
/ccs:kimi:continue "suggest architectural improvements"
/ccs:kimi:continue "create migration plan with phases"
```

**Notes:**
- Preserves full context from previous turns
- Optimized for long-context follow-ups
- Cost aggregated across all session turns
- Max 30 turns total (including previous turns)
- Session ID shown in previous output
