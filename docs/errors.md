# CCS Error Codes Reference

Error codes for CCS CLI following the format `EXXX` where categories are:
- **E100-E199:** Configuration errors
- **E200-E299:** Profile management errors
- **E300-E399:** Claude CLI detection errors
- **E400-E499:** Network/API errors (GLMT)
- **E500-E599:** File system errors
- **E900-E999:** Internal errors

---

## Configuration Errors (E100-E199)

### E101: Config File Missing or Corrupted

**Cause:** `~/.ccs/config.json` is missing, corrupted, or contains invalid JSON.

**Solution:**
```bash
# Backup corrupted file (if exists)
mv ~/.ccs/config.json ~/.ccs/config.json.backup

# Reinstall CCS to recreate config
npm install -g @kaitranntt/ccs
```

**Auto-Recovery:** CCS attempts to auto-recreate config.json on startup.

---

### E102: Invalid JSON in Config File

**Cause:** config.json contains syntax errors.

**Solution:**
```bash
# Validate JSON
jq empty ~/.ccs/config.json

# Fix syntax or recreate
npm install -g @kaitranntt/ccs --force
```

---

### E103: Invalid Profile Configuration

**Cause:** Profile settings file has invalid structure or missing required fields.

**Solution:**
- Check settings file exists: `ls -la ~/.ccs/*.settings.json`
- Validate JSON syntax: `jq empty ~/.ccs/glm.settings.json`
- Ensure required fields: `env.ANTHROPIC_AUTH_TOKEN`, `env.ANTHROPIC_BASE_URL`

---

## Profile Management Errors (E200-E299)

### E104: Profile Not Found

**Cause:** Requested profile doesn't exist in config.json or profiles.json.

**Solution:**
```bash
# List available profiles
ccs auth list

# Create new profile
ccs auth create <profile-name>

# Or check for typos (see "Did you mean?" suggestions)
```

---

### E105: Profile Already Exists

**Cause:** Attempting to create a profile that already exists.

**Solution:**
```bash
# List existing profiles
ccs auth list

# Use different name or remove existing first
ccs auth remove <profile> --force
ccs auth create <profile>
```

---

### E106: Cannot Delete Default Profile

**Cause:** Attempting to delete the currently active default profile.

**Solution:**
```bash
# Set different profile as default first
ccs auth default <other-profile>

# Then remove the profile
ccs auth remove <profile> --force
```

---

### E107: Profile Name Invalid

**Cause:** Profile name contains invalid characters (only alphanumeric, dash, underscore allowed).

**Solution:**
```bash
# Use valid characters only
ccs auth create work-profile    # ✓ Valid
ccs auth create work_profile    # ✓ Valid
ccs auth create work.profile    # ✗ Invalid (contains .)
```

---

## Claude CLI Detection Errors (E300-E399)

### E301: Claude CLI Not Found in PATH

**Cause:** Claude CLI is not installed or not in system PATH.

**Solution:**
1. **Install Claude CLI:**
   - Visit: https://docs.claude.com/en/docs/claude-code/installation
   - Follow platform-specific installation instructions

2. **Verify installation:**
   ```bash
   command -v claude    # Unix
   Get-Command claude   # PowerShell
   ```

3. **If installed but not in PATH:**
   ```bash
   # Find Claude location
   which claude    # Unix
   where.exe claude    # Windows

   # Set custom path
   export CCS_CLAUDE_PATH='/path/to/claude'              # Unix
   $env:CCS_CLAUDE_PATH = 'C:\path\to\claude.exe'        # PowerShell
   ```

---

### E302: Claude CLI Version Incompatible

**Cause:** Installed Claude CLI version is too old or incompatible.

**Solution:**
```bash
# Check current version
claude --version

# Update Claude CLI
# Follow update instructions from Claude documentation
```

---

### E303: Claude CLI Execution Failed

**Cause:** Claude CLI command failed to execute properly.

