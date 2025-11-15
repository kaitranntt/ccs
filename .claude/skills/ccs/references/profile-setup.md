# Profile Setup Guide

Configure GLM, Kimi, or custom model profiles for CCS delegation.

## Profile Structure

Profiles stored at: `~/.ccs/profiles/<profile-name>/`

**Required file:**
```
~/.ccs/profiles/<profile-name>/settings.json
```

**Format:**
```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.provider.com/v1/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "your-api-key-here",
    "ANTHROPIC_MODEL": "model-name",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "model-name",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "model-name",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "model-name"
  }
}
```

**CRITICAL:** All env values must be strings (not booleans/objects).

## GLM Profile Setup

**1. Get API key:**
- Visit: https://bigmodel.cn
- Register account
- Navigate to API keys section
- Create new API key

**2. Locate GLM settings:**
```bash
~/.ccs/profiles/glm/settings.json
```

**3. Update settings.json:**
```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "your-actual-glm-api-key",
    "ANTHROPIC_MODEL": "glm-4.6",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "glm-4.6",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "glm-4.6",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "glm-4.6"
  }
}
```

**4. Validate:**
```bash
ccs doctor
```

Should show:
```
Delegation: Enabled
Ready: glm
```

## Kimi Profile Setup

**1. Get API key:**
- Visit: https://platform.moonshot.cn
- Register account
- Create API key

**2. Locate Kimi settings:**
```bash
~/.ccs/profiles/kimi/settings.json
```

**3. Update settings.json:**
```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.moonshot.cn/v1/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "your-actual-kimi-api-key",
    "ANTHROPIC_MODEL": "moonshot-v1-128k",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "moonshot-v1-128k",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "moonshot-v1-128k",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "moonshot-v1-128k"
  }
}
```

**4. Validate:**
```bash
ccs doctor
```

## Custom Profile Setup

**1. Create profile directory:**
```bash
mkdir -p ~/.ccs/profiles/custom-model
```

**2. Create settings.json:**
```bash
cat > ~/.ccs/profiles/custom-model/settings.json << 'EOF'
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.custom.com/v1/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "your-api-key",
    "ANTHROPIC_MODEL": "custom-model-name",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "custom-model-name",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "custom-model-name",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "custom-model-name"
  }
}
EOF
```

**3. Create delegation command:**
```
/ccs:create custom-model
```

**4. Use delegation:**
```
/ccs:custom-model "your task"
```

## Validation

**Check installation:**
```bash
ccs --version
```

**Run health check:**
```bash
ccs doctor
```

**Expected output:**
```
[?] Checking delegation... [OK] (glm, kimi ready)
```

**If shows warnings:**
```
[?] Checking delegation... [!] (no profiles ready)
```

→ API keys are placeholders, follow setup above.
