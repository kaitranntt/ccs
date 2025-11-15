# Best Practices for CCS Delegation

Guidelines for when to delegate tasks vs keeping them in the main Claude Code session.

## Decision Framework

**Delegate to GLM/Kimi when:**
- Task is deterministic and well-defined
- No back-and-forth discussion needed
- Simple, repetitive work
- Token optimization is priority
- Task scope is clear

**Keep in main session when:**
- Architecture or design decisions required
- Security-critical implementations
- Complex debugging needs conversation
- Multiple iterations expected
- User wants to discuss approach

## Ideal Delegation Scenarios

### 1. Simple Refactoring

**Delegate:**
```
/ccs:glm "refactor src/utils.js to use async/await instead of callbacks"
/ccs:glm "extract duplicated validation logic into reusable function"
/ccs:glm "rename variables in auth.js to follow camelCase convention"
```

**Why:** Clear transformation, no design decisions needed.

### 2. Adding Tests

**Delegate:**
```
/ccs:glm "add unit tests for UserService class with Jest"
/ccs:glm "add edge case tests for payment validation function"
/ccs:glm "add integration tests for API endpoints in routes/"
```

**Why:** Test structure follows existing patterns, no architecture needed.

### 3. Documentation

**Delegate:**
```
/ccs:glm "add JSDoc comments to all exported functions in api.js"
/ccs:glm "update README.md with new installation instructions"
/ccs:glm "fix typos and formatting in docs/"
```

**Why:** Straightforward writing task, no complex reasoning.

### 4. Code Formatting

**Delegate:**
```
/ccs:glm "fix all ESLint errors in src/"
/ccs:glm "apply Prettier formatting to components/"
/ccs:glm "organize imports alphabetically in all files"
```

**Why:** Mechanical transformation following linter rules.

### 5. Simple CRUD Operations

**Delegate:**
```
/ccs:glm "add DELETE endpoint for /api/users/:id"
/ccs:glm "create User model with name, email, createdAt fields"
```

**Why:** Following established patterns, minimal decisions.

## Keep in Main Session

### 1. Architecture Decisions

**Don't delegate:**
```
"Design the authentication system architecture"
"Choose between REST and GraphQL for our API"
"Plan the database schema for multi-tenancy"
```

**Why:** Requires discussion, tradeoff analysis, user input.

### 2. Security Implementation

**Don't delegate:**
```
"Implement JWT authentication with refresh tokens"
"Add encryption for sensitive user data"
"Set up OAuth2 flow with proper CSRF protection"
```

**Why:** Security-critical, needs careful review and discussion.

### 3. Complex Debugging

**Don't delegate:**
```
"Debug why the payment system occasionally charges twice"
"Figure out the race condition in concurrent requests"
"Investigate memory leak in background workers"
```

**Why:** Requires conversation, hypothesis testing, iterations.

### 4. Performance Optimization

**Don't delegate:**
```
"Optimize the database queries for 10x speed improvement"
"Reduce bundle size by analyzing dependencies"
"Profile and fix React render performance issues"
```

**Why:** Needs profiling, measurement, iterative tuning.

### 5. Breaking Changes

**Don't delegate:**
```
"Migrate from v1 to v2 API with breaking changes"
"Refactor entire state management to use Zustand"
"Update all components from class-based to hooks"
```

**Why:** High impact, needs careful planning and validation.

## Prompt Engineering for Delegation

**Good delegation prompts:**

✅ Specific and scoped:
```
/ccs:glm "in src/auth.js, extract the password hashing logic into hashPassword() function"
```

✅ Clear success criteria:
```
/ccs:glm "add unit tests for calculateTotal() that cover positive numbers, zero, and negative numbers"
```

✅ Explicit file references:
```
/ccs:glm "update packages/api/README.md to document the new rate limiting feature"
```

**Poor delegation prompts:**

❌ Too vague:
```
/ccs:glm "improve the code"
```

❌ Multiple unrelated tasks:
```
/ccs:glm "add tests, update docs, fix linting, and refactor auth"
```

❌ Requires decisions:
```
/ccs:glm "implement whatever authentication method you think is best"
```

## Token Optimization Strategy

**Maximum savings:**

Delegate repetitive tasks that would consume many tokens in main session:

```
Main session (discussing approach): ~2000 tokens
Delegation execution: ~500 tokens
Savings: ~1500 tokens per task
```

**Example workflow:**

1. User: "I need to add tests for all services"
2. You (main session): "I'll delegate this to GLM to save tokens. I'll add tests for each service file."
3. Delegate: `/ccs:glm "add unit tests for UserService"`
4. Delegate: `/ccs:glm "add unit tests for PaymentService"`
5. Delegate: `/ccs:glm "add unit tests for NotificationService"`
6. Review results in main session

**Token saved:** Avoided verbose test discussions in expensive main session.

## Monorepo Best Practices

**Specify workspace explicitly:**
```
/ccs:glm "in packages/api, add validation middleware"
/ccs:glm "in apps/web/src/components, fix PropTypes warnings"
```

**Why:** Ensures delegation works in correct directory.

## Error Recovery

**If delegation fails:**

1. Review error message
2. Fix issue (file path, syntax)
3. Retry delegation OR
4. Complete in main session if too complex

**Example:**
```
/ccs:glm "fix src/auth.js"
→ Error: File not found

Check:
ls src/
→ auth.ts (TypeScript, not .js!)

Retry:
/ccs:glm "fix src/auth.ts"
```

## Delegation Limits

**Don't delegate when:**
- Task scope > 30 minutes of work
- Multiple files need coordinated changes
- Breaking changes that affect many files
- Uncertainty about requirements
- User explicitly wants to discuss approach

**Signs task is too complex:**
- You're unsure how to describe it
- Multiple valid approaches exist
- Needs architectural decisions
- Requires new dependencies
- Changes core business logic
