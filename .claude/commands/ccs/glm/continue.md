---
description: Continue last GLM delegation session [AUTO ENHANCE]
argument-hint: [follow-up instruction]
allowed-tools: Read, Grep, Glob, Bash
---

Continue last GLM delegation session with enhanced follow-up prompt.

## Workflow

1. **Review** what was accomplished in the previous session
2. **Analyze** the follow-up instruction in `$ARGUMENTS`
3. **Enhance prompt** with context:
   - Reference files from previous session
   - Highlight incomplete tasks
   - Add specific next steps
   - Include validation criteria
4. **Continue** session with enhanced prompt

## Enhancement Guidelines

**Vague follow-up** (needs clarity):
- User: "finish it"
- Enhanced: "Complete the remaining task: add error handling to src/auth.js as discussed. Specifically: wrap token validation in try-catch, handle expired token errors, return appropriate HTTP status codes. Then run tests to verify."

**New sub-task** (add context):
- User: "also add tests"
- Enhanced: "Add unit tests for the authentication changes made in previous session (src/auth.js). Test cases: 1) Valid token passes, 2) Expired token returns 401, 3) Invalid signature returns 403, 4) Missing token returns 400. Use Jest matching existing test patterns in tests/auth.test.js."

**Validation request** (add specifics):
- User: "make sure it works"
- Enhanced: "Validate the authentication fix from previous session. Steps: 1) Run unit tests: npm test tests/auth.test.js, 2) Check linting: npm run lint src/auth.js, 3) Manual verification: test login flow with expired token, 4) Report any failures."

## Decision Logic

**Continue if:**
- Previous session exists
- Follow-up is related to previous task
- Context is clear

**Start new session if:**
- No previous session
- Completely different task
- Better as fresh start

## Execution

After enhancement, continue:

```bash
ccs glm:continue -p "$ENHANCED_PROMPT"
```

**Usage Examples:**

```
/ccs:glm "fix typo in README"
/ccs:glm:continue "also update the examples section"
/ccs:glm:continue "run the tests to verify"
```

**Notes:**
- Preserves full context from previous turns
- Cost aggregated across all session turns
- Max 30 turns total (including previous turns)
- Session ID shown in previous output
