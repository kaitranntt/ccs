---
description: Create custom model delegation command for user-defined profiles
argument-hint: <model-name> [--force]
allowed-tools: Bash, Read, Write
model: sonnet
---

# /ccs:create - Create Custom Model Delegation

Generate `/ccs:<model>` slash command for user-defined model profiles.

## Your Task

Create delegation command for: `$ARGUMENTS`

## Workflow

### Step 1: Parse Arguments

Extract model name and flags:

```bash
# Parse input
ARGS="$ARGUMENTS"
MODEL_NAME=""
FORCE=false

# Extract model name (first non-flag argument)
for arg in $ARGS; do
  if [[ "$arg" == "--force" ]]; then
    FORCE=true
  elif [[ -z "$MODEL_NAME" ]]; then
    MODEL_NAME="$arg"
  fi
done

# Validate model name provided
if [[ -z "$MODEL_NAME" ]]; then
  echo "[X] Model name required"
  echo ""
  echo "Usage: /ccs:create <model-name> [--force]"
  echo ""
  echo "Examples:"
  echo "  /ccs:create m2           # Create /ccs:m2 command"
  echo "  /ccs:create claude4      # Create /ccs:claude4 command"
  echo "  /ccs:create custom --force  # Overwrite existing command"
  exit 1
fi

# Validate model name format (alphanumeric, dash, underscore only)
if [[ ! "$MODEL_NAME" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo "[X] Invalid model name: $MODEL_NAME"
  echo ""
  echo "Model name must contain only:"
  echo "  - Letters (a-z, A-Z)"
  echo "  - Numbers (0-9)"
  echo "  - Dash (-) or underscore (_)"
  echo ""
  echo "Valid examples: m2, minimax-m2, custom_model"
  exit 1
fi
```

### Step 2: Validate Profile Exists

**CRITICAL**: Profile must be configured before creating command.

```bash
# Check if profile directory exists
PROFILE_DIR="$HOME/.ccs/profiles/$MODEL_NAME"
SETTINGS_FILE="$PROFILE_DIR/settings.json"

if [[ ! -d "$PROFILE_DIR" ]]; then
  echo "[X] Profile not found: $MODEL_NAME"
  echo ""
  echo "Profile directory missing: $PROFILE_DIR"
  echo ""
  echo "Setup Instructions:"
  echo "  1. Create profile directory:"
  echo "     mkdir -p ~/.ccs/profiles/$MODEL_NAME"
  echo ""
  echo "  2. Create settings.json file:"
  echo "     Copy from existing profile:"
  echo "     cp ~/.ccs/profiles/glm/settings.json ~/.ccs/profiles/$MODEL_NAME/settings.json"
  echo ""
  echo "  3. Edit settings.json:"
  echo "     Edit ~/.ccs/profiles/$MODEL_NAME/settings.json"
  echo "     Update ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN"
  echo ""
  echo "  4. Then create command:"
  echo "     /ccs:create $MODEL_NAME"
  exit 1
fi

# Validate settings.json exists and is valid JSON
if [[ ! -f "$SETTINGS_FILE" ]]; then
  echo "[X] Settings file not found: $SETTINGS_FILE"
  echo ""
  echo "Create settings.json:"
  echo "  cp ~/.ccs/profiles/glm/settings.json $SETTINGS_FILE"
  echo "  Edit $SETTINGS_FILE"
  exit 1
fi

# Validate JSON format
if ! jq empty "$SETTINGS_FILE" 2>/dev/null; then
  echo "[X] Invalid JSON in settings file"
  echo ""
  echo "File: $SETTINGS_FILE"
  echo ""
  echo "Fix JSON syntax and try again."
  exit 1
fi

# Check API key configured
API_KEY=$(jq -r '.env.ANTHROPIC_AUTH_TOKEN // empty' "$SETTINGS_FILE")
if [[ -z "$API_KEY" ]] || [[ "$API_KEY" == "YOUR_"*"_API_KEY_HERE" ]]; then
  echo "[X] API key not configured for $MODEL_NAME"
  echo ""
  echo "Edit: $SETTINGS_FILE"
  echo "Set: env.ANTHROPIC_AUTH_TOKEN to your API key"
  echo ""
  echo "Then retry: /ccs:create $MODEL_NAME"
  exit 1
fi

echo "[OK] Profile validated: $MODEL_NAME"
```

### Step 3: Check if Command Already Exists

```bash
# Check if command file exists
COMMAND_FILE=".claude/commands/ccs/$MODEL_NAME.md"

if [[ -f "$COMMAND_FILE" ]] && [[ "$FORCE" != true ]]; then
  echo "[X] Command already exists: /ccs:$MODEL_NAME"
  echo ""
  echo "File: $COMMAND_FILE"
  echo ""
  echo "To overwrite, use --force flag:"
  echo "  /ccs:create $MODEL_NAME --force"
  exit 1
fi

if [[ -f "$COMMAND_FILE" ]] && [[ "$FORCE" == true ]]; then
  echo "[i] Overwriting existing command (--force flag used)"
fi
```

