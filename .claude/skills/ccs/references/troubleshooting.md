# Troubleshooting Guide

Common CCS delegation issues and solutions.

## Issue: Delegation Commands Not Found

**Symptoms:**
```
/ccs:glm "task"
→ Command not recognized
```

**Diagnosis:**
```bash
ccs doctor
```

Shows:
```
[?] Checking delegation... [!] (not installed)
Delegation commands not found
```

**Solution:**
```bash
npm install -g @kaitranntt/ccs --force
```

**Verify:**
```bash
ls ~/.ccs/shared/commands/ccs-*.md
```

Should show:
```
ccs-glm.md
ccs-kimi.md
ccs-create.md
```

## Issue: Placeholder API Key Detected

**Symptoms:**
```bash
ccs doctor
```

Shows:
```
[?] Checking delegation... [!] (no profiles ready)
Delegation installed but no profiles configured
```

**Diagnosis:**
```bash
cat ~/.ccs/profiles/glm/settings.json
```

Shows:
```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "YOUR_GLM_API_KEY_HERE"
  }
}
```

**Solution:**

Replace placeholder with real API key:

1. Get API key from provider (bigmodel.cn for GLM, moonshot.cn for Kimi)
2. Edit settings.json
3. Replace `YOUR_GLM_API_KEY_HERE` with actual key
4. Save file

**Verify:**
```bash
ccs doctor
```

Should show:
```
[?] Checking delegation... [OK] (glm ready)
```

## Issue: Delegation Failed (Exit Code 1)

**Symptoms:**
```
[X] Delegation failed (exit code: 1)
Stderr: Error: File not found
```

**Common causes:**

**1. File doesn't exist:**
```
/ccs:glm "fix src/missing.js"
→ Error: src/missing.js not found
```

**Solution:** Verify file exists before delegating.

**2. Wrong working directory:**
```
/ccs:glm "update config.json"
→ Error: config.json not found
```

**Solution:** Specify directory explicitly:
```
/ccs:glm "in packages/api, update config.json"
```

**3. Syntax error in task:**
```
/ccs:glm "add tests
→ Error: Unclosed quote
```

**Solution:** Properly quote task:
```
/ccs:glm "add tests"
```

## Issue: Profile Not Found

**Symptoms:**
```
/ccs:create mymodel
→ Error: Profile 'mymodel' not found
```

**Diagnosis:**
```bash
ls ~/.ccs/profiles/
```

mymodel/ directory doesn't exist.

**Solution:**

Create profile first:
```bash
mkdir -p ~/.ccs/profiles/mymodel
cat > ~/.ccs/profiles/mymodel/settings.json << 'EOF'
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.example.com",
    "ANTHROPIC_AUTH_TOKEN": "your-key",
    "ANTHROPIC_MODEL": "model-name"
  }
}
EOF
```

Then create command:
```
/ccs:create mymodel
```

## Issue: Delegation Timeout

**Symptoms:**
```
[X] Delegation timed out after 120 seconds
```

**Cause:** Task too complex for delegation timeout.

**Solution:**

1. Break into smaller tasks
2. Use main session instead
3. Increase complexity threshold

**Example:**
Instead of:
```
/ccs:glm "refactor entire authentication system"
```

Break down:
```
/ccs:glm "extract login logic to separate function"
/ccs:glm "extract logout logic to separate function"
/ccs:glm "add unit tests for login function"
```

## Issue: Invalid API Key

**Symptoms:**
```
[X] Delegation failed
Stderr: 401 Unauthorized
```

**Diagnosis:**

API key invalid or expired.

**Solution:**

1. Verify API key on provider website
2. Regenerate if needed
3. Update settings.json
4. Test with `ccs doctor`

## Issue: CCS Not Installed

**Symptoms:**
```bash
ccs --version
→ command not found
```

**Solution:**

Install CCS:
```bash
npm install -g @kaitranntt/ccs
```

Verify:
```bash
ccs --version
which ccs
```

## Debug Mode

Enable debug logging:
```bash
export CCS_DEBUG=1
```

Delegation will write detailed logs to:
```
~/.ccs/logs/delegation-YYYYMMDD-HHmmss.log
```

Check logs for detailed error information.
