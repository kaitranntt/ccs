# Phase 6: Advanced Discoverability (Optional)

## Context

**Parent Plan:** [CLI UI/UX Improvement Plan](plan.md)
**Priority:** P3 (Optional) | **Status:** Not Started

## Overview

Advanced features for power users: auto-complete, command abbreviations, man pages.

## Requirements

1. Bash/Zsh auto-complete scripts
2. Command abbreviations (ccs a → ccs auth)
3. Man pages for offline help
4. Enhanced "did you mean?" for commands

## Architecture

### Auto-Complete (bash)

**File:** `scripts/completion/ccs.bash`

```bash
_ccs_completion() {
  local cur prev opts
  COMPREPLY=()
  cur="${COMP_WORDS[COMP_CWORD]}"
  prev="${COMP_WORDS[COMP_CWORD-1]}"

  # Top-level commands
  if [[ ${COMP_CWORD} -eq 1 ]]; then
    opts="auth doctor --help --version"
    # Add profiles
    if [[ -f ~/.ccs/config.json ]]; then
      opts="$opts $(jq -r '.profiles | keys[]' ~/.ccs/config.json 2>/dev/null)"
    fi
    if [[ -f ~/.ccs/profiles.json ]]; then
      opts="$opts $(jq -r '.profiles | keys[]' ~/.ccs/profiles.json 2>/dev/null)"
    fi
    COMPREPLY=( $(compgen -W "${opts}" -- ${cur}) )
    return 0
  fi

  # auth subcommands
  if [[ ${prev} == "auth" ]]; then
    opts="create list show remove default --help"
    COMPREPLY=( $(compgen -W "${opts}" -- ${cur}) )
    return 0
  fi

  # Profile names for auth commands
  if [[ ${COMP_WORDS[1]} == "auth" ]] && [[ ${prev} =~ ^(show|remove|default)$ ]]; then
    if [[ -f ~/.ccs/profiles.json ]]; then
      opts=$(jq -r '.profiles | keys[]' ~/.ccs/profiles.json 2>/dev/null)
      COMPREPLY=( $(compgen -W "${opts}" -- ${cur}) )
    fi
    return 0
  fi
}

complete -F _ccs_completion ccs
```

**Installation:**
```bash
# Add to ~/.bashrc or ~/.bash_profile
source /path/to/ccs/scripts/completion/ccs.bash
```

### Command Abbreviations

**Design:**
- `ccs a` → `ccs auth`
- `ccs d` → `ccs doctor`
- Ambiguous abbreviations show options

**Implementation:**
```javascript
// bin/ccs.js
function expandAbbreviation(cmd) {
  const abbreviations = {
    'a': 'auth',
    'd': 'doctor',
    'v': 'version',
    'h': 'help'
  };

  return abbreviations[cmd] || cmd;
}

// Usage
const firstArg = expandAbbreviation(args[0]);
```

### Man Pages

**Generate from --help:**
```bash
# scripts/generate-man-page.sh
help2man bin/ccs.js --no-info > man/ccs.1
```

## Implementation Steps

1. Create bash completion script
2. Create zsh completion script
3. Implement command abbreviations
4. Generate man pages
5. Add installation scripts
6. Test on multiple shells
7. Document completion setup

## Todo List

- [ ] Create bash auto-complete script
- [ ] Create zsh auto-complete script
- [ ] Implement command abbreviations
- [ ] Generate man pages from --help
- [ ] Add completion installation to install scripts
- [ ] Test on bash 3.2+, zsh 5.0+
- [ ] Document completion setup
- [ ] Update README

## Success Criteria

- [ ] Tab completion works for profiles and commands
- [ ] Abbreviations reduce typing
- [ ] Man pages available offline
- [ ] Installation is automatic

## Related Files

- **NEW:** `scripts/completion/ccs.bash`
- **NEW:** `scripts/completion/ccs.zsh`
- **NEW:** `man/ccs.1`
- `bin/ccs.js` - abbreviation expansion
- `lib/ccs` - abbreviation expansion
- `installers/install.sh` - completion setup

---

**Effort:** 3-4 days | **Optional:** Power user feature