### Step 4: Generate Command File from Template

**Template Source**: Use `.claude/commands/ccs/glm.md` as template.

```bash
# Read template
TEMPLATE_FILE=".claude/commands/ccs/glm.md"

if [[ ! -f "$TEMPLATE_FILE" ]]; then
  echo "[X] Template file not found: $TEMPLATE_FILE"
  echo "Cannot generate command without template."
  exit 1
fi

# Read template content
TEMPLATE_CONTENT=$(cat "$TEMPLATE_FILE")

# Perform substitutions
# 1. Replace "glm" with model name
# 2. Replace "GLM-4.6" with display name
# 3. Replace Z.AI references with generic text

MODEL_UPPER=$(echo "$MODEL_NAME" | tr '[:lower:]' '[:upper:]')
MODEL_DISPLAY="${MODEL_UPPER}"

# Create new command content
NEW_CONTENT=$(echo "$TEMPLATE_CONTENT" | \
  sed "s/glm/$MODEL_NAME/g" | \
  sed "s/GLM/$MODEL_UPPER/g" | \
  sed "s/GLM-4\.6/$MODEL_DISPLAY/g" | \
  sed "s/Z\.AI/your provider/g" | \
  sed "s/https:\/\/open\.bigmodel\.cn\/usercenter\/apikeys/your API key provider/g")

# Write new command file
echo "$NEW_CONTENT" > "$COMMAND_FILE"

echo "[OK] Command file created: $COMMAND_FILE"
```

### Step 5: Verify and Report Success

```bash
# Verify file was created
if [[ ! -f "$COMMAND_FILE" ]]; then
  echo "[X] Failed to create command file"
  exit 1
fi

# Success report
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║ Custom Delegation Command Created                           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Command: /ccs:$MODEL_NAME"
echo "File: $COMMAND_FILE"
echo "Profile: $PROFILE_DIR"
echo "Settings: $SETTINGS_FILE"
echo ""
echo "Usage:"
echo "  /ccs:$MODEL_NAME \"your task here\""
echo ""
echo "Test it:"
echo "  /ccs:$MODEL_NAME \"say hello\""
echo ""
echo "[OK] Ready for delegation!"
```

## Complete Example

**Creating delegation for Minimax M2**:

```
User: /ccs:create m2

[OK] Profile validated: m2
[OK] Command file created: .claude/commands/ccs/m2.md

╔══════════════════════════════════════════════════════════════╗
║ Custom Delegation Command Created                           ║
╚══════════════════════════════════════════════════════════════╝

Command: /ccs:m2
File: .claude/commands/ccs-m2.md
Profile: /home/user/.ccs/profiles/m2
Settings: /home/user/.ccs/profiles/m2/settings.json

Usage:
  /ccs:m2 "your task here"

Test it:
  /ccs:m2 "say hello"

[OK] Ready for delegation!
```

Then user can use:
```
/ccs:m2 "add unit tests to auth.js"
```

## Error Scenarios

### Profile Not Found

```
[X] Profile not found: m2

Profile directory missing: /home/user/.ccs/profiles/m2

Setup Instructions:
  1. Create profile directory:
     mkdir -p ~/.ccs/profiles/m2

  2. Create settings.json file:
     cp ~/.ccs/profiles/glm/settings.json ~/.ccs/profiles/m2/settings.json

  3. Edit settings.json:
     Edit ~/.ccs/profiles/m2/settings.json
     Update ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN

  4. Then create command:
     /ccs:create m2
```

### Invalid Settings

```
[X] Invalid JSON in settings file

File: /home/user/.ccs/profiles/m2/settings.json

Fix JSON syntax and try again.
```

### Command Exists

```
[X] Command already exists: /ccs:m2

File: .claude/commands/ccs-m2.md

To overwrite, use --force flag:
  /ccs:create m2 --force
```

## Notes

- **We only generate command file** - user manages profile setup
- **Profile must exist first** - validates before generation
- **Template-based** - preserves all delegation logic
- **Idempotent with --force** - safe to re-run
- **Validation** - checks profile, settings, API key
- **Clear errors** - step-by-step setup instructions

## Security

**Model Name Validation**:
- Only alphanumeric, dash, underscore allowed
- Prevents directory traversal attacks
- Prevents shell injection

**Path Safety**:
- All paths validated before use
- No user input executed directly
- Template substitution, not interpolation

## Related

- GLM delegation: `/ccs:glm`
- Kimi delegation: `/ccs:kimi`
- Use generated command: `/ccs:<model-name> "task"`
- Profile setup: `~/.ccs/profiles/<model-name>/`
- Settings format: Same as glm.settings.json
