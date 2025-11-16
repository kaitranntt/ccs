---
description: Delegate task to GLM-4.6 (cost-optimized model) [AUTO ENHANCE]
argument-hint: [task description]
allowed-tools: Read, Grep, Glob, Bash
---

Delegate simple, deterministic tasks to GLM-4.6 with automatic prompt enhancement.

## Workflow

1. **Analyze** the task description provided in `$ARGUMENTS`
2. **Gather context** if needed (read relevant files, check structure)
3. **Enhance prompt** with specific details:
   - File paths and line numbers
   - Current implementation context
   - Expected behavior and constraints
   - Success criteria
4. **Delegate** to GLM-4.6 with enhanced prompt

## Enhancement Guidelines

**Simple task** (pass through):
- User: "fix typo in README.md"
- Enhanced: Same (already specific)

**Vague task** (needs enhancement):
- User: "fix auth bug"
- Enhanced: "Fix authentication bug in src/auth.js:45 where token validation fails after password reset. Current implementation uses deprecated jwt.verify() without error handling. Update to use async/await pattern and add proper error handling for expired tokens."

**Multi-file task** (add structure):
- User: "add tests for UserService"
- Enhanced: "Add unit tests for UserService class in src/services/user.js. Cover these methods: createUser(), updateUser(), deleteUser(). Use Jest framework matching existing test patterns in tests/services/. Include edge cases: null inputs, duplicate emails, invalid IDs."

## Decision Logic

**Delegate if:**
- Task is clear and scoped
- Files are identifiable (<5 files)
- Success criteria obvious

**Ask for clarification if:**
- Multiple possible interpretations
- Missing critical context
- Ambiguous scope

## Execution

After enhancement, delegate:

```bash
ccs glm -p "$ENHANCED_PROMPT"
```

**Usage Examples:**

```
/ccs:glm "refactor auth.js to use async/await"
/ccs:glm "fix the login bug"
/ccs:glm "add validation to user form"
```

**Notes:**
- Optimized for simple, focused tasks
- Max 30 turns (auto-determined by complexity)
- Use `/ccs:glm:continue` for follow-ups
- Profile: `~/.ccs/glm.settings.json`
