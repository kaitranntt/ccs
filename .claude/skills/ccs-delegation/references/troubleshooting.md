# Troubleshooting

AI-oriented error resolution guide for CCS delegation issues.

## Error Pattern Matching

### Profile Configuration Errors

**Pattern:** `Profile 'X' is not configured for delegation`
```
Root cause: Missing ~/.ccs/{profile}.settings.json
Resolution:
  1. Check file exists: ls ~/.ccs/{profile}.settings.json
  2. Run diagnostics: ccs doctor
  3. If missing, user must configure profile manually
```

**Pattern:** `Invalid API key` (401 error)
```
Root cause: API token expired or invalid
Resolution:
  1. Verify token exists in settings.json
  2. Test with simple command: ccs {profile} "test"
  3. If fails, user must regenerate token from provider
```

**Pattern:** `Settings file not found`
```
Root cause: ~/.ccs/{profile}.settings.json doesn't exist
Resolution:
  1. Run: ccs doctor
  2. Shows missing profiles
  3. User must configure manually
```

### Delegation Execution Errors

**Pattern:** `No previous session found for {profile}`
```
Root cause: Using :continue without initial session
Resolution:
  - Cannot use ccs {profile}:continue without prior session
  - Must run: ccs {profile} -p "initial task" first
  - Then can continue with: ccs {profile}:continue -p "follow-up"
Example:
  [X] ccs glm:continue -p "task"  # ERROR: no session
  [OK] ccs glm -p "task"          # Creates session
  [OK] ccs glm:continue -p "more" # Uses session
```

**Pattern:** `Missing prompt after -p flag`
```
Root cause: No argument provided after -p
Resolution:
  - Syntax: ccs {profile} -p "prompt text"
  - Quote prompt if contains spaces
Example:
  [X] ccs glm -p                    # ERROR
  [OK] ccs glm -p "add tests"       # Correct
```

**Pattern:** `No profile specified`
```
Root cause: Command missing profile name
Resolution:
  - Syntax: ccs <profile> -p "task"
  - Available profiles: glm, kimi
Example:
  [X] ccs -p "task"           # ERROR: no profile
  [OK] ccs glm -p "task"      # Correct
```

**Pattern:** Exit code 1 with JSON parse error
```
Root cause: Claude CLI returned non-stream-JSON output
Resolution:
  1. Check if --output-format stream-json is supported
  2. Verify Claude CLI version (need recent version with stream-json support)
  3. Test manually: claude -p "test" --output-format stream-json
  4. If not supported, delegation won't work
```

### Session Management Errors

**Pattern:** Session file corrupted
```
Root cause: ~/.ccs/delegation-sessions.json malformed
Resolution:
  1. Backup file: cp ~/.ccs/delegation-sessions.json ~/.ccs/delegation-sessions.json.bak
  2. Delete corrupted file: rm ~/.ccs/delegation-sessions.json
  3. New file created on next delegation
  4. Previous sessions lost but fresh start
```

**Pattern:** Session expired
```
Root cause: Session older than 30 days
Resolution:
  - Sessions auto-expire after 30 days
  - Start new session: ccs {profile} -p "task"
  - Cannot resume expired sessions
```

### Network & API Errors

**Pattern:** Connection timeout
```
Root cause: Network issue or API endpoint unreachable
Resolution:
  1. Check internet: ping 8.8.8.8
  2. Verify API endpoint in settings.json
  3. Check firewall/proxy settings
  4. Retry delegation
```

**Pattern:** Rate limiting (429)
```
Root cause: Too many API requests
Resolution:
  1. Wait 60 seconds before retry
  2. Reduce concurrent delegations
  3. Check API quota limits
```

### File Operation Errors

**Pattern:** File not found during delegation
```
Root cause: Path doesn't exist or wrong working directory
Resolution:
  1. Delegation runs in cwd where command executed
  2. Verify file exists: ls <file>
  3. Use absolute paths in prompt if needed
Example:
  Prompt: "refactor src/auth.js"
  Check: ls src/auth.js  # Must exist in cwd
```

**Pattern:** Permission denied writing files
```
Root cause: Insufficient permissions in target directory
Resolution:
  1. Check directory permissions: ls -la
  2. Verify cwd is writable
  3. Don't delegate in read-only directories
```

## Diagnostic Commands

**Profile validation:**
```bash
ccs doctor                              # Check all profiles
cat ~/.ccs/glm.settings.json            # Verify settings
ccs glm "echo test" 2>&1                # Test execution
```

**Session inspection:**
```bash
cat ~/.ccs/delegation-sessions.json     # View sessions
jq '.glm' ~/.ccs/delegation-sessions.json  # Check specific profile
```

**Delegation test:**
```bash
ccs glm -p "create test.txt file with 'hello'"  # Simple test
cat test.txt                            # Verify result
```

**Debug mode:**
```bash
export CCS_DEBUG=1
ccs glm -p "task" 2>&1 | tee debug.log  # Capture full output
```

## Decision Tree

```
Delegation fails?
  │
  ├─→ "Profile not configured"
  │     └─→ Run: ccs doctor
  │           └─→ Configure missing profile
  │
  ├─→ "No previous session"
  │     └─→ Using :continue?
  │           ├─→ YES: Run initial task first
  │           └─→ NO: Different error
  │
  ├─→ "Missing prompt"
  │     └─→ Check syntax: ccs {profile} -p "prompt"
  │
  ├─→ Exit code 1
  │     └─→ Check error message
  │           ├─→ JSON parse: Claude CLI version issue
  │           ├─→ File not found: Verify paths
  │           └─→ API error: Check network/token
  │
  └─→ Silent failure
        └─→ Enable debug: export CCS_DEBUG=1
```

## Common Patterns to Avoid

**Anti-pattern:** Delegating without profile validation
```
[X] Assume profile exists
[OK] Run ccs doctor first to verify
```

**Anti-pattern:** Using :continue immediately
```
[X] ccs glm:continue -p "task"  # No initial session
[OK] ccs glm -p "task" && ccs glm:continue -p "more"
```

**Anti-pattern:** Delegating complex tasks
```
[X] ccs glm -p "implement OAuth2"  # Too complex
[OK] ccs glm -p "add tests for login function"
```

**Anti-pattern:** Vague prompts
```
[X] ccs glm -p "fix the bug"  # No context
[OK] ccs glm -p "fix typo in src/auth.js line 42"
```

## Recovery Procedures

**Reset session state:**
```bash
rm ~/.ccs/delegation-sessions.json
# Fresh start, all sessions lost
```

**Reconfigure profile:**
```bash
ccs doctor  # Shows issues
# Edit ~/.ccs/{profile}.settings.json manually
# Verify: ccs {profile} "test"
```

**Test delegation flow:**
```bash
# 1. Simple task
ccs glm -p "create test.txt with content 'hello'"

# 2. Verify session created
cat ~/.ccs/delegation-sessions.json | jq '.glm.sessionId'

# 3. Test continue
ccs glm:continue -p "append 'world' to test.txt"

# 4. Verify aggregation
cat ~/.ccs/delegation-sessions.json | jq '.glm.turns'
```

## Emergency Fallback

If delegation completely broken:
```bash
# Use Claude CLI directly
claude -p "task" --settings ~/.ccs/glm.settings.json

# Bypass delegation (no -p flag)
ccs glm
# Then work interactively
```
