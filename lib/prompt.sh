#!/usr/bin/env bash
# CCS Interactive Prompt Utilities (bash 3.2+ compatible)
# NO external dependencies

set -euo pipefail

# Interactive confirmation prompt
# Usage: confirm_action "message" "yes"|"no"
# Returns: 0 (true) or 1 (false)
confirm_action() {
  local message="$1"
  local default="${2:-no}"  # Default to NO for safety

  # Check for --yes flag (automation) - always returns true (0)
  if [[ "${CCS_YES:-}" == "1" ]]; then
    return 0
  fi

  # Check for --no-input flag (CI)
  if [[ "${CCS_NO_INPUT:-}" == "1" ]]; then
    echo "[X] Interactive input required but --no-input specified" >&2
    exit 1
  fi

  # Non-TTY: use default
  if [[ ! -t 0 ]]; then
    [[ "$default" == "yes" ]] && return 0 || return 1
  fi

  # Interactive prompt
  local prompt
  if [[ "$default" == "yes" ]]; then
    prompt="$message [Y/n]: "
  else
    prompt="$message [y/N]: "
  fi

  while true; do
    read -r -p "$prompt" response >&2
    response=$(echo "$response" | tr '[:upper:]' '[:lower:]')

    case "$response" in
      ""|" ")
        # Empty answer: use default
        [[ "$default" == "yes" ]] && return 0 || return 1
        ;;
      y|yes)
        return 0
        ;;
      n|no)
        return 1
        ;;
      *)
        echo "[!] Please answer y or n" >&2
        ;;
    esac
  done
}

# Interactive text input
# Usage: prompt_input "message" "default_value"
# Outputs: user input to stdout
prompt_input() {
  local message="$1"
  local default="${2:-}"

  # Non-TTY: use default or error
  if [[ ! -t 0 ]]; then
    if [[ -n "$default" ]]; then
      echo "$default"
      return 0
    else
      echo "[X] Interactive input required but stdin is not a TTY" >&2
      exit 1
    fi
  fi

  # Interactive prompt
  local prompt
  if [[ -n "$default" ]]; then
    prompt="$message [$default]: "
  else
    prompt="$message: "
  fi

  read -r -p "$prompt" response >&2

  # Return user input or default
  if [[ -z "$response" ]]; then
    echo "$default"
  else
    echo "$response"
  fi
}

# Check if running in non-interactive mode
is_non_interactive() {
  [[ ! -t 0 ]] || [[ "${CCS_YES:-}" == "1" ]] || [[ "${CCS_NO_INPUT:-}" == "1" ]]
}
