# CLI UX Improvement Testing Plan

**Date:** 2025-11-14
**Environment:** Unix (Linux/macOS)
**Versions to Test:**
- Node.js version: `bin/ccs.js`
- Native bash version: `lib/ccs`

## Pre-Test Setup

### 1. Verify Installation
```bash
# Check CCS is installed
which ccs
ccs --version

# Check dependencies
which jq
which node
node --version  # Should be 14+
bash --version  # Should be 3.2+
```

### 2. Clean Test Environment
```bash
# Backup existing CCS data (if any)
mv ~/.ccs ~/.ccs.backup.$(date +%s) 2>/dev/null || true

# Fresh start
rm -rf ~/.ccs
```

### 3. Initialize Test Profiles
```bash
# Create test profiles for testing
mkdir -p ~/.ccs
cat > ~/.ccs/profiles.json <<'EOF'
{
  "profiles": {
    "test-work": {
      "type": "account",
      "created": "2025-11-14T00:00:00.000Z"
    },
    "test-personal": {
      "type": "account",
      "created": "2025-11-14T00:00:00.000Z"
    }
  },
  "default": "test-work"
}
EOF

# Create dummy instance directories
mkdir -p ~/.ccs/instances/test-work/session-env
mkdir -p ~/.ccs/instances/test-personal/session-env

# Create dummy session files
touch ~/.ccs/instances/test-work/session-env/session1.json
touch ~/.ccs/instances/test-work/session-env/session2.json
touch ~/.ccs/instances/test-personal/session-env/session3.json
```

---

## Phase 1: Error Messaging Enhancement

### Test 1.1: Error Codes Display

**Node.js Version:**
```bash
# Test invalid profile (should show E401)
node bin/ccs.js nonexistent-profile "test" 2>&1 | grep -E "E[0-9]{3}"
```

**Expected Output:**
- Should display error code (e.g., E401)
- Should display documentation URL

**Bash Version:**
```bash
# Same test
lib/ccs nonexistent-profile "test" 2>&1 | grep -E "E[0-9]{3}"
```

### Test 1.2: Fuzzy Matching "Did You Mean?"

**Node.js Version:**
```bash
# Typo: "wrk" instead of "work"
node bin/ccs.js test-wrk "test" 2>&1 | grep -i "did you mean"
```

**Expected Output:**
```
[X] Profile 'test-wrk' not found

Did you mean:
  test-work
  test-personal

Available profiles:
  test-work
  test-personal
```

**Bash Version:**
```bash
# Same test
lib/ccs test-wrk "test" 2>&1 | grep -i "did you mean"
```

### Test 1.3: EXAMPLES Section in Help

**Node.js Version:**
```bash
node bin/ccs.js --help | grep -A 10 "EXAMPLES:"
```

**Expected Output:**
- Should have EXAMPLES section
- Should show practical usage examples

**Bash Version:**
```bash
lib/ccs --help | grep -A 10 "Examples:"
```

### Test 1.4: Enhanced Error Messages

**Node.js Version:**
```bash
# Test missing jq dependency (temporarily rename jq)
sudo mv /usr/bin/jq /usr/bin/jq.backup 2>/dev/null || true
node bin/ccs.js auth list 2>&1
sudo mv /usr/bin/jq.backup /usr/bin/jq 2>/dev/null || true
```

**Expected Output:**
- Clear error message about missing jq
- Installation instructions
- Solutions section

---

## Phase 2: Progress Indicators

### Test 2.1: GLMT Proxy Spinner (Node.js only)

**Setup:**
```bash
# Ensure GLMT config exists
mkdir -p ~/.ccs
cat > ~/.ccs/glmt.settings.json <<'EOF'
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "test-key",
    "ANTHROPIC_MODEL": "glm-4.6"
  }
}
EOF
```

**Test:**
```bash
# This will fail but we should see spinner
timeout 3s node bin/ccs.js glmt "test" 2>&1 || true
```

**Expected Output:**
- Should show spinner: `[|] Starting GLMT proxy... (0.5s)`
- Spinner should animate (|, /, -, \)
- Should show elapsed time

### Test 2.2: Doctor Command Progress

**Node.js Version:**
```bash
node bin/ccs.js doctor 2>&1 | head -20
```

**Expected Output:**
- Should show progress for each check
- TTY: Animated progress indicator
- Non-TTY: Static [i] messages

**Bash Version:**
```bash
lib/ccs doctor 2>&1 | head -20
```

**Expected Output:**
- Should show `[1/9]`, `[2/9]`, etc.
- Progress counter for all health checks

### Test 2.3: TTY Detection

