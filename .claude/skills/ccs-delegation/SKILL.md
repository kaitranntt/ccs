---
name: ccs-delegation
description: Delegate simple tasks to alternative models (GLM, Kimi) via CCS CLI for token optimization
version: 2.2.0
---

# CCS Delegation

Delegate deterministic tasks to cost-optimized models via CCS CLI.

## Core Concept

Execute tasks via alternative models using `ccs {profile} -p "task"` equivalent to `claude --settings ~/.ccs/{profile}.settings -p "task"`

**Profiles:** GLM (cost-optimized), Kimi (long-context)

## Decision Framework

**Delegate when:**
- Simple refactoring, tests, typos, documentation
- Deterministic, well-defined scope
- No discussion/decisions needed

**Keep in main when:**
- Architecture/design decisions
- Security-critical code
- Complex debugging requiring investigation
- Performance optimization
- Breaking changes/migrations

## Profile Selection

- **GLM**: Simple tasks (<5 files, clear scope, cost-optimized)
- **Kimi**: Long-context (multi-file analysis, architecture docs)

## Execution

User invocation via slash commands:
```
/ccs:glm "task"
/ccs:glm:continue "follow-up"
```

Agent execution via Bash tool:
```bash
ccs glm -p "task"
ccs glm:continue -p "follow-up"
```

## References

Technical details: `references/headless-workflow.md`
Decision guide: `references/delegation-guidelines.md`
Troubleshooting: `references/troubleshooting.md`
