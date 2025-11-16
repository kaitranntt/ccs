# Delegation Guidelines

AI decision framework for when to delegate tasks vs keep in main session.

## Task Classification Rules

**Delegate if ALL criteria match:**
- Task scope: Single concern, < 5 files
- Complexity: Mechanical transformation, established pattern
- Ambiguity: Zero decisions required, clear acceptance criteria
- Context: Existing patterns to follow, no architecture changes

**Keep in main if ANY criteria match:**
- Requires design decisions or tradeoff analysis
- Security-critical (auth, encryption, permissions)
- Performance-sensitive requiring profiling/measurement
- Breaking changes or API migrations
- User discussion/clarification needed
- Coordinated changes across multiple subsystems

## Delegation Pattern Matching

**High-confidence delegation patterns:**
```
Task patterns to delegate:
- refactor .* to use (async/await|destructuring|arrow functions)
- add (unit|integration) tests for .*
- fix (typos?|formatting|linting errors?) in .*
- add JSDoc comments to .*
- extract .* into (function|method|util) .*
- rename (variable|function) .* to .*
- add DELETE endpoint for .*
- update README to document .*
```

**Anti-patterns (never delegate):**
```
Task patterns to avoid:
- implement .* (too vague, needs design)
- improve .* (subjective, needs discussion)
- fix bug .* (requires investigation)
- optimize .* (requires profiling)
- migrate .* to .* (breaking change)
- design .* (architecture decision)
- whatever .* you think (requires judgment)
```

## Prompt Quality Criteria

**Well-formed delegation prompt:**
- Specifies exact file paths: `in src/auth.js, ...`
- Defines success criteria: `covering positive, zero, negative cases`
- Single atomic task: One verb, one target
- Uses imperative mood: "add tests" not "adding tests"

**Malformed delegation prompt:**
- Multiple tasks: "add tests, update docs, fix linting"
- Vague scope: "improve the code"
- Requires decisions: "use whatever library you want"
- No file context: "fix the bug" (which file?)

## Token Efficiency Model

**Delegation cost model:**
- Main session overhead: ~2000 tokens (context, discussion)
- Delegation overhead: ~500 tokens (focused execution)
- Net savings: ~1500 tokens per delegated task

**When to batch delegate:**
- User requests N similar tasks (e.g., "add tests for all services")
- Each task follows identical pattern
- Tasks are independent (no coordination needed)

**Execution pattern:**
```
for each service in [UserService, AuthService, OrderService]:
  ccs glm -p "add unit tests for {service} using Jest"
```

## Monorepo Handling

**Workspace specification required:**
- Pattern: `in packages/{workspace}, {task}`
- Example: `in packages/api, add validation middleware`
- Without workspace: Task may target wrong package

## Scope Limits

**Absolute limits (reject delegation):**
- Estimated time > 30 minutes
- File count > 5 files
- Requires external research
- Breaking changes to public APIs
- User explicitly requests discussion

**Examples of over-scoped tasks:**
- "Migrate from SQLite to PostgreSQL" (breaking change)
- "Implement OAuth2 authentication" (too complex)
- "Analyze entire codebase for security issues" (research task)