**Test in TTY (should show colors/spinners):**
```bash
node bin/ccs.js doctor
```

**Test in pipe (should NOT show spinners):**
```bash
node bin/ccs.js doctor 2>&1 | cat
```

**Test with NO_COLOR:**
```bash
NO_COLOR=1 node bin/ccs.js doctor
```

---

## Phase 3: Interactive Prompts

### Test 3.1: Auth Remove Confirmation Prompt

**Node.js Version:**
```bash
# Should prompt for confirmation
echo "n" | node bin/ccs.js auth remove test-personal
```

**Expected Output:**
```
Profile 'test-personal' will be permanently deleted.
  Instance path: ~/.ccs/instances/test-personal
  Sessions: 1 conversation

Delete this profile? [y/N]:
[i] Cancelled
```

**Bash Version:**
```bash
# Should prompt for confirmation
echo "n" | lib/ccs auth remove test-personal
```

### Test 3.2: --yes Flag (Auto-confirm)

**Node.js Version:**
```bash
# Should NOT prompt, just delete
node bin/ccs.js auth remove test-personal --yes
```

**Expected Output:**
- No prompt shown
- Profile deleted immediately

**Bash Version:**
```bash
# Recreate profile first
# ... (recreate test-personal)

lib/ccs auth remove test-personal --yes
```

### Test 3.3: Impact Display

**Node.js Version:**
```bash
# Should show impact before prompting
echo "n" | node bin/ccs.js auth remove test-work 2>&1 | grep -E "Sessions:|Instance path:"
```

**Expected Output:**
```
  Instance path: ~/.ccs/instances/test-work
  Sessions: 2 conversations
```

### Test 3.4: Non-TTY Behavior

**Node.js Version:**
```bash
# Non-TTY: Should use default (NO) and cancel
node bin/ccs.js auth remove test-work < /dev/null 2>&1
```

**Expected Output:**
- Should NOT prompt (not a TTY)
- Should cancel (default is NO)

---

## Phase 4: JSON Output

### Test 4.1: Auth List JSON Output

**Node.js Version:**
```bash
node bin/ccs.js auth list --json | jq .
```

**Expected Output:**
```json
{
  "version": "3.4.6",
  "profiles": [
    {
      "name": "test-work",
      "type": "account",
      "is_default": true,
      "created": "2025-11-14T00:00:00.000Z",
      "last_used": null,
      "instance_path": "..."
    }
  ]
}
```

**Validation:**
```bash
# Check version is CCS version (not "1.0")
node bin/ccs.js auth list --json | jq -r '.version' | grep -v "1.0"

# Check it's valid JSON
node bin/ccs.js auth list --json | jq . > /dev/null && echo "Valid JSON"
```

**Bash Version:**
```bash
lib/ccs auth list --json | jq .
```

### Test 4.2: Auth Show JSON Output

**Node.js Version:**
```bash
node bin/ccs.js auth show test-work --json | jq .
```

**Expected Output:**
```json
{
  "name": "test-work",
  "type": "account",
  "is_default": true,
  "created": "2025-11-14T00:00:00.000Z",
  "last_used": null,
  "instance_path": "...",
  "session_count": 2
}
```

**Validation:**
```bash
# Check session_count is present
node bin/ccs.js auth show test-work --json | jq -r '.session_count'
```

**Bash Version:**
```bash
lib/ccs auth show test-work --json | jq .
```

### Test 4.3: Empty Profiles JSON

**Node.js Version:**
```bash
# Remove all profiles temporarily
mv ~/.ccs/profiles.json ~/.ccs/profiles.json.backup
echo '{"profiles":{}}' > ~/.ccs/profiles.json

node bin/ccs.js auth list --json | jq .
```

**Expected Output:**
```json
{
  "version": "3.4.6",
  "profiles": []
}
```

**Restore:**
```bash
mv ~/.ccs/profiles.json.backup ~/.ccs/profiles.json
```

### Test 4.4: JSON vs Human-Readable Output

**Node.js Version:**
```bash
# Human-readable (default)
node bin/ccs.js auth list | head -5

# JSON
node bin/ccs.js auth list --json | head -5
```

**Validation:**
- Default output should be colorful, formatted
- JSON output should be machine-readable

---

## Phase 5: Cross-Platform Consistency

### Test 5.1: Error Box Format (ASCII Only)

**Bash Version:**
```bash
lib/ccs nonexistent 2>&1 | head -10
```

**Expected Output:**
```
=============================================
  ERROR
=============================================

[X] Profile 'nonexistent' not found
```

