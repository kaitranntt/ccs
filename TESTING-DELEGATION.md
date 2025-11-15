# Testing CCS Delegation System

Quick guide to test the new CCS delegation features with GLM/Kimi models.

## Prerequisites

### 1. Verify CCS Installation

```bash
cd /home/user/ccs

# Check CCS version
ccs --version

# Run comprehensive health check
ccs doctor
```

**Expected output:**
- ✅ `[OK] (glm ready)` - GLM profile configured
- ⚠️ `[!] (no profiles ready)` - Need to configure GLM profile (see Step 2)

### 2. Configure GLM Profile (First Time Only)

**Get your API key:**
- Visit: https://open.bigmodel.cn/usercenter/apikeys
- Register/login and create an API key

**Configure CCS:**
```bash
# Check current settings
cat ~/.ccs/profiles/glm/settings.json

# Edit the file
nano ~/.ccs/profiles/glm/settings.json
```

**Replace placeholder with real API key:**
```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "your-actual-api-key-here",
    "ANTHROPIC_MODEL": "glm-4.6",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "glm-4.6",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "glm-4.6",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "glm-4.6"
  }
}
```

**Verify configuration:**
```bash
ccs doctor
# Should now show: [OK] (glm ready)
```

## Testing Workflow

### Step 1: Start Claude Code Session

```bash
cd /home/user/ccs
claude
```

### Step 2: Test Basic Delegation

**Simple file modification:**
```
/ccs:glm "add JSDoc comments to bin/utils/helpers.js explaining what the colored() function does"
```

**Expected result:**
```
[i] Delegated to GLM-4.6 (ccs:glm)

╔══════════════════════════════════════╗
║ Working Directory: /home/user/ccs    ║
║ Model: GLM-4.6                       ║
║ Duration: 2.5s                       ║
║ Exit Code: 0                         ║
║ Files Created: 0                     ║
║ Files Modified: 1                    ║
╚══════════════════════════════════════╝

[i] Modified Files:
  - bin/utils/helpers.js

[OK] Delegation completed
```

**Verify changes:**
```bash
git status
git diff bin/utils/helpers.js
```

### Step 3: Test File Creation

```
/ccs:glm "create tests/unit/helpers.test.js with tests for the colored() function from bin/utils/helpers.js"
```

**Expected:**
- ✅ New file created: `tests/unit/helpers.test.js`
- ✅ File tracked in delegation report
- ✅ Tests are valid and runnable

**Verify:**
```bash
cat tests/unit/helpers.test.js
node tests/unit/helpers.test.js  # Run the test
```

### Step 4: Test CCS Skill Proactive Suggestions

**Ask without using `/ccs:glm`:**
```
Can you add comprehensive unit tests for the DelegationValidator class?
```

**Expected behavior:**
- ✅ CCS skill activates automatically
- ✅ Claude suggests: "This looks like a simple task - should I delegate to GLM to save tokens?"
- ✅ Offers to use `/ccs:glm` delegation

### Step 5: Test Error Handling

**Try to modify non-existent file:**
```
/ccs:glm "fix the bug in nonexistent/missing.js"
```

**Expected:**
- ✅ Delegation fails gracefully
- ✅ Exit code: 1
- ✅ Clear error message: "File not found" or similar
- ✅ Stderr shows details
- ✅ No crash or hanging

### Step 6: Test CWD Resolution

**Explicit directory hint:**
```
/ccs:glm "in bin/utils/, create a new validation-helpers.js file with input sanitization utilities"
```

**Expected:**
- ✅ File created in `bin/utils/` directory
- ✅ CWD shown in report: `.../bin/utils/`

**File reference hint:**
```
/ccs:glm "add JSDoc to bin/delegation/cwd-resolver.js"
```

**Expected:**
- ✅ CWD resolves to `bin/delegation/`
- ✅ Correct file modified

### Step 7: Test Validation Script

```bash
node .claude/skills/ccs/scripts/validate-setup.js
```

**Expected output:**
```
=== CCS Delegation Setup Validator ===

[?] Checking CCS installation... [OK]
[?] Checking delegation commands... [OK]
[?] Checking glm profile... [OK]
[?] Checking kimi profile... [!]

✓ Delegation ready with: glm

═══════════════════════════════════════════
Validation Report
═══════════════════════════════════════════

✓ Successes:
  CCS installed: CCS (Claude Code Switch) v4.0.0
  All delegation commands present
  glm profile ready (API key: sk-ant-1...)

⚠ Warnings:
  kimi profile not found
    Fix: Create /root/.ccs/profiles/kimi/settings.json with valid API key

🎉 All checks passed! Delegation is ready to use.
```

### Step 8: Test Custom Model Delegation

**Create custom model profile:**
```bash
mkdir -p ~/.ccs/profiles/custom
cat > ~/.ccs/profiles/custom/settings.json << 'EOF'
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.example.com/v1/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "your-custom-api-key",
    "ANTHROPIC_MODEL": "custom-model"
  }
}
EOF
```

