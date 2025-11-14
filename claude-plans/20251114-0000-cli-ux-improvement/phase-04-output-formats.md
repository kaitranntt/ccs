# Phase 4: Output Format Options

## Context

**Parent Plan:** [CLI UI/UX Improvement Plan](plan.md)
**Priority:** P2 | **Status:** Not Started

## Overview

Add `--json` and `--quiet` output modes for scripting and automation support.

## Requirements

1. `--json` flag for `ccs auth list`, `ccs auth show`
2. `--quiet` flag for minimal output
3. Structured JSON schema for programmatic consumption
4. Backward compatibility (default output unchanged)

## Architecture

### JSON Output Schema

```json
// ccs auth list --json
{
  "version": "1.0",
  "profiles": [
    {
      "name": "work",
      "type": "account",
      "is_default": true,
      "created": "2025-11-14T00:00:00.000Z",
      "last_used": "2025-11-14T12:30:00.000Z",
      "instance_path": "~/.ccs/instances/work"
    },
    {
      "name": "glm",
      "type": "settings",
      "is_default": false,
      "settings_path": "~/.ccs/glm.settings.json"
    }
  ]
}

// ccs auth show work --json
{
  "name": "work",
  "type": "account",
  "is_default": true,
  "created": "2025-11-14T00:00:00.000Z",
  "last_used": "2025-11-14T12:30:00.000Z",
  "instance_path": "~/.ccs/instances/work",
  "session_count": 15
}

// ccs --version --json
{
  "version": "3.5.0",
  "install_location": "/usr/local/bin/ccs",
  "config_path": "~/.ccs/config.json"
}
```

### Implementation (bin/auth/auth-commands.js)

```javascript
async list(args) {
  const jsonFlag = args.includes('--json');
  const registry = new ProfileRegistry();
  const profiles = registry.list();

  if (jsonFlag) {
    const output = {
      version: '1.0',
      profiles: profiles.map(p => ({
        name: p.name,
        type: p.type,
        is_default: p.isDefault,
        created: p.created,
        last_used: p.lastUsed,
        instance_path: p.type === 'account' ? p.instancePath : undefined,
        settings_path: p.type === 'settings' ? p.settingsPath : undefined
      }))
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    // Existing human-readable output
    this.displayProfiles(profiles);
  }
}
```

### Bash Implementation

```bash
auth_list() {
  local json_flag=false
  [[ "${1:-}" == "--json" ]] && json_flag=true

  if $json_flag; then
    # JSON output
    jq -n \
      --argjson profiles "$(jq '.profiles' "$PROFILES_JSON")" \
      '{version: "1.0", profiles: $profiles}'
  else
    # Human-readable output (existing)
    # ...
  fi
}
```

## Implementation Steps

1. Add JSON output to `ccs auth list` (all platforms)
2. Add JSON output to `ccs auth show` (all platforms)
3. Add JSON output to `ccs --version` (all platforms)
4. Add `--quiet` flag for silent operations
5. Document JSON schema in docs/
6. Test with `jq` parsing
7. Update --help with new flags

## Todo List

- [ ] Design JSON output schemas
- [ ] Implement --json for auth commands (JS/bash/PowerShell)
- [ ] Implement --json for version command
- [ ] Implement --quiet flag
- [ ] Add JSON schema documentation
- [ ] Test with real automation scripts
- [ ] Update --help documentation
- [ ] Code review and merge

## Success Criteria

- [ ] `ccs auth list --json` outputs valid JSON
- [ ] JSON schema is stable and documented
- [ ] `--quiet` suppresses non-essential output
- [ ] Default output unchanged (backward compatibility)
- [ ] jq can parse all JSON outputs

## Related Files

- `bin/auth/auth-commands.js` - list/show commands
- `lib/ccs` - auth_list, auth_show functions
- `lib/ccs.ps1` - PowerShell equivalents
- **NEW:** `docs/json-schema.md` - Schema documentation

---

**Effort:** 2-3 days | **Ready:** Independent
