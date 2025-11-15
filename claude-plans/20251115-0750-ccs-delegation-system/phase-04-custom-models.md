# Phase 4: Custom Model Support

## Context Links

- **Parent Plan**: [plan.md](plan.md)
- **Dependencies**: Phase 3 (headless execution engine)
- **Research**: [researcher-01-current-implementation.md](research/researcher-01-current-implementation.md)

## Overview

**Date**: 2025-11-15
**Description**: Implement `/ccs:create` for user-defined model profiles
**Priority**: P2 (Medium - enables extensibility)
**Implementation Status**: ⏳ Not Started (blocked by Phase 3)
**Review Status**: ⏳ Awaiting User Review

## Key Insights

- Users manage profile setup (ccs doesn't handle model installation)
- `/ccs:create` only generates slash command file
- Profile must exist in `~/.ccs/profiles/<name>/settings.json` first
- Generated commands follow same pattern as built-in ones

## Requirements

### Functional

1. **/ccs:create Slash Command**
   - Accept: model name (e.g., "m2", "claude4", "custom")
   - Validate: profile exists in `~/.ccs/profiles/<name>/`
   - Generate: `.claude/commands/ccs-<name>.md`
   - Confirm: command created successfully

2. **Command Template Generator**
   - Create slash command file from template
   - Substitute model name throughout
   - Set correct profile path
   - Preserve all delegation logic

3. **Validation**
   - Check profile directory exists
   - Check settings.json is valid
   - Check command doesn't already exist (or --force flag)

### Non-Functional

- <1s command generation
- Clear success/error messages
- Idempotent (safe to re-run with --force)

## Architecture

```
.claude/
└── commands/
    ├── ccs-glm.md                   # Built-in
    ├── ccs-kimi.md                  # Built-in
    ├── ccs-create.md                # NEW: Generator command
    ├── ccs-m2.md                    # User-generated (example)
    └── ccs-custom.md                # User-generated (example)
```

### Slash Command: ccs-create.md

```markdown
---
description: Create custom model delegation command
argument-hint: <model-name> [--force]
allowed-tools: Bash, Read, Write
model: sonnet
---

# /ccs:create - Create Custom Model Delegation

Generate `/ccs:<model>` slash command for user-defined models.

## Your Task

Parse input: `$ARGUMENTS`

Expected format: `<model-name> [--force]`

## Workflow

1. **Parse Arguments**
   - Extract model name (e.g., "m2", "custom")
   - Check for --force flag

2. **Validate Profile**
   ```bash
   # Check profile exists
   if [[ ! -d ~/.ccs/profiles/<model-name> ]]; then
     echo "[X] Profile not found: <model-name>"
     echo ""
     echo "Create profile first:"
     echo "  1. Create directory: mkdir -p ~/.ccs/profiles/<model-name>"
     echo "  2. Copy settings: cp ~/.ccs/profiles/glm/settings.json ~/.ccs/profiles/<model-name>/"
     echo "  3. Edit API key: Edit ~/.ccs/profiles/<model-name>/settings.json"
     exit 1
   fi

   # Validate settings.json
   if ! jq empty ~/.ccs/profiles/<model-name>/settings.json 2>/dev/null; then
     echo "[X] Invalid settings.json for profile: <model-name>"
     exit 1
   fi
   ```

3. **Check Existing Command**
   ```bash
   if [[ -f .claude/commands/ccs-<model-name>.md ]] && [[ ! "$force" ]]; then
     echo "[X] Command already exists: /ccs:<model-name>"
     echo ""
     echo "Use --force to overwrite:"
     echo "  /ccs:create <model-name> --force"
     exit 1
   fi
   ```

4. **Generate Command File**
   - Read template from ccs-glm.md
   - Replace "glm" with "<model-name>"
   - Replace "GLM-4.6" with "<Model Name>"
   - Write to .claude/commands/ccs-<model-name>.md

5. **Confirm Success**
   ```
   [OK] Custom delegation command created

   Command: /ccs:<model-name>
   File: .claude/commands/ccs-<model-name>.md
   Profile: ~/.ccs/profiles/<model-name>/settings.json

   Usage:
     /ccs:<model-name> "your task here"

   Test it:
     /ccs:<model-name> "say hello"
   ```

## Template Generation

**Source**: `.claude/commands/ccs-glm.md`

**Replacements**:
- `glm` → `<model-name>`
- `GLM-4.6` → `<Model Display Name>`
- `Z.AI` → `<Provider Name>` (if detectable)

**Preserve**:
- All validation logic
- Prompt enhancement
- Result formatting
- Error handling

## Error Handling

**Profile Not Found**:
- Clear error message
- Step-by-step setup instructions
- Link to documentation

**Invalid Settings**:
- Show JSON validation error
- Suggest fix
- Example settings.json

**Command Exists**:
- Show --force usage
- Warn about overwrite

## Notes

- We only generate command file
- User handles model installation
- Settings.json must be pre-configured
- Generated command identical to built-ins
```

## Related Code Files

**Existing Files to Use as Template**:
- `.claude/commands/ccs-glm.md` (template source)

**New Files to Create**:
- `.claude/commands/ccs-create.md` (300 lines)

**User-Generated Files** (examples):
- `.claude/commands/ccs-m2.md` (generated)
- `.claude/commands/ccs-claude4.md` (generated)
- `.claude/commands/ccs-custom.md` (generated)

## Implementation Steps

1. **Create ccs-create.md**
   - Implement argument parsing
   - Implement profile validation
   - Implement command existence check
   - Implement template generation logic

2. **Create template generator**
   - Read ccs-glm.md
   - Perform string replacements
   - Write to new command file
   - Set proper permissions

3. **Add validation helpers**
   - Profile directory check
   - settings.json validation
   - Command conflict detection

4. **Test command generation**
   - Test with valid profile
   - Test with missing profile
   - Test with invalid settings.json
   - Test --force override
   - Test generated command works

## Todo List

- [ ] Create .claude/commands/ccs-create.md
- [ ] Implement argument parser
- [ ] Implement profile validator
- [ ] Implement template generator
- [ ] Test with minimax m2 profile (example)
- [ ] Test with missing profile
- [ ] Test with invalid settings.json
- [ ] Test --force flag
- [ ] Test generated command executes
- [ ] Document workflow in README
- [ ] Add examples to documentation

## Success Criteria

- ✓ `/ccs:create m2` generates working command
- ✓ Validation catches missing profiles
- ✓ Validation catches invalid settings.json
- ✓ --force flag overwrites existing commands
- ✓ Generated commands work identically to built-ins
- ✓ Error messages are clear and actionable
- ✓ Template substitution preserves all logic
- ✓ Command permissions set correctly

## Risk Assessment

**LOW RISK**: Simple template substitution

**Mitigation**:
- Comprehensive validation before generation
- Test generated commands automatically
- Clear rollback instructions

**Edge Cases**:
- Model name with special characters
- Very long model names
- Unicode in model names

## Security Considerations

1. **Path Injection**
   - Validate model name against whitelist pattern
   - Only allow alphanumeric + dash/underscore
   - Prevent directory traversal

2. **Template Injection**
   - Don't interpolate user input into template
   - Use safe string replacement
   - Validate template integrity

3. **Permission Escalation**
   - Generated files inherit .claude/ permissions
   - No sudo/elevated operations

## Next Steps

1. User approves custom model design
2. Implement ccs-create.md
3. Test with example profile (m2)
4. Document custom model workflow
5. Move to Phase 5 (discovery & integration)