**Solution:**
- Check Claude CLI permissions
- Verify Claude is properly installed
- Try running `claude --version` directly
- Check system resources (memory, disk space)

---

## Network/API Errors (E400-E499)

### E401: GLMT Proxy Startup Timeout

**Cause:** GLMT proxy failed to start within 5-second timeout.

**Solution:**
```bash
# Check for port conflicts
lsof -i :5000-6000    # Unix
netstat -ano | findstr ":5"    # Windows

# Enable verbose logging
ccs glmt --verbose "test prompt"

# Check proxy logs
cat ~/.ccs/logs/*.log

# Fallback: Use non-thinking mode
ccs glm "your prompt"
```

---

### E402: Z.AI API Key Missing

**Cause:** GLMT profile requires Z.AI API key but none configured.

**Solution:**
```bash
# Edit GLMT settings
nano ~/.ccs/glmt.settings.json

# Add API key
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "your-z-ai-api-key-here"
  }
}

# Get API key from: https://z.ai/
```

---

### E403: API Authentication Failed

**Cause:** Invalid or expired API key.

**Solution:**
- Verify API key is correct
- Check API key hasn't expired
- Ensure proper API access level
- Regenerate API key if needed

---

### E404: API Rate Limit Exceeded

**Cause:** Too many requests to API service.

**Solution:**
- Wait before retrying
- Check API plan limits
- Consider upgrading API plan
- Use different profile temporarily

---

## File System Errors (E500-E599)

### E501: Cannot Create Directory

**Cause:** Permission denied or disk full when creating ~/.ccs/ or instance directories.

**Solution:**
```bash
# Check permissions
ls -ld ~/.ccs

# Check disk space
df -h ~

# Fix permissions
chmod 755 ~/.ccs

# Or reinstall
rm -rf ~/.ccs
npm install -g @kaitranntt/ccs
```

---

### E502: Cannot Write File

**Cause:** Permission denied when writing configuration files.

**Solution:**
```bash
# Check file permissions
ls -la ~/.ccs/*.json

# Fix permissions
chmod 644 ~/.ccs/*.json
chmod 755 ~/.ccs

# Check disk space
df -h ~
```

---

### E503: Cannot Read File

**Cause:** Configuration file exists but cannot be read.

**Solution:**
```bash
# Check file permissions
ls -la ~/.ccs/config.json

# Fix permissions
chmod 644 ~/.ccs/config.json

# Verify file is not corrupted
cat ~/.ccs/config.json
```

---

### E504: Instance Directory Not Found

**Cause:** Profile instance directory is missing or corrupted.

**Solution:**
```bash
# Check instance exists
ls -la ~/.ccs/instances/

# Recreate profile
ccs auth remove <profile> --force
ccs auth create <profile>
```

---

## Internal Errors (E900-E999)

### E900: Unexpected Error

**Cause:** Internal error occurred during execution.

**Solution:**
- Enable debug logging: `export CCS_DEBUG=1`
- Run command again with verbose output
- Check ~/.ccs/logs/ for error details
- Report issue: https://github.com/kaitranntt/ccs/issues

---

### E901: Invalid State

**Cause:** CCS internal state is inconsistent.

**Solution:**
```bash
# Run health check
ccs doctor

# Clean reinstall if needed
npm uninstall -g @kaitranntt/ccs
rm -rf ~/.ccs
npm install -g @kaitranntt/ccs
```

---

## Getting Help

**Still having issues?**

1. **Run diagnostics:** `ccs doctor`
2. **Check logs:** `~/.ccs/logs/`
3. **Enable debug mode:** `export CCS_DEBUG=1`
4. **Report issues:** https://github.com/kaitranntt/ccs/issues

**Documentation:**
- GitHub: https://github.com/kaitranntt/ccs
- README: https://github.com/kaitranntt/ccs/blob/main/README.md

---

*Last Updated: 2025-11-14*
