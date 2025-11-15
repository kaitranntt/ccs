# CCS Error Codes

Quick reference for CCS error codes and solutions.

## Error Categories

- **[E100-E199](#configuration-errors)**: Configuration Errors
- **[E200-E299](#profile-management-errors)**: Profile Management Errors
- **[E300-E399](#claude-cli-errors)**: Claude CLI Detection Errors
- **[E400-E499](#network-api-errors)**: Network/API Errors
- **[E500-E599](#file-system-errors)**: File System Errors
- **[E900-E999](#internal-errors)**: Internal Errors

---

## Configuration Errors

### E101: Configuration File Missing
**Cause**: `~/.ccs/config.json` not found

**Solutions**:
```bash
# Reinstall CCS
npm install -g @kaitranntt/ccs --force
```

---

### E102: Invalid JSON in Configuration
**Cause**: Corrupted or malformed `config.json`

**Solutions**:
```bash
# Backup and reset
mv ~/.ccs/config.json ~/.ccs/config.json.backup
npm install -g @kaitranntt/ccs --force
```

---

### E103: Invalid Profile Configuration
**Cause**: Profile settings reference non-existent settings file

**Solutions**:
```bash
# Check profile settings
cat ~/.ccs/config.json

# Fix path or recreate profile
ccs auth create <profile>
```

---

## Profile Management Errors

### E104: Profile Not Found
**Cause**: Requested profile doesn't exist

**Solutions**:
```bash
# List available profiles
ccs auth list

# Create new profile
ccs auth create <name>

# Use existing profile
ccs <profile> "your prompt"
```

---

### E105: Profile Already Exists
**Cause**: Attempting to create profile that already exists

**Solutions**:
```bash
# Use different name
ccs auth create <different-name>

# Or overwrite existing (use with caution)
ccs auth create <name> --force
```

---

### E106: Cannot Delete Default Profile
**Cause**: Attempting to remove currently active default profile

**Solutions**:
```bash
# Set different default first
ccs auth default <other-profile>

# Then remove old default
ccs auth remove <old-profile>
```

---

### E107: Invalid Profile Name
**Cause**: Profile name contains invalid characters

**Solutions**:
```bash
# Use only: alphanumeric, dash, underscore
# Valid:   work, test-env, my_profile
# Invalid: my profile, test@work, profile!
```

---

## Claude CLI Errors

### E301: Claude CLI Not Found
**Cause**: Claude CLI not installed or not in PATH

**Solutions**:
```bash
# Install Claude CLI
# See: https://docs.claude.com/en/docs/claude-code/installation

# Verify installation
command -v claude    # Unix
Get-Command claude   # Windows

# Custom path (if installed elsewhere)
export CCS_CLAUDE_PATH="/path/to/claude"
```

---

### E302: Claude CLI Version Incompatible
**Cause**: Claude CLI version doesn't meet minimum requirements

**Solutions**:
```bash
# Update Claude CLI
# Follow official update guide

# Check version
claude --version
```

---

### E303: Claude CLI Execution Failed
**Cause**: Claude CLI failed to start or crashed

**Solutions**:
```bash
# Test Claude directly
claude --version

# Check permissions
ls -la $(which claude)

# Reinstall if needed
```

---

## Network/API Errors

### E401: GLMT Proxy Timeout
**Cause**: GLMT proxy server failed to start within 30 seconds

**Solutions**:
```bash
# Check port conflicts
lsof -i :19889  # or random port shown in error

# Use non-proxy GLM instead
ccs glm "your prompt"

# Enable debug mode
export CCS_DEBUG=1
ccs glmt "test"
```

---

### E402: API Key Missing
**Cause**: Required API key not configured

**Solutions**:
```bash
# For GLM/GLMT/Kimi
# Add to settings file or use Claude login
claude /login
```

---

### E403: API Authentication Failed
**Cause**: Invalid or expired API credentials

**Solutions**:
```bash
# Re-authenticate
claude /login

# Check API key validity
# Verify in Claude dashboard
```

---

### E404: API Rate Limit Exceeded
**Cause**: Too many requests to API

**Solutions**:
```bash
# Wait and retry
sleep 60

# Check rate limits in API dashboard
# Consider upgrading plan
```

---

## File System Errors

### E501: Cannot Create Directory
**Cause**: Permission denied or path issues

**Solutions**:
```bash
# Fix ownership
sudo chown -R $USER ~/.ccs

# Fix permissions
chmod 755 ~/.ccs

# Retry
npm install -g @kaitranntt/ccs --force
```

---

### E502: Cannot Write File
**Cause**: Permission denied writing to CCS directories

**Solutions**:
```bash
# Fix permissions
sudo chown -R $USER ~/.ccs ~/.claude
chmod -R 755 ~/.ccs ~/.claude

# Check disk space
df -h ~
```

---

### E503: Cannot Read File
**Cause**: File doesn't exist or permission denied

**Solutions**:
```bash
# Check file exists
ls -la <file-path-from-error>

# Fix permissions
chmod 644 <file-path>

# Recreate if missing
ccs auth create <profile>
```

---

### E504: Instance Directory Not Found
**Cause**: Profile instance directory missing

**Solutions**:
```bash
# Recreate profile
ccs auth remove <profile>
ccs auth create <profile>
```

---

## Internal Errors

### E900: Internal Error
**Cause**: Unexpected error in CCS code

**Solutions**:
```bash
# Report bug with debug output
export CCS_DEBUG=1
ccs <your-command> 2>&1 | tee error.log

# Report at: https://github.com/kaitranntt/ccs/issues
```

---

### E901: Invalid State
**Cause**: CCS detected inconsistent internal state

**Solutions**:
```bash
# Run health check
ccs doctor

# Reset CCS data (backup first!)
mv ~/.ccs ~/.ccs.backup
npm install -g @kaitranntt/ccs --force
```

---

## Getting Help

If you encounter an error not listed here:

1. Enable debug mode: `export CCS_DEBUG=1`
2. Run the failing command
3. Check logs: `~/.ccs/logs/`
4. Report issue: https://github.com/kaitranntt/ccs/issues

Include:
- Error code
- Full error message
- Debug output
- OS/platform info
- CCS version: `ccs --version`
