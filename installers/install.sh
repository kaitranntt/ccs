#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# CCS Installation Script
# ============================================================================

# --- Configuration ---
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
CCS_DIR="$HOME/.ccs"
CLAUDE_DIR="$HOME/.claude"
GLM_MODEL="glm-4.6"
KIMI_MODEL="kimi-for-coding"

# Resolve script directory (handles both file-based and piped execution)
if [[ -n "${BASH_SOURCE[0]:-}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
  SCRIPT_DIR="$(cd "$(dirname "${0:-$PWD}")" && pwd)"
fi

# Detect installation method (git vs standalone)
# Check if ccs executable exists in SCRIPT_DIR or parent (real git install)
# Don't just check .git (user might run curl | bash inside their own git repo)
if [[ -f "$SCRIPT_DIR/lib/ccs" ]] || [[ -f "$SCRIPT_DIR/../lib/ccs" ]]; then
  INSTALL_METHOD="git"
else
  INSTALL_METHOD="standalone"
fi

# Version configuration
# IMPORTANT: Update this version when releasing new versions!
# This hardcoded version is used for standalone installations (curl | bash)
# For git installations, VERSION file is read if available
CCS_VERSION="4.3.6"

# Try to read VERSION file for git installations
if [[ -f "$SCRIPT_DIR/VERSION" ]]; then
  CCS_VERSION="$(cat "$SCRIPT_DIR/VERSION" | tr -d '\n' | tr -d '\r')"
elif [[ -f "$SCRIPT_DIR/../VERSION" ]]; then
  CCS_VERSION="$(cat "$SCRIPT_DIR/../VERSION" | tr -d '\n' | tr -d '\r')"
fi

# --- Platform Detection ---
# Detect platform and redirect to Windows installer if needed
detect_platform() {
  case "$OSTYPE" in
    msys*|mingw*|cygwin*|win32*)
      echo "windows"
      ;;
    *)
      echo "unix"
      ;;
  esac
}

PLATFORM=$(detect_platform)

if [[ "$PLATFORM" == "windows" ]]; then
  echo "Windows detected. Using PowerShell installer..."

  if [[ -f "$SCRIPT_DIR/install.ps1" ]]; then
    powershell.exe -ExecutionPolicy Bypass -File "$SCRIPT_DIR/install.ps1"
    exit $?
  else
    echo "Error: install.ps1 not found."
    echo "Please download the full CCS package from:"
    echo "  https://github.com/kaitranntt/ccs"
    exit 1
  fi
fi

# Continue with Unix installation...

# --- Helper Functions ---

detect_current_provider() {
  local settings="$CLAUDE_DIR/settings.json"
  if [[ ! -f "$settings" ]]; then
    echo "unknown"
    return
  fi

  if grep -q "api.kimi.com\|kimi-for-coding" "$settings" 2>/dev/null; then
    echo "kimi"
  elif grep -q "api.z.ai\|glm-4" "$settings" 2>/dev/null; then
    echo "glm"
  elif grep -q "ANTHROPIC_BASE_URL" "$settings" 2>/dev/null && ! grep -q "api.z.ai\|api.kimi.com" "$settings" 2>/dev/null; then
    echo "custom"
  else
    echo "claude"
  fi
}

