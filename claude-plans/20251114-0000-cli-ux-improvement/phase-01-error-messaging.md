# Phase 1: Error Messaging Enhancement

## Context

**Parent Plan:** [CLI UI/UX Improvement Plan](plan.md)
**Dependencies:** None
**Project Docs:** [CLAUDE.md](../../CLAUDE.md), [Development Rules](../../workflows/development-rules.md)
**Research:** [CLI Best Practices](research/01-cli-best-practices.md), [Current Analysis](reports/01-current-state-analysis.md)

**Skills Required:** None (core development only)
**Subagents:** `tester`, `code-reviewer`, `docs-manager`

## Overview

**Date Created:** 2025-11-14
**Description:** Enhance error messages with codes, suggestions, and actionable guidance
**Priority:** P0 (High Impact, Low Effort)
**Implementation Status:** Not Started
**Review Status:** Pending

## Key Insights

Modern CLIs must provide:
1. Clear explanation of WHAT went wrong
2. Context explaining WHY it failed
3. Actionable suggestions for HOW to fix it
4. Reference documentation (error codes)

**CCS Current State:**
- Basic error boxes with messages
- No error codes
- No "did you mean?" suggestions
- Limited actionability

**Research Findings:**
- gh CLI: Uses error codes + suggestions
- npm: Shows "did you mean?" for package typos
- cargo: Provides detailed context + fix suggestions
- kubectl: Links to documentation via error codes

## Requirements

### Must Have
1. Error code system (E001-E999) with categories
2. "Did you mean?" suggestions for profile name typos
3. Enhanced error message structure across all platforms
4. EXAMPLES section in --help text
5. Consistent implementation in bash/PowerShell/Node.js

### Should Have
6. Error documentation (docs/errors.md)
7. Version info in error output
8. Context values (paths, names) in errors

### Could Have
9. Error analytics (track common errors)
10. Multi-language error messages

## Architecture

### Error Code System

**Categories:**
- E100-E199: Configuration errors
- E200-E299: Profile management errors
- E300-E399: Claude CLI detection errors
- E400-E499: Network/API errors (GLMT)
- E500-E599: File system errors
- E900-E999: Internal errors

**Example Codes:**
```
E101: config.json missing or corrupted
E102: config.json invalid JSON
E104: Profile not found
E105: Profile already exists
E301: Claude CLI not found in PATH
E302: Claude CLI version incompatible
E401: GLMT proxy startup timeout
E402: Z.AI API key missing
```

### Enhanced Error Message Structure

**Template:**
```
[X] {Short error description}

{Detailed context}

{Suggestions}

Error: {ERROR_CODE} (documentation_url)
```

**Implementation (bash):**
```bash
show_enhanced_error() {
  local error_code="$1"
  local short_msg="$2"
  local context="$3"
  local suggestions="$4"

  echo "" >&2
  echo -e "${RED}${BOLD}[X] $short_msg${RESET}" >&2
  echo "" >&2
  [[ -n "$context" ]] && echo -e "${RED}$context${RESET}" >&2
  echo "" >&2
  [[ -n "$suggestions" ]] && echo -e "$suggestions" >&2
  echo "" >&2
  echo -e "${YELLOW}Error: $error_code${RESET}" >&2
  echo -e "${YELLOW}https://github.com/kaitranntt/ccs/blob/main/docs/errors.md#$error_code${RESET}" >&2
  echo "" >&2
}
```

### "Did You Mean?" Algorithm

**Levenshtein Distance Implementation:**
```javascript
function didYouMean(input, candidates, threshold = 2) {
  const distances = candidates.map(candidate => ({
    name: candidate,
    distance: levenshteinDistance(input.toLowerCase(), candidate.toLowerCase())
  }));

  const suggestions = distances
    .filter(d => d.distance <= threshold)
    .sort((a, b) => a.distance - b.distance)
    .map(d => d.name);

  return suggestions.slice(0, 3); // Top 3 suggestions
}
```

**Integration (profile detection):**
```bash
# lib/ccs
detect_profile_type() {
  # ... existing logic ...

  # Not found - suggest similar profiles
  PROFILE_TYPE="error"

  # Get all profile names
  local all_profiles=$(jq -r '.profiles | keys[]' "$CONFIG_FILE" "$PROFILES_JSON" 2>/dev/null | sort -u)

  # Calculate suggestions (simple: first char match + length similarity)
  local suggestions=$(echo "$all_profiles" | grep -i "^${profile_name:0:1}" | head -3)

  if [[ -n "$suggestions" ]]; then
    PROFILE_SUGGESTIONS="$suggestions"
  fi

  return 1
}
```

### EXAMPLES Section in --help