**Create delegation command:**
```
/ccs:create custom
```

**Use the new command:**
```
/ccs:custom "create a hello world example"
```

**Expected:**
- ✅ Creates `.claude/commands/ccs-custom.md`
- ✅ Command works immediately
- ✅ Shows "CUSTOM" model in delegation report

## Test Checklist

Run through these scenarios:

- [ ] Basic delegation with `/ccs:glm` works
- [ ] File modification tracked correctly
- [ ] File creation tracked correctly
- [ ] CCS skill suggests delegation proactively
- [ ] Error handling works (non-existent files)
- [ ] CWD resolution works (explicit paths, file references)
- [ ] Validation script checks setup correctly
- [ ] Custom model creation with `/ccs:create` works
- [ ] Delegation reports show correct info (CWD, duration, files, exit code)
- [ ] Changes actually appear on disk (verify with `git status`)

## Advanced Testing

### Debug Mode

Enable detailed logging:
```bash
export CCS_DEBUG=1
claude
```

Check logs after delegation:
```bash
ls ~/.ccs/logs/
cat ~/.ccs/logs/delegation-*.log
```

### Test Timeout Handling

```
/ccs:glm "implement a very complex feature that would take more than 2 minutes"
```

**Expected:**
- ✅ Timeout after 120 seconds
- ✅ Process killed gracefully (SIGTERM → SIGKILL)
- ✅ Clear timeout error message

### Test Prompt Enhancement

Check that prompts are enhanced with context (not passed raw):

```bash
export CCS_DEBUG=1
# Run delegation
# Check logs to verify enhanced prompt includes:
# - # Task section
# - # Working Directory
# - # Requirements (YAGNI, KISS, DRY)
# - # Success Criteria
```

## Troubleshooting

### "Command not found: /ccs:glm"

**Check delegation commands exist:**
```bash
ls ~/.ccs/shared/commands/ccs-*.md
```

**Should show:**
- ccs-glm.md
- ccs-kimi.md
- ccs-create.md

**Fix if missing:**
```bash
npm install -g @kaitranntt/ccs --force
```

### "Placeholder API key detected"

**Check current API key:**
```bash
grep ANTHROPIC_AUTH_TOKEN ~/.ccs/profiles/glm/settings.json
```

**If shows `YOUR_GLM_API_KEY_HERE`:**
- Get real key from: https://open.bigmodel.cn/usercenter/apikeys
- Update `~/.ccs/profiles/glm/settings.json`
- Verify with: `ccs doctor`

### "Claude CLI not found"

**Check if Claude is installed:**
```bash
which claude
```

**If not found:**
- Install from: https://docs.claude.com/en/docs/claude-code/installation
- Verify: `claude --version`

### Delegation hangs or fails

**Enable debug mode:**
```bash
export CCS_DEBUG=1
```

**Check process:**
```bash
ps aux | grep claude
```

**Check logs:**
```bash
tail -f ~/.ccs/logs/delegation-*.log
```

## Expected Performance

| Operation | Target Time | Notes |
|-----------|-------------|-------|
| Simple refactor | <30s | File modification with GLM |
| Add tests | <45s | Create test file |
| Documentation | <90s | Comprehensive docs with Kimi |
| Validation check | <2s | Setup validation script |
| Error handling | <5s | Graceful failure |

## Success Criteria

**Core functionality:**
- ✅ Delegation commands work (`/ccs:glm`, `/ccs:kimi`)
- ✅ File changes tracked accurately
- ✅ CWD resolution correct
- ✅ Error handling graceful

**CCS skill:**
- ✅ Activates on relevant tasks
- ✅ Suggests delegation proactively
- ✅ Provides helpful troubleshooting

**Output quality:**
- ✅ ASCII boxes formatted correctly
- ✅ File lists accurate (no duplicates)
- ✅ Duration and exit codes shown
- ✅ Clear error messages

**Integration:**
- ✅ Works in any project
- ✅ Doesn't interfere with main session
- ✅ Changes persist on disk
- ✅ Code quality maintained

## Next Steps

After successful testing:
1. Use delegation for real tasks to save tokens
2. Configure Kimi for long-context tasks (optional)
3. Create custom model profiles as needed
4. Share feedback on delegation experience
5. Consider Phase 7 features (automatic delegation, batch operations)

## Getting Help

**Resources:**
- CCS skill documentation: `.claude/skills/ccs/SKILL.md`
- Delegation guide: `.claude/skills/ccs/references/delegation-guide.md`
- Troubleshooting: `.claude/skills/ccs/references/troubleshooting.md`
- Best practices: `.claude/skills/ccs/references/best-practices.md`

**Validation:**
```bash
node .claude/skills/ccs/scripts/validate-setup.js
```

**Health check:**
```bash
ccs doctor
```