# --- Color/Format Functions (ANSI) ---
setup_colors() {
  if [[ -t 1 ]] && [[ -z "${NO_COLOR:-}" ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    RESET='\033[0m'
  else
    RED='' GREEN='' YELLOW='' CYAN='' BOLD='' RESET=''
  fi
}

msg_critical() {
  echo "" >&2
  echo -e "${RED}${BOLD}╔═════════════════════════════════════════════╗${RESET}" >&2
  echo -e "${RED}${BOLD}║  ACTION REQUIRED                            ║${RESET}" >&2
  echo -e "${RED}${BOLD}╚═════════════════════════════════════════════╝${RESET}" >&2
  echo "" >&2
  echo -e "${RED}$1${RESET}" >&2
  echo "" >&2
}

msg_warning() {
  echo "" >&2
  echo -e "${YELLOW}${BOLD}[!] WARNING${RESET}" >&2
  echo -e "${YELLOW}$1${RESET}" >&2
  echo "" >&2
}

msg_success() {
  echo -e "${GREEN}[OK] $1${RESET}"
}

msg_info() {
  echo -e "[i] $1"
}

msg_section() {
  echo ""
  echo -e "${BOLD}===== $1 =====${RESET}"
  echo ""
}

setup_colors

# --- Shell Profile Management ---

detect_shell_profile() {
  # Safe extraction of shell name (no command substitution)
  local shell_path="${SHELL:-/bin/bash}"
  local shell_name="${shell_path##*/}"

  # Validate shell_name is alphanumeric (defense in depth)
  if [[ ! "$shell_name" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    shell_name="bash"
  fi

  case "$shell_name" in
    zsh)
      echo "$HOME/.zshrc"
      ;;
    bash)
      if [[ "$OSTYPE" == darwin* ]]; then
        # macOS prefers bash_profile
        [[ -f "$HOME/.bash_profile" ]] && echo "$HOME/.bash_profile" || echo "$HOME/.bashrc"
      else
        echo "$HOME/.bashrc"
      fi
      ;;
    fish)
      echo "$HOME/.config/fish/config.fish"
      ;;
    *)
      # Default to bashrc
      echo "$HOME/.bashrc"
      ;;
  esac
}

check_path_configured() {
  [[ ":$PATH:" == *":$HOME/.local/bin:"* ]]
}

add_to_path() {
  local profile_file="$1"
  local dir_to_add="$HOME/.local/bin"

  # Create profile file if doesn't exist
  if [[ ! -f "$profile_file" ]]; then
    local profile_dir="$(dirname "$profile_file")"

    if ! mkdir -p "$profile_dir" 2>/dev/null; then
      echo "[!] Failed to create directory: $profile_dir" >&2
      return 1
    fi

    if ! touch "$profile_file" 2>/dev/null; then
      echo "[!] Failed to create profile file: $profile_file" >&2
      return 1
    fi
  fi

  # Check if already in profile (avoid duplicates)
  if grep -q "# CCS: Added by Claude Code Switch installer" "$profile_file" 2>/dev/null; then
    return 0  # Already added
  fi

  # Check for fish shell (different syntax)
  if [[ "$profile_file" == *"config.fish" ]]; then
    cat >> "$profile_file" << 'EOF'

# CCS: Added by Claude Code Switch installer
set -gx PATH $HOME/.local/bin $PATH
EOF
  else
    # Bash/Zsh syntax
    cat >> "$profile_file" << 'EOF'

# CCS: Added by Claude Code Switch installer
export PATH="$HOME/.local/bin:$PATH"
EOF
  fi

  return 0
}

configure_shell_path() {
  if check_path_configured; then
    msg_info "PATH already configured for ~/.local/bin"
    return 0
  fi

  local profile_file=$(detect_shell_profile)

  echo ""
  msg_section "Configuring Shell PATH"
  msg_info "Detected shell profile: $profile_file"

  if add_to_path "$profile_file"; then
    msg_success "Added ~/.local/bin to PATH in $profile_file"
    echo ""

    # Show reload instructions
    msg_critical "Reload your shell to use 'ccs' command:

    Option 1 (current session):
      source $profile_file

    Option 2 (new session):
      Open a new terminal window

    Then verify:
      ccs --version"

    return 0
  else
    msg_warning "Could not auto-configure PATH

    Manually add this line to $profile_file:
      export PATH=\"\$HOME/.local/bin:\$PATH\"

    Then reload:
      source $profile_file"
    return 1
  fi
}

create_glm_template() {
  cat << EOF
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "YOUR_GLM_API_KEY_HERE",
    "ANTHROPIC_MODEL": "$GLM_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "$GLM_MODEL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "$GLM_MODEL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "$GLM_MODEL"
  }
}
EOF
}

create_kimi_template() {
  cat << EOF
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.kimi.com/coding/",
    "ANTHROPIC_AUTH_TOKEN": "YOUR_KIMI_API_KEY_HERE",
    "ANTHROPIC_MODEL": "$KIMI_MODEL",
    "ANTHROPIC_SMALL_FAST_MODEL": "$KIMI_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "$KIMI_MODEL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "$KIMI_MODEL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "$KIMI_MODEL"
  },
  "alwaysThinkingEnabled": true
}
EOF
}

