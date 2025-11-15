# Phase 5: Discovery & Integration

## Context Links

- **Parent Plan**: [plan.md](plan.md)
- **Dependencies**: Phase 4 (custom model support complete)
- **Related**: All previous phases

## Overview

**Date**: 2025-11-15
**Description**: Add delegation hints to --help/--version/list, final cleanup
**Priority**: P2 (Medium - improves discoverability)
**Implementation Status**: ⏳ Not Started (blocked by Phase 4)
**Review Status**: ⏳ Awaiting User Review

## Key Insights

- Users won't discover delegation without prominent hints
- --help must mention delegation prominently
- --version should show delegation status
- ccs list should indicate delegation-ready profiles

## Requirements

### Functional

1. **Update ccs --help**
   - Add "Delegation" section
   - Show `/ccs:glm`, `/ccs:kimi`, `/ccs:create` examples
   - Explain delegation benefits (token optimization)
   - Link to delegation docs

2. **Update ccs --version**
   - Show delegation system status (enabled/disabled)
   - Show available delegation profiles
   - Show delegation-rules.json location

3. **Update ccs list** (auth list)
   - Add column: "Delegation Ready" (yes/no/unconfigured)
   - Show API key status (configured/default/missing)
   - Hint to configure delegation

4. **Update ccs doctor**
   - Add delegation validation check
   - Check delegation-rules.json exists
   - Check GLM/Kimi API keys configured
   - Report delegation health

### Non-Functional

- Hints are noticeable but not intrusive
- ASCII-only formatting (no emojis)
- Consistent with existing CCS style
- Cross-platform parity

## Architecture

**Existing Files to Modify**:
- `bin/ccs.js` (handleHelpCommand, handleVersionCommand)
- `lib/ccs` (show_help, show_version)
- `lib/ccs.ps1` (Show-Help, Show-Version)
- `bin/auth/auth-commands.js` (auth_list)
- `bin/management/doctor.js` (doctor checks)

**No New Files** (modifications only)

## Implementation Steps

### 1. Update --help Output

**Add to bin/ccs.js handleHelpCommand()**:

```javascript
// After "Model Switching:" section
console.log(colored('Delegation (Token Optimization):', 'cyan'));
console.log(`  ${colored('/ccs:glm "task"', 'yellow')}              Delegate to GLM-4.6 within Claude session`);
console.log(`  ${colored('/ccs:kimi "task"', 'yellow')}             Delegate to Kimi for long context`);
console.log(`  ${colored('/ccs:create m2', 'yellow')}              Create custom delegation command`);
console.log('  Use delegation to save tokens on simple tasks');
console.log('');
```

**Replicate in lib/ccs and lib/ccs.ps1**

### 2. Update --version Output

**Add to bin/ccs.js handleVersionCommand()**:

```javascript
// After "Config:" line
const delegationRulesPath = path.join(os.homedir(), '.ccs', 'delegation-rules.json');
const delegationEnabled = fs.existsSync(delegationRulesPath);

console.log(`  ${colored('Delegation:', 'cyan')} ${delegationEnabled ? 'Enabled' : 'Not Configured'}`);

if (delegationEnabled) {
  const rules = JSON.parse(fs.readFileSync(delegationRulesPath));
  const readyProfiles = ['glm', 'kimi'].filter(p => {
    const settingsPath = path.join(os.homedir(), '.ccs', 'profiles', p, 'settings.json');
    if (!fs.existsSync(settingsPath)) return false;
    const settings = JSON.parse(fs.readFileSync(settingsPath));
    return settings.env.ANTHROPIC_AUTH_TOKEN !== 'YOUR_GLM_API_KEY_HERE';
  });

  console.log(`  ${colored('Ready Profiles:', 'cyan')} ${readyProfiles.join(', ') || 'none'}`);
}
console.log('');
```

### 3. Update ccs auth list

**Modify bin/auth/auth-commands.js auth_list()**:

```javascript
// Add delegation status column
while IFS= read -r profile; do
  const isDelegationReady = checkDelegationReady(profile);
  const status = isDelegationReady ? '[READY]' : '[UNCONFIGURED]';

  echo -e "[ ] ${CYAN}$profile${RESET} ${status}";
  echo "    Type: $type";

  if (!isDelegationReady) {
    echo "    Delegation: Configure API key in settings.json";
  }
done
```

### 4. Update ccs doctor

**Add to bin/management/doctor.js**:

