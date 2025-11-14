# Phase 3: Interactive UX Improvements

## Context

**Parent Plan:** [CLI UI/UX Improvement Plan](plan.md)
**Dependencies:** Phase 1 (error codes)
**Priority:** P1 | **Status:** Not Started

## Overview

Add interactive confirmation prompts for destructive operations while maintaining automation support via `--yes`/`--no-input` flags.

## Key Insights

**Current Pain Points:**
- `ccs auth remove` requires remembering `--force` flag (low discoverability)
- No interactive confirmation shows what will be deleted
- Less user-friendly than modern CLIs (gh, npm)

**Best Practices:**
- Default to SAFE option (N) for destructive actions
- Show what will be affected before confirming
- Always provide `--yes` for automation
- Validate input immediately

## Requirements

### Must Have
1. Interactive confirmation for `ccs auth remove`
2. `--yes` flag to bypass prompts (automation)
3. `--no-input` flag to fail on required interaction (CI)
4. Display impact before confirmation (sessions count, paths)
5. Consistent Y/n vs y/N defaults

### Should Have
6. Colored confirmation prompts (when TTY)
7. Input validation with retry
8. Clear cancellation message

## Architecture

### Prompt Library (bin/utils/prompt.js)

```javascript
class InteractivePrompt {
  static async confirm(message, options = {}) {
    const { default: defaultValue = false } = options;

    // Non-TTY or --yes: return default
    if (!process.stdin.isTTY || process.env.CCS_YES) {
      return defaultValue;
    }

    // --no-input: throw error
    if (process.env.CCS_NO_INPUT) {
      throw new Error('Interactive input required but --no-input specified');
    }

    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr
    });

    const prompt = defaultValue
      ? `${message} [Y/n]: `
      : `${message} [y/N]: `;

    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        rl.close();

        const normalized = answer.trim().toLowerCase();

        if (normalized === '') {
          resolve(defaultValue);
        } else if (normalized === 'y' || normalized === 'yes') {
          resolve(true);
        } else if (normalized === 'n' || normalized === 'no') {
          resolve(false);
        } else {
          // Invalid input - ask again
          console.error('[!] Please answer y or n');
          resolve(InteractivePrompt.confirm(message, options));
        }
      });
    });
  }
}
```

### Integration: auth remove (bin/auth/auth-commands.js)

```javascript
async remove(args) {
  const profileName = args[0];
  const forceFlag = args.includes('--force');
  const yesFlag = args.includes('--yes') || args.includes('-y');

  if (!profileName) {
    console.error('[X] Profile name required');
    console.error('Usage: ccs auth remove <profile> [--yes]');
    process.exit(1);
  }

  // Check profile exists
  const registry = new ProfileRegistry();
  if (!registry.exists(profileName)) {
    console.error(`[X] Profile not found: ${profileName}`);
    process.exit(1);
  }

  // Get profile info for impact display
  const instancePath = `~/.ccs/instances/${profileName}`;
  const sessionCount = this.getSessionCount(profileName);

  // Display impact
  console.log('');
  console.log(`Profile '${profileName}' will be permanently deleted.`);
  console.log(`  Instance path: ${instancePath}`);
  console.log(`  Sessions: ${sessionCount} conversations`);
  console.log('');

  // Confirm deletion
  const confirmed = yesFlag || await InteractivePrompt.confirm(
    'Delete this profile?',
    { default: false } // Default to NO (safe)
  );

  if (!confirmed) {
    console.log('[i] Cancelled');
    process.exit(0);
  }

  // Perform deletion
  // ... existing logic ...

  console.log('[OK] Profile removed successfully');
}
```

### Bash Implementation (lib/ccs)

```bash
# Interactive confirmation prompt
confirm_action() {
  local message="$1"
  local default="${2:-no}"  # Default to NO for safety

  # Non-TTY or --yes flag: use default
  if [[ ! -t 0 ]] || [[ "${CCS_YES:-}" == "1" ]]; then
    [[ "$default" == "yes" ]] && return 0 || return 1
  fi

  # --no-input flag: error
  if [[ "${CCS_NO_INPUT:-}" == "1" ]]; then
    msg_error "Interactive input required but --no-input specified"
    exit 1
  fi

  # Prompt user
  local prompt
  if [[ "$default" == "yes" ]]; then
    prompt="$message [Y/n]: "
  else
    prompt="$message [y/N]: "
  fi

  while true; do
    read -r -p "$prompt" response >&2
    response=$(echo "$response" | tr '[:upper:]' '[:lower:]')

    case "$response" in
      ""|" ") [[ "$default" == "yes" ]] && return 0 || return 1 ;;
      y|yes) return 0 ;;
      n|no) return 1 ;;
      *) echo "[!] Please answer y or n" >&2 ;;
    esac
  done
}

# Update auth_remove
auth_remove() {
  local profile_name=""
  local yes_flag=false

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --yes|-y) yes_flag=true; CCS_YES=1 ;;
      *) profile_name="$1" ;;
    esac
    shift
  done

  [[ -z "$profile_name" ]] && {
    msg_error "Profile name required"
    echo "Usage: ccs auth remove <profile> [--yes]"
    return 1
  }

  profile_exists "$profile_name" || {
    msg_error "Profile not found: $profile_name"
    return 1
  }

  # Display impact
  local instance_path="$INSTANCES_DIR/$(sanitize_profile_name "$profile_name")"
  local session_count=$(find "$instance_path/session-env" -type f 2>/dev/null | wc -l)

  echo ""
  echo "Profile '$profile_name' will be permanently deleted."
  echo "  Instance path: $instance_path"
  echo "  Sessions: $session_count conversations"
  echo ""

  # Confirm
  if ! confirm_action "Delete this profile?" "no"; then
    echo "[i] Cancelled"
    return 0
  fi

  # Delete
  rm -rf "$instance_path"
  unregister_profile "$profile_name"

  echo -e "${GREEN}[OK] Profile removed successfully${RESET}"
}
```

## Implementation Steps

### Day 1 (4h)
1. Create `bin/utils/prompt.js` with InteractivePrompt class
2. Create bash confirm_action() function
3. Create PowerShell confirmation function
4. Add `--yes` and `--no-input` flag parsing

### Day 2 (4h)
1. Update `auth remove` in all implementations
2. Add impact display (session count, paths)
3. Test interactive vs non-interactive modes
4. Test cancellation behavior

### Day 3 (2h)
1. Test on macOS/Linux/Windows
2. Test CI environment (--no-input)
3. Update documentation
4. Code review and merge

## Todo List

- [ ] Create interactive prompt utilities (JS/bash/PowerShell)
- [ ] Add `--yes` and `--no-input` flag support
- [ ] Update `ccs auth remove` with confirmation prompt
- [ ] Add impact display before confirmation
- [ ] Test TTY vs non-TTY behavior
- [ ] Test automation scenarios (--yes, --no-input)
- [ ] Update --help with new flags
- [ ] Update documentation
- [ ] Code review and merge

## Success Criteria

- [ ] Interactive prompts work in TTY
- [ ] `--yes` bypasses all prompts
- [ ] `--no-input` fails on required interaction
- [ ] Impact clearly displayed before confirmation
- [ ] Invalid input handled gracefully
- [ ] Cross-platform consistency

## Related Files

- **NEW:** `bin/utils/prompt.js`
- **NEW:** `lib/prompt.sh`
- **NEW:** `lib/prompt.ps1`
- `bin/auth/auth-commands.js` - remove command
- `lib/ccs` L901-940 - auth_remove
- `lib/ccs.ps1` - auth remove implementation

---

**Effort:** 2-3 days | **Ready:** After Phase 1