atomic_mv() {
  local src="$1"
  local dest="$2"
  if mv "$src" "$dest" 2>/dev/null; then
    return 0
  else
    rm -f "$src"
    echo "  [X] Error: Failed to create $dest (check permissions)"
    exit 1
  fi
}

download_file() {
  local url="$1"
  local dest="$2"

  if ! curl -fsSL "$url" -o "$dest"; then
    echo "  [!] Failed to download: $(basename "$dest")"
    return 1
  fi
  return 0
}

install_claude_folder() {
  local source_dir="$1"
  local target_dir="$CCS_DIR/.claude"

  # Check if already exists
  if [[ -d "$target_dir" ]]; then
    echo "|  [i] .claude/ folder already exists, skipping"
    return 0
  fi

  mkdir -p "$target_dir/commands" "$target_dir/skills/ccs-delegation/references"

  if [[ "$INSTALL_METHOD" == "git" ]]; then
    # Copy from local git repo
    if [[ -d "$source_dir/.claude" ]]; then
      cp -r "$source_dir/.claude"/* "$target_dir/" 2>/dev/null || {
        echo "|  [!] Failed to copy .claude/ folder"
        return 1
      }
      echo "|  [OK] Installed .claude/ folder"
    else
      echo "|  [!] .claude/ folder not found in source"
      return 1
    fi
  else
    # Standalone: download from GitHub
    local base_url="https://raw.githubusercontent.com/kaitranntt/ccs/main/.claude"

    download_file "$base_url/commands/ccs.md" "$target_dir/commands/ccs.md" || return 1
    download_file "$base_url/skills/ccs-delegation/SKILL.md" "$target_dir/skills/ccs-delegation/SKILL.md" || return 1
    download_file "$base_url/skills/ccs-delegation/references/delegation-patterns.md" "$target_dir/skills/ccs-delegation/references/delegation-patterns.md" || return 1

    echo "|  [OK] Downloaded .claude/ folder"
  fi

  return 0
}

create_glm_profile() {
  local current_settings="$CLAUDE_DIR/settings.json"
  local glm_settings="$CCS_DIR/glm.settings.json"
  local provider="$1"

  if [[ "$provider" == "glm" ]]; then
    echo "[OK] Copying current GLM config to profile..."
    if command -v jq &> /dev/null; then
      if jq '.env |= (. // {}) + {
        "ANTHROPIC_DEFAULT_OPUS_MODEL": "'"$GLM_MODEL"'",
        "ANTHROPIC_DEFAULT_SONNET_MODEL": "'"$GLM_MODEL"'",
        "ANTHROPIC_DEFAULT_HAIKU_MODEL": "'"$GLM_MODEL"'"
      }' "$current_settings" > "$glm_settings.tmp" 2>/dev/null; then
        atomic_mv "$glm_settings.tmp" "$glm_settings"
        echo "  Created: $glm_settings (with your existing API key + enhanced settings)"
      else
        rm -f "$glm_settings.tmp"
        cp "$current_settings" "$glm_settings"
        echo "  Created: $glm_settings (copied as-is, jq enhancement failed)"
      fi
    else
      cp "$current_settings" "$glm_settings"
      echo "  Created: $glm_settings (copied as-is, jq not available)"
    fi
  else
    echo "Creating GLM profile template at $glm_settings"
    if [[ -f "$current_settings" ]] && command -v jq &> /dev/null; then
      if jq '.env |= (. // {}) + {
        "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
        "ANTHROPIC_AUTH_TOKEN": "YOUR_GLM_API_KEY_HERE",
        "ANTHROPIC_MODEL": "'"$GLM_MODEL"'",
        "ANTHROPIC_DEFAULT_OPUS_MODEL": "'"$GLM_MODEL"'",
        "ANTHROPIC_DEFAULT_SONNET_MODEL": "'"$GLM_MODEL"'",
        "ANTHROPIC_DEFAULT_HAIKU_MODEL": "'"$GLM_MODEL"'"
      }' "$current_settings" > "$glm_settings.tmp" 2>/dev/null; then
        atomic_mv "$glm_settings.tmp" "$glm_settings"
      else
        rm -f "$glm_settings.tmp"
        echo "  [i]  jq failed, using basic template"
        create_glm_template > "$glm_settings"
      fi
    else
      create_glm_template > "$glm_settings"
    fi
    echo "  Created: $glm_settings"
    echo "  [!]  Edit this file and replace YOUR_GLM_API_KEY_HERE with your actual GLM API key"
  fi
}

create_kimi_profile() {
  local current_settings="$CLAUDE_DIR/settings.json"
  local kimi_settings="$CCS_DIR/kimi.settings.json"
  local provider="$1"

  if [[ "$provider" == "kimi" ]]; then
    echo "[OK] Copying current Kimi config to profile..."
    if command -v jq &> /dev/null; then
      if jq '.env |= (. // {}) + {
        "ANTHROPIC_SMALL_FAST_MODEL": "'"$KIMI_MODEL"'",
        "ANTHROPIC_DEFAULT_OPUS_MODEL": "'"$KIMI_MODEL"'",
        "ANTHROPIC_DEFAULT_SONNET_MODEL": "'"$KIMI_MODEL"'",
        "ANTHROPIC_DEFAULT_HAIKU_MODEL": "'"$KIMI_MODEL"'"
      }' "$current_settings" > "$kimi_settings.tmp" 2>/dev/null; then
        atomic_mv "$kimi_settings.tmp" "$kimi_settings"
        echo "  Created: $kimi_settings (with your existing API key + enhanced settings)"
      else
        rm -f "$kimi_settings.tmp"
        cp "$current_settings" "$kimi_settings"
        echo "  Created: $kimi_settings (copied as-is, jq enhancement failed)"
      fi
    else
      cp "$current_settings" "$kimi_settings"
      echo "  Created: $kimi_settings (copied as-is, jq not available)"
    fi
  else
    echo "Creating Kimi profile template at $kimi_settings"
    if [[ -f "$current_settings" ]] && command -v jq &> /dev/null; then
      if jq '.env |= (. // {}) + {
        "ANTHROPIC_BASE_URL": "https://api.kimi.com/coding/",
        "ANTHROPIC_AUTH_TOKEN": "YOUR_KIMI_API_KEY_HERE",
        "ANTHROPIC_MODEL": "'"$KIMI_MODEL"'",
        "ANTHROPIC_SMALL_FAST_MODEL": "'"$KIMI_MODEL"'",
        "ANTHROPIC_DEFAULT_OPUS_MODEL": "'"$KIMI_MODEL"'",
        "ANTHROPIC_DEFAULT_SONNET_MODEL": "'"$KIMI_MODEL"'",
        "ANTHROPIC_DEFAULT_HAIKU_MODEL": "'"$KIMI_MODEL"'"
      } | . + {"alwaysThinkingEnabled": true}' "$current_settings" > "$kimi_settings.tmp" 2>/dev/null; then
        atomic_mv "$kimi_settings.tmp" "$kimi_settings"
      else
        rm -f "$kimi_settings.tmp"
        echo "  [i]  jq failed, using basic template"
        create_kimi_template > "$kimi_settings"
      fi
    else
      create_kimi_template > "$kimi_settings"
    fi
    echo "  Created: $kimi_settings"
    echo "  [!]  Edit this file and replace YOUR_KIMI_API_KEY_HERE with your actual Kimi API key"
  fi
}

# --- Main Installation ---

echo "┌─ Installing CCS"

# Create directories
mkdir -p "$INSTALL_DIR" "$CCS_DIR"

# Install main executable
if [[ "$INSTALL_METHOD" == "standalone" ]]; then
  # Standalone install - download ccs from GitHub
  if ! command -v curl &> /dev/null; then
    echo "[X] Error: curl is required for standalone installation"
    exit 1
  fi

  BASE_URL="https://raw.githubusercontent.com/kaitranntt/ccs/main"

  # Download main executable
  if curl -fsSL "$BASE_URL/lib/ccs" -o "$CCS_DIR/ccs"; then
    chmod +x "$CCS_DIR/ccs"
    ln -sf "$CCS_DIR/ccs" "$INSTALL_DIR/ccs"
    echo "|  [OK] Downloaded executable"
  else
    echo "|"
    echo "[X] Error: Failed to download ccs from GitHub"
    exit 1
  fi

  # Download required dependencies
  mkdir -p "$CCS_DIR/lib"
  if curl -fsSL "$BASE_URL/lib/error-codes.sh" -o "$CCS_DIR/lib/error-codes.sh" 2>/dev/null; then
    echo "|  [OK] Downloaded error-codes.sh"
  else
    echo "|  [!]  Warning: Failed to download error-codes.sh"
  fi

  if curl -fsSL "$BASE_URL/lib/progress-indicator.sh" -o "$CCS_DIR/lib/progress-indicator.sh" 2>/dev/null; then
    echo "|  [OK] Downloaded progress-indicator.sh"
  else
    echo "|  [!]  Warning: Failed to download progress-indicator.sh"
  fi

  if curl -fsSL "$BASE_URL/lib/prompt.sh" -o "$CCS_DIR/lib/prompt.sh" 2>/dev/null; then
    echo "|  [OK] Downloaded prompt.sh"
  else
    echo "|  [!]  Warning: Failed to download prompt.sh"
  fi

  # Download shell completion files
  mkdir -p "$CCS_DIR/completions"
  if curl -fsSL "$BASE_URL/scripts/completion/ccs.bash" -o "$CCS_DIR/completions/ccs.bash" 2>/dev/null; then
    echo "|  [OK] Downloaded completion files"
  fi
  curl -fsSL "$BASE_URL/scripts/completion/ccs.zsh" -o "$CCS_DIR/completions/ccs.zsh" 2>/dev/null || true
  curl -fsSL "$BASE_URL/scripts/completion/ccs.fish" -o "$CCS_DIR/completions/ccs.fish" 2>/dev/null || true
else
  # Git install - use local ccs file
  # Handle both running from root or from installers/ subdirectory
  local LIB_DIR=""
  if [[ -f "$SCRIPT_DIR/lib/ccs" ]]; then
    chmod +x "$SCRIPT_DIR/lib/ccs"
    ln -sf "$SCRIPT_DIR/lib/ccs" "$INSTALL_DIR/ccs"
    LIB_DIR="$SCRIPT_DIR/lib"
  elif [[ -f "$SCRIPT_DIR/../lib/ccs" ]]; then
    chmod +x "$SCRIPT_DIR/../lib/ccs"
    ln -sf "$SCRIPT_DIR/../lib/ccs" "$INSTALL_DIR/ccs"
    LIB_DIR="$SCRIPT_DIR/../lib"
  else
    echo "|"
    echo "[X] Error: lib/ccs executable not found"
    exit 1
  fi
  echo "|  [OK] Installed executable"

  # Copy required dependencies
  mkdir -p "$CCS_DIR/lib"
  if [[ -f "$LIB_DIR/error-codes.sh" ]]; then
    cp "$LIB_DIR/error-codes.sh" "$CCS_DIR/lib/error-codes.sh"
    echo "|  [OK] Copied error-codes.sh"
  fi

  if [[ -f "$LIB_DIR/progress-indicator.sh" ]]; then
    cp "$LIB_DIR/progress-indicator.sh" "$CCS_DIR/lib/progress-indicator.sh"
    echo "|  [OK] Copied progress-indicator.sh"
  fi

  if [[ -f "$LIB_DIR/prompt.sh" ]]; then
    cp "$LIB_DIR/prompt.sh" "$CCS_DIR/lib/prompt.sh"
    echo "|  [OK] Copied prompt.sh"
  fi

  # Copy shell completion files
  mkdir -p "$CCS_DIR/completions"
  local COMPLETION_DIR=""
  if [[ -d "$SCRIPT_DIR/scripts/completion" ]]; then
    COMPLETION_DIR="$SCRIPT_DIR/scripts/completion"
  elif [[ -d "$SCRIPT_DIR/../scripts/completion" ]]; then
    COMPLETION_DIR="$SCRIPT_DIR/../scripts/completion"
  fi

  if [[ -n "$COMPLETION_DIR" ]]; then
    cp "$COMPLETION_DIR/ccs.bash" "$CCS_DIR/completions/ccs.bash" 2>/dev/null || true
    cp "$COMPLETION_DIR/ccs.zsh" "$CCS_DIR/completions/ccs.zsh" 2>/dev/null || true
    cp "$COMPLETION_DIR/ccs.fish" "$CCS_DIR/completions/ccs.fish" 2>/dev/null || true
    echo "|  [OK] Copied completion files"
  fi
fi

if [[ ! -L "$INSTALL_DIR/ccs" ]]; then
  echo "|"
  echo "[X] Error: Failed to create symlink at $INSTALL_DIR/ccs"
  echo "  Check directory permissions and try again."
  exit 1
fi

# Install uninstall script (with idempotency check)
if [[ -f "$SCRIPT_DIR/uninstall.sh" ]]; then
  # Only copy if source and destination are different
  if [[ "$SCRIPT_DIR/uninstall.sh" != "$CCS_DIR/uninstall.sh" ]]; then
    cp "$SCRIPT_DIR/uninstall.sh" "$CCS_DIR/uninstall.sh"
  fi
  chmod +x "$CCS_DIR/uninstall.sh"
  ln -sf "$CCS_DIR/uninstall.sh" "$INSTALL_DIR/ccs-uninstall"
  echo "|  [OK] Installed uninstaller"
elif [[ "$INSTALL_METHOD" == "standalone" ]] && command -v curl &> /dev/null; then
  if curl -fsSL https://raw.githubusercontent.com/kaitranntt/ccs/main/installers/uninstall.sh -o "$CCS_DIR/uninstall.sh"; then
    chmod +x "$CCS_DIR/uninstall.sh"
    ln -sf "$CCS_DIR/uninstall.sh" "$INSTALL_DIR/ccs-uninstall"
    echo "|  [OK] Installed uninstaller"
  fi
fi

echo "|  [OK] Created directories"

# Install .claude/ folder
if [[ "$INSTALL_METHOD" == "git" ]]; then
  install_claude_folder "$SCRIPT_DIR/.." || echo "|  [!] Optional .claude/ installation skipped"
else
  install_claude_folder "" || echo "|  [!] Optional .claude/ installation skipped"
fi

echo "└─"
echo ""

# --- Profile Setup ---

CURRENT_PROVIDER=$(detect_current_provider)
GLM_SETTINGS="$CCS_DIR/glm.settings.json"
KIMI_SETTINGS="$CCS_DIR/kimi.settings.json"

# Build provider label
PROVIDER_LABEL=""
[[ "$CURRENT_PROVIDER" == "glm" ]] && PROVIDER_LABEL=" (detected: GLM)"
[[ "$CURRENT_PROVIDER" == "kimi" ]] && PROVIDER_LABEL=" (detected: Kimi)"
[[ "$CURRENT_PROVIDER" == "claude" ]] && PROVIDER_LABEL=" (detected: Claude)"
[[ "$CURRENT_PROVIDER" == "custom" ]] && PROVIDER_LABEL=" (detected: custom)"

echo "┌─ Configuring Profiles (v${CCS_VERSION})${PROVIDER_LABEL}"

# Backup existing config if present (single backup, no timestamp)
BACKUP_FILE="$CCS_DIR/config.json.backup"
if [[ -f "$CCS_DIR/config.json" ]]; then
  cp "$CCS_DIR/config.json" "$BACKUP_FILE"
fi

# Track if GLM needs API key
NEEDS_GLM_KEY=false

# Create GLM profile if missing
if [[ ! -f "$GLM_SETTINGS" ]]; then
  create_glm_profile "$CURRENT_PROVIDER" >/dev/null 2>&1
  echo "|  [OK] GLM profile -> ~/.ccs/glm.settings.json"
  [[ "$CURRENT_PROVIDER" != "glm" ]] && NEEDS_GLM_KEY=true
fi

# Track if Kimi needs API key
NEEDS_KIMI_KEY=false

# Create Kimi profile if missing
if [[ ! -f "$KIMI_SETTINGS" ]]; then
  create_kimi_profile "$CURRENT_PROVIDER" >/dev/null 2>&1
  echo "|  [OK] Kimi profile -> ~/.ccs/kimi.settings.json"
  [[ "$CURRENT_PROVIDER" != "kimi" ]] && NEEDS_KIMI_KEY=true
fi

# Create config if missing
if [[ ! -f "$CCS_DIR/config.json" ]]; then
  cat > "$CCS_DIR/config.json.tmp" << 'EOF'
{
  "profiles": {
    "glm": "~/.ccs/glm.settings.json",
    "kimi": "~/.ccs/kimi.settings.json",
    "default": "~/.claude/settings.json"
  }
}
EOF
  atomic_mv "$CCS_DIR/config.json.tmp" "$CCS_DIR/config.json"
  echo "|  [OK] Config -> ~/.ccs/config.json"
fi

# Validate config JSON
if [[ -f "$CCS_DIR/config.json" ]]; then
  if command -v jq &> /dev/null; then
    if ! jq -e . "$CCS_DIR/config.json" &>/dev/null; then
      echo "|  [!]  Warning: Invalid JSON in config.json"
      if [[ -f "$BACKUP_FILE" ]]; then
        echo "|     Restore from: $BACKUP_FILE"
      fi
    fi
  fi
fi

# Validate GLM settings JSON
if [[ -f "$GLM_SETTINGS" ]]; then
  if command -v jq &> /dev/null; then
    if ! jq -e . "$GLM_SETTINGS" &>/dev/null; then
      echo "|  [!]  Warning: Invalid JSON in glm.settings.json"
    fi
  fi
fi

echo "└─"
echo ""

# Detect circular symlink
detect_circular_symlink() {
  local target="$1"
  local link_path="$2"

  # Check if target exists and is symlink
  if [[ ! -L "$target" ]]; then
    return 1  # Not circular
  fi

  # Resolve target's link
  local target_link=$(readlink "$target" 2>/dev/null || echo "")
  local shared_dir="$HOME/.ccs/shared"

  # Check if target points back to our shared dir
  if [[ "$target_link" == "$shared_dir"* ]] || [[ "$target_link" == "$link_path" ]]; then
    echo "[!] Circular symlink detected: $target → $target_link"
    return 0  # Circular
  fi

  return 1  # Not circular
}

# Setup shared directories as symlinks to ~/.claude/ (v3.2.0)
setup_shared_symlinks() {
  local shared_dir="$CCS_DIR/shared"
  local claude_dir="$HOME/.claude"

  # Create ~/.claude/ if missing
  if [[ ! -d "$claude_dir" ]]; then
    echo "[i] Creating ~/.claude/ directory structure"
    mkdir -p "$claude_dir"/{commands,skills,agents}
  fi

  # Create shared directory
  mkdir -p "$shared_dir"

  # Create symlinks ~/.ccs/shared/* → ~/.claude/*
  for dir in commands skills agents; do
    local claude_path="$claude_dir/$dir"
    local shared_path="$shared_dir/$dir"

    # Create directory in ~/.claude/ if missing
    if [[ ! -d "$claude_path" ]]; then
      mkdir -p "$claude_path"
    fi

    # Check for circular symlink
    if detect_circular_symlink "$claude_path" "$shared_path"; then
      echo "[!] Skipping $dir: circular symlink detected"
      continue
    fi

    # If already correct symlink, skip
    if [[ -L "$shared_path" ]]; then
      local current_target=$(readlink "$shared_path" 2>/dev/null || echo "")
      if [[ "$current_target" == "$claude_path" ]]; then
        continue  # Already correct
      fi
      rm -rf "$shared_path"
    elif [[ -e "$shared_path" ]]; then
      # Backup existing data before replacing
      if [[ -d "$shared_path" ]] && [[ -n "$(ls -A "$shared_path" 2>/dev/null)" ]]; then
        echo "[i] Migrating existing $dir to ~/.claude/$dir"
        # Copy to claude dir (preserve user modifications)
        for item in "$shared_path"/*; do
          [[ -e "$item" ]] || continue
          local basename=$(basename "$item")
          if [[ ! -e "$claude_path/$basename" ]]; then
            cp -r "$item" "$claude_path/" 2>/dev/null
          fi
        done
      fi
      rm -rf "$shared_path"
    fi

    # Create symlink
    ln -s "$claude_path" "$shared_path" 2>/dev/null || {
      echo "[!] Failed to create symlink for $dir, copying instead"
      mkdir -p "$shared_path"
      if [[ -d "$claude_path" ]]; then
        cp -r "$claude_path"/* "$shared_path/" 2>/dev/null || true
      fi
    }
  done
}

echo "[i] Setting up shared directories..."
setup_shared_symlinks
echo ""

# Install CCS items to ~/.claude/ via symlinks (v4.1.0)
echo "[i] Installing CCS items to ~/.claude/..."
if command -v node &> /dev/null; then
  # Check if .claude/ was successfully installed
  if [[ -d "$CCS_DIR/.claude" ]]; then
    # Download or copy claude-symlink-manager.js
    mkdir -p "$CCS_DIR/bin/utils"

    if [[ "$INSTALL_METHOD" == "git" ]]; then
      # Git install - copy from local repo
      if [[ -f "$SCRIPT_DIR/../bin/utils/claude-symlink-manager.js" ]]; then
        cp "$SCRIPT_DIR/../bin/utils/claude-symlink-manager.js" "$CCS_DIR/bin/utils/claude-symlink-manager.js"
      elif [[ -f "$SCRIPT_DIR/bin/utils/claude-symlink-manager.js" ]]; then
        cp "$SCRIPT_DIR/bin/utils/claude-symlink-manager.js" "$CCS_DIR/bin/utils/claude-symlink-manager.js"
      fi
    else
      # Standalone install - download from GitHub
      if ! curl -fsSL "https://raw.githubusercontent.com/kaitranntt/ccs/main/bin/utils/claude-symlink-manager.js" -o "$CCS_DIR/bin/utils/claude-symlink-manager.js" 2>/dev/null; then
        echo "[!] Failed to download claude-symlink-manager.js"
      fi
    fi

    # Call ClaudeSymlinkManager if available
    if [[ -f "$CCS_DIR/bin/utils/claude-symlink-manager.js" ]]; then
      node -e "
        try {
          const ClaudeSymlinkManager = require('$CCS_DIR/bin/utils/claude-symlink-manager.js');
          const manager = new ClaudeSymlinkManager();
          manager.install();
        } catch (err) {
          console.log('[!] CCS item installation warning: ' + err.message);
          console.log('    Run \"ccs sync\" to retry');
        }
      " 2>/dev/null || echo "[!] CCS item installation skipped (run 'ccs sync' later)"
    else
      echo "[!] claude-symlink-manager.js not found, skipping"
      echo "    Run 'ccs sync' after installation to complete setup"
    fi
  else
    echo "[!] .claude/ folder not found, skipping CCS item installation"
  fi
else
  echo "[!] Node.js not found, skipping CCS item installation"
  echo "    Install Node.js and run 'ccs sync' to complete setup"
fi
echo ""

# Auto-configure PATH if needed (all Unix platforms)
configure_shell_path

# Show API key warning if needed
if [[ "$NEEDS_GLM_KEY" == "true" ]]; then
  msg_critical "Configure GLM API Key:

    1. Get API key from: https://api.z.ai

    2. Edit: ~/.ccs/glm.settings.json

    3. Replace: YOUR_GLM_API_KEY_HERE
       With your actual API key

    4. Test: ccs glm --version"
fi

# Show API key warning for Kimi if needed
if [[ "$NEEDS_KIMI_KEY" == "true" ]]; then
  msg_critical "Configure Kimi API Key:

    1. Get API key from: https://www.kimi.com/coding

    2. Edit: ~/.ccs/kimi.settings.json

    3. Replace: YOUR_KIMI_API_KEY_HERE
       With your actual API key

    4. Test: ccs kimi --version"
fi

msg_success "CCS installed successfully!"
echo ""
echo "   Installed components:"
echo "     * ccs command        -> ~/.local/bin/ccs"
echo "     * config             -> ~/.ccs/config.json"
echo "     * glm profile        -> ~/.ccs/glm.settings.json"
echo "     * kimi profile       -> ~/.ccs/kimi.settings.json"
echo "     * .claude/ folder    -> ~/.ccs/.claude/"
echo ""
echo "   Quick start:"
echo "     ccs           # Use Claude subscription (default)"
echo "     ccs glm       # Use GLM fallback"
echo "     ccs kimi      # Use Kimi for Coding"
echo ""
echo ""
echo "   To uninstall: ccs-uninstall"
echo ""
