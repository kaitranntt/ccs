# Phase 1: Foundation & Validation

## Context Links

- **Parent Plan**: [plan.md](plan.md)
- **Dependencies**: None (foundation phase)
- **Research**: [researcher-02-architecture-analysis.md](research/researcher-02-architecture-analysis.md)
- **Design**: [01-delegation-rules-schema.md](reports/01-delegation-rules-schema.md)

## Overview

**Date**: 2025-11-15
**Description**: Build core validation, prompt enhancement, delegation rules engine
**Priority**: P0 (Critical - blocks all other phases)
**Implementation Status**: ⏳ Not Started
**Review Status**: ⏳ Awaiting User Review

## Key Insights

- Validation MUST catch default API keys ("YOUR_GLM_API_KEY_HERE")
- Prompt enhancement critical—never pass raw user input to GLM
- delegation-rules.json enables future auto-delegation without code changes
- Cross-platform parity requires shared validation logic

## Requirements

### Functional

1. **Delegation Validator Module**
   - Check profile exists in `~/.ccs/profiles/<profile>/settings.json`
   - Verify API key != default placeholder
   - Return clear error messages with suggestions

2. **Prompt Enhancer Module**
   - Accept: raw prompt, CWD, file context (optional)
   - Output: enhanced prompt with absolute paths, detailed requirements
   - Include working directory context for monorepo support

3. **Delegation Rules Schema**
   - Implement full schema from design report
   - Default config generation on first run
   - Config validation on load

### Non-Functional

- Zero dependencies beyond existing ccs dependencies
- <50ms validation overhead
- Clear error messages following CCS error format

## Architecture

```
bin/
├── utils/
│   ├── delegation-validator.js      # NEW: Profile + API key validation
│   └── prompt-enhancer.js           # NEW: Prompt enrichment logic
└── delegation/
    ├── delegation-engine.js         # NEW: Rule-based decision engine
    └── rules-schema.js              # NEW: Schema definition + defaults
~/.ccs/
└── delegation-rules.json            # NEW: User config (auto-generated)
```

### Module: delegation-validator.js

```javascript
class DelegationValidator {
  static validate(profileName) {
    const settingsPath = `~/.ccs/profiles/${profileName}/settings.json`;

    // Check exists
    if (!fs.existsSync(settingsPath)) {
      throw new Error(`Profile not found: ${profileName}`);
    }

    // Check API key
    const settings = JSON.parse(fs.readFileSync(settingsPath));
    const apiKey = settings.env.ANTHROPIC_AUTH_TOKEN;

    if (!apiKey || apiKey === 'YOUR_GLM_API_KEY_HERE') {
      throw new Error(
        `Invalid API key for ${profileName}.\n` +
        `Edit ${settingsPath} and set ANTHROPIC_AUTH_TOKEN`
      );
    }

    return true;
  }
}
```

### Module: prompt-enhancer.js

```javascript
class PromptEnhancer {
  static enhance(rawPrompt, options = {}) {
    const { cwd, files, scope } = options;

    let enhanced = `# Task\n${rawPrompt}\n\n`;

    // Add working directory context
    if (cwd) {
      enhanced += `# Working Directory\nYou are operating in: ${cwd}\n\n`;
    }

    // Add file context
    if (files && files.length > 0) {
      enhanced += `# Relevant Files\n`;
      files.forEach(f => enhanced += `- ${f}\n`);
      enhanced += `\n`;
    }

    // Add explicit requirements
    enhanced += `# Requirements\n`;
    enhanced += `- Use absolute paths in your responses\n`;
    enhanced += `- Report all files created/modified\n`;
    enhanced += `- Include source of truth (where/what/scope)\n`;

    return enhanced;
  }
}
```

## Related Code Files

**Existing Files to Modify**:
- None (all new modules)

**New Files to Create**:
- `bin/utils/delegation-validator.js` (150 lines)
- `bin/utils/prompt-enhancer.js` (100 lines)
- `bin/delegation/delegation-engine.js` (200 lines)
- `bin/delegation/rules-schema.js` (50 lines)
- `~/.ccs/delegation-rules.json` (auto-generated)

## Implementation Steps

1. **Create delegation-validator.js**
   - Implement profile existence check
   - Implement API key validation
   - Add clear error formatting

2. **Create prompt-enhancer.js**
   - Implement basic enhancement (task + CWD)
   - Add file context support
   - Add requirements injection

3. **Create rules-schema.js**
   - Define JSON schema from design report
   - Implement default config generator
   - Add schema validation function

4. **Create delegation-engine.js**
   - Implement rule loading
   - Implement keyword matching
   - Implement file pattern matching
   - Add shouldDelegate() decision function

5. **Create default delegation-rules.json**
   - Use schema defaults
   - Write to `~/.ccs/delegation-rules.json`
   - Set proper permissions (0600)

6. **Unit tests**
   - Test validator with valid/invalid profiles
   - Test prompt enhancer output format
   - Test rules engine decision logic

## Todo List

- [ ] Create bin/utils/delegation-validator.js
- [ ] Create bin/utils/prompt-enhancer.js
- [ ] Create bin/delegation/rules-schema.js
- [ ] Create bin/delegation/delegation-engine.js
- [ ] Generate default ~/.ccs/delegation-rules.json
- [ ] Write unit tests for validator
- [ ] Write unit tests for prompt enhancer
- [ ] Write unit tests for rules engine
- [ ] Test cross-platform compatibility
- [ ] Update package.json if needed

## Success Criteria

- ✓ Validator correctly rejects default API keys
- ✓ Validator provides helpful error messages
- ✓ Prompt enhancer adds CWD context
- ✓ Prompt enhancer preserves user intent
- ✓ delegation-rules.json generates on first run
- ✓ Rules engine loads config without errors
- ✓ All unit tests pass
- ✓ Zero regressions in existing ccs commands

## Risk Assessment

**LOW RISK**: Self-contained modules, no modifications to existing code

**Mitigation**:
- Extensive unit tests before integration
- Schema validation prevents config errors
- Clear error messages guide users

## Security Considerations

1. **API Key Exposure**
   - Validator only reads, never logs API keys
   - Error messages don't include sensitive data

2. **File Permissions**
   - delegation-rules.json set to 0600 (user-only)
   - Settings files already protected by ccs

3. **Path Traversal**
   - Prompt enhancer validates CWD paths
   - No arbitrary file reads based on user input

## Next Steps

1. User approves this phase design
2. Implement modules in order (validator → enhancer → rules)
3. Write unit tests concurrently
4. Integration test before moving to Phase 2
5. Document new modules in code comments