**Addition to lib/ccs show_help() L38-86:**
```bash
echo -e "${CYAN}Examples:${RESET}"
echo -e "  Quick start:"
echo -e "    ${YELLOW}\$ ccs${RESET}                        # Use default account"
echo -e "    ${YELLOW}\$ ccs glm \"implement API\"${RESET}    # Cost-optimized model"
echo ""
echo -e "  Multi-account workflow:"
echo -e "    ${YELLOW}\$ ccs auth create work${RESET}       # Create work profile"
echo -e "    ${YELLOW}\$ ccs work \"review PR\"${RESET}       # Use work account"
echo ""
echo -e "  For more: ${CYAN}https://github.com/kaitranntt/ccs#usage${RESET}"
echo ""
```

## Related Code Files

### Bash Implementation
- `lib/ccs` L28-36: msg_error() - needs enhancement
- `lib/ccs` L38-86: show_help() - add EXAMPLES section
- `lib/ccs` L669-724: detect_profile_type() - add "did you mean?"
- `lib/ccs` L1032-1038: Profile not found error - use enhanced error

### PowerShell Implementation
- `lib/ccs.ps1` L22-31: Write-ErrorMsg - needs enhancement
- `lib/ccs.ps1` L85-142: Show-Help - add EXAMPLES section
- Similar changes to bash implementation

### Node.js Implementation
- `bin/ccs.js` L8: Import ErrorManager (existing)
- `bin/utils/error-manager.js`: Enhance with error codes
- `bin/ccs.js` L89-169: handleHelpCommand() - add EXAMPLES
- `bin/auth/profile-detector.js`: Add "did you mean?" logic

## Implementation Steps

### Step 1: Error Code System (Day 1, 3h)
1. Create `docs/errors.md` with error code definitions
2. Create `bin/utils/error-codes.js` with error constants
3. Create `lib/error-codes.sh` for bash
4. Create PowerShell error code constants

### Step 2: Enhanced Error Messages (Day 1, 3h)
1. Update `bin/utils/error-manager.js` with new template
2. Update bash `msg_error()` → `show_enhanced_error()`
3. Update PowerShell `Write-ErrorMsg` → `Show-EnhancedError`
4. Update all error call sites with error codes

### Step 3: "Did You Mean?" Logic (Day 1-2, 4h)
1. Implement Levenshtein distance in Node.js
2. Implement simple fuzzy match in bash
3. Implement fuzzy match in PowerShell
4. Integrate into profile detection error handling

### Step 4: EXAMPLES in --help (Day 2, 2h)
1. Update bash show_help() with EXAMPLES section
2. Update PowerShell Show-Help with EXAMPLES section
3. Update Node.js handleHelpCommand() with EXAMPLES section
4. Ensure consistency across all three

### Step 5: Testing (Day 2, 2h)
1. Test error codes appear correctly
2. Test "did you mean?" with various typos
3. Test --help EXAMPLES section
4. Test on macOS/Linux/Windows

### Step 6: Documentation (Day 2, 1h)
1. Complete docs/errors.md with all error codes
2. Update README.md with new error handling features
3. Add CHANGELOG entry

## Todo List

- [ ] Create docs/errors.md with error code catalog
- [ ] Implement error code constants (JS/bash/PowerShell)
- [ ] Enhance error message templates in all implementations
- [ ] Implement "did you mean?" algorithm (JS/bash/PowerShell)
- [ ] Add EXAMPLES section to --help (all implementations)
- [ ] Update all error call sites with error codes
- [ ] Write unit tests for "did you mean?" logic
- [ ] Manual testing on macOS/Linux/Windows
- [ ] Update documentation (README, CHANGELOG)
- [ ] Code review and merge

## Success Criteria

### Functional
- [ ] All errors display error codes (E001-E999)
- [ ] Profile typos show "did you mean?" suggestions
- [ ] Error messages include actionable next steps
- [ ] EXAMPLES section appears in --help on all platforms
- [ ] docs/errors.md contains all error code definitions

### Quality
- [ ] Cross-platform consistency (bash/PowerShell/Node.js)
- [ ] No regression in existing error handling
- [ ] Error codes link to valid documentation
- [ ] "Did you mean?" threshold prevents false positives

### User Experience
- [ ] Users can quickly understand what went wrong
- [ ] Users know how to fix the error
- [ ] Typos are caught and corrected easily
- [ ] Help examples make common tasks discoverable

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|:-----|:-----------|:-------|:-----------|
| Breaking existing error parsing | Low | High | Maintain error format, add codes at end |
| "Did you mean?" false positives | Medium | Low | Use strict threshold (distance ≤ 2) |
| Documentation URL 404s | Low | Medium | Validate all links, use relative paths |
| Performance impact (fuzzy match) | Low | Low | Cache profile list, limit comparisons |

## Security Considerations

1. **Error Message Content:** Don't leak sensitive paths/keys in errors
2. **URL Injection:** Sanitize error codes before building URLs
3. **Input Validation:** Validate profile names before fuzzy matching

## Next Steps

1. Create docs/errors.md structure
2. Implement error code constants
3. Update error message templates
4. Implement "did you mean?" logic
5. Add EXAMPLES sections
6. Test across all platforms
7. Deploy and gather user feedback

---

**Estimated Effort:** 1-2 days
**Blocking Issues:** None
**Ready for Implementation:** Yes