**Validation:**
```bash
# Should NOT contain Unicode box chars
lib/ccs nonexistent 2>&1 | grep -v "╔\|═\|╗\|║\|╚\|╝"
```

### Test 5.2: Color Consistency

**Test Colors in TTY:**
```bash
# Node.js
node bin/ccs.js --help | cat -v | grep -E "\[.*m"

# Bash
lib/ccs --help | cat -v | grep -E "\[.*m"
```

**Expected Output:**
- Both should use ANSI color codes
- Color codes should be consistent

**Test NO_COLOR:**
```bash
# Should NOT show colors
NO_COLOR=1 node bin/ccs.js --help | cat -v | grep -E "\[.*m" && echo "FAIL: Colors shown" || echo "PASS: No colors"
NO_COLOR=1 lib/ccs --help | cat -v | grep -E "\[.*m" && echo "FAIL: Colors shown" || echo "PASS: No colors"
```

### Test 5.3: Help Text Consistency

**Compare Structure:**
```bash
# Node.js help sections
node bin/ccs.js --help | grep -E "^[A-Z][a-z]+:" | sort

# Bash help sections
lib/ccs --help | grep -E "^[A-Z][a-z]+:" | sort
```

**Expected Output:**
- Both should have same section names
- Same order of sections

---

## Phase 6: Shell Completion

### Test 6.1: Bash Completion

**Setup:**
```bash
# Source completion
source scripts/completion/ccs.bash
```

**Test:**
```bash
# Test top-level completion (simulated)
compgen -W "$(complete -p ccs | grep -oP '(?<=-W ")[^"]*')" -- ""

# Should include: auth, doctor, test-work, test-personal, --help, --version
```

**Interactive Test:**
```bash
# Type and press TAB (manual test)
ccs <TAB>
ccs auth <TAB>
ccs auth show <TAB>
```

### Test 6.2: Fish Completion (if Fish installed)

**Setup:**
```bash
# Check if Fish is installed
if command -v fish &>/dev/null; then
    mkdir -p ~/.config/fish/completions
    cp scripts/completion/ccs.fish ~/.config/fish/completions/

    # Test in Fish
    fish -c "complete -C'ccs '"
fi
```

### Test 6.3: Completion Functions

**Bash:**
```bash
# Verify completion function is registered
complete -p ccs
```

**Expected Output:**
```
complete -F _ccs_completion ccs
```

---

## Validation Checklist

### Phase 1: Error Messaging
- [ ] Error codes displayed (E001-E999)
- [ ] "Did you mean?" suggestions work
- [ ] EXAMPLES section in help (both versions)
- [ ] Error messages show solutions

### Phase 2: Progress Indicators
- [ ] GLMT spinner works (Node.js)
- [ ] Doctor progress display (both versions)
- [ ] TTY detection works (colors/spinners only in TTY)
- [ ] NO_COLOR respected

### Phase 3: Interactive Prompts
- [ ] Auth remove prompts for confirmation
- [ ] --yes flag skips confirmation
- [ ] Impact displayed (sessions, path)
- [ ] Safe default (N) for destructive ops

### Phase 4: JSON Output
- [ ] auth list --json works (both versions)
- [ ] auth show --json works (both versions)
- [ ] JSON version is CCS version (not "1.0")
- [ ] session_count included
- [ ] Valid JSON output

### Phase 5: Cross-Platform Consistency
- [ ] Error boxes use ASCII (no Unicode)
- [ ] Colors consistent across versions
- [ ] Help text structure matches

### Phase 6: Shell Completion
- [ ] Bash completion loads
- [ ] Completes profiles, commands, flags
- [ ] Fish completion works (if Fish installed)

---

## Post-Test Cleanup

```bash
# Remove test profiles
rm -rf ~/.ccs

# Restore backup if it exists
if [ -d ~/.ccs.backup.* ]; then
    latest_backup=$(ls -td ~/.ccs.backup.* | head -1)
    mv "$latest_backup" ~/.ccs
fi
```

---

## Known Issues / Expected Failures

1. **GLMT Proxy Test**: Will fail if no valid API key - this is expected
2. **Doctor Command**: Some checks may fail if Claude CLI not installed - expected
3. **PowerShell Tests**: Skipped on Unix (PowerShell not commonly available)

---

## Success Criteria

**Pass Rate:** 90%+ of tests should pass

**Critical Tests (Must Pass):**
- Error codes display
- "Did you mean?" suggestions
- JSON output is valid
- ASCII-only error boxes
- Shell completion loads

**Nice-to-Have Tests:**
- GLMT spinner (requires API key)
- Doctor progress (requires Claude CLI)
