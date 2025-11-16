---
description: Delegate task to Kimi (long-context model) [AUTO ENHANCE]
argument-hint: [task description]
allowed-tools: Read, Grep, Glob, Bash
---

Delegate long-context, multi-file tasks to Kimi with automatic prompt enhancement.

## Workflow

1. **Analyze** the task description provided in `$ARGUMENTS`
2. **Gather context** across multiple files/directories
3. **Enhance prompt** with comprehensive details:
   - Directory structures and patterns
   - Cross-file relationships
   - Architecture context
   - Success criteria and scope boundaries
4. **Delegate** to Kimi with enhanced prompt

## Enhancement Guidelines

**Simple analysis** (add scope):
- User: "document the API"
- Enhanced: "Analyze all API endpoint handlers in src/api/ and generate comprehensive documentation. Include: endpoint paths, HTTP methods, request/response schemas, authentication requirements, error codes. Format as OpenAPI 3.0 spec in docs/api.yaml."

**Vague refactor** (needs structure):
- User: "modernize the codebase"
- Enhanced: "Modernize codebase by converting src/**/*.js files from CommonJS to ES modules. Priorities: 1) Update all require() to import statements, 2) Convert module.exports to export statements, 3) Update package.json type field, 4) Fix circular dependencies in src/utils/. Preserve functionality - this is purely syntactic."

**Cross-file task** (add relationships):
- User: "find all deprecated usages"
- Enhanced: "Search entire codebase for deprecated API usages. Targets: React.createClass → class components, componentWillMount → componentDidMount, findDOMNode → refs. Generate migration report with: 1) List of files using deprecated APIs, 2) Suggested replacements, 3) Migration priority based on deprecation timeline."

## Decision Logic

**Delegate to Kimi if:**
- Multi-file analysis (>5 files)
- Cross-cutting concerns
- Large context needed
- Pattern detection across codebase

**Use /ccs:glm instead if:**
- Single file task
- Simple, deterministic change
- Cost optimization important

**Ask for clarification if:**
- Scope too broad (entire codebase)
- Multiple strategies possible
- Impact unclear

## Execution

After enhancement, delegate:

```bash
ccs kimi -p "$ENHANCED_PROMPT"
```

**Usage Examples:**

```
/ccs:kimi "analyze all files in src/ and document architecture"
/ccs:kimi "find deprecated API usages"
/ccs:kimi "review project structure and suggest improvements"
```

**Notes:**
- Optimized for long-context tasks (>5 files)
- Max 30 turns (auto-determined by complexity)
- Use `/ccs:kimi:continue` for follow-ups
- Profile: `~/.ccs/kimi.settings.json`