```javascript
// New check: Delegation System
console.log(colored('[i] Checking delegation system...', 'cyan'));

const delegationRulesPath = path.join(os.homedir(), '.ccs', 'delegation-rules.json');
if (fs.existsSync(delegationRulesPath)) {
  console.log(colored('[OK] delegation-rules.json found', 'green'));

  // Check GLM profile
  const glmSettings = path.join(os.homedir(), '.ccs', 'profiles', 'glm', 'settings.json');
  if (fs.existsSync(glmSettings)) {
    const settings = JSON.parse(fs.readFileSync(glmSettings));
    if (settings.env.ANTHROPIC_AUTH_TOKEN === 'YOUR_GLM_API_KEY_HERE') {
      console.log(colored('[!] GLM API key not configured', 'yellow'));
      console.log('    Edit ~/.ccs/profiles/glm/settings.json');
    } else {
      console.log(colored('[OK] GLM delegation ready', 'green'));
    }
  }

  // Check Kimi profile
  const kimiSettings = path.join(os.homedir(), '.ccs', 'profiles', 'kimi', 'settings.json');
  if (fs.existsSync(kimiSettings)) {
    const settings = JSON.parse(fs.readFileSync(kimiSettings));
    if (settings.env.ANTHROPIC_AUTH_TOKEN === 'YOUR_KIMI_API_KEY_HERE') {
      console.log(colored('[!] Kimi API key not configured', 'yellow'));
    } else {
      console.log(colored('[OK] Kimi delegation ready', 'green'));
    }
  }
} else {
  console.log(colored('[!] Delegation not configured', 'yellow'));
  console.log('    Run ccs to initialize delegation-rules.json');
}
```

## Related Code Files

**Files to Modify**:
- `bin/ccs.js` (3 functions: handleHelp, handleVersion, main)
- `lib/ccs` (2 functions: show_help, show_version)
- `lib/ccs.ps1` (2 functions: Show-Help, Show-Version)
- `bin/auth/auth-commands.js` (auth_list function)
- `bin/management/doctor.js` (doctor checks)

## Implementation Steps

1. **Update --help in all platforms**
   - Modify bin/ccs.js
   - Modify lib/ccs
   - Modify lib/ccs.ps1
   - Verify consistent formatting

2. **Update --version in all platforms**
   - Add delegation status check
   - Add ready profiles list
   - Test on all platforms

3. **Update ccs auth list**
   - Add delegation ready column
   - Add API key status hints
   - Test output formatting

4. **Update ccs doctor**
   - Add delegation checks
   - Add GLM/Kimi API key validation
   - Test health check flow

5. **Cross-platform verification**
   - Test on macOS (Node.js + Bash)
   - Test on Linux (Node.js + Bash)
   - Test on Windows (Node.js + PowerShell)

## Todo List

- [ ] Update bin/ccs.js handleHelpCommand()
- [ ] Update bin/ccs.js handleVersionCommand()
- [ ] Update lib/ccs show_help()
- [ ] Update lib/ccs show_version()
- [ ] Update lib/ccs.ps1 Show-Help
- [ ] Update lib/ccs.ps1 Show-Version
- [ ] Update bin/auth/auth-commands.js auth_list()
- [ ] Update bin/management/doctor.js
- [ ] Test --help output (all platforms)
- [ ] Test --version output (all platforms)
- [ ] Test auth list output
- [ ] Test doctor checks
- [ ] Verify NO_COLOR support
- [ ] Update README.md delegation section

## Success Criteria

- ✓ --help shows delegation section prominently
- ✓ --version shows delegation status
- ✓ auth list shows delegation readiness
- ✓ doctor validates delegation setup
- ✓ All platforms show identical info
- ✓ NO_COLOR respected everywhere
- ✓ ASCII-only formatting maintained
- ✓ Users can discover delegation easily

## Risk Assessment

**LOW RISK**: Formatting changes only, no logic modifications

**Mitigation**:
- Test output on all platforms
- Verify NO_COLOR handling
- Check for breaking changes in existing output parsers

## Security Considerations

1. **API Key Exposure**
   - Never log API keys in --version or doctor
   - Only show configured/unconfigured status
   - Don't leak sensitive paths

2. **Information Disclosure**
   - Don't expose internal file structures
   - Sanitize error messages
   - Keep hints user-friendly

## Next Steps

1. User approves discovery changes
2. Update help/version/list/doctor in order
3. Cross-platform testing
4. README documentation update
5. Move to Phase 6 (final testing)
