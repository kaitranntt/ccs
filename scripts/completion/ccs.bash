# Bash completion for CCS (Claude Code Switch)
# Compatible with bash 3.2+
#
# Installation:
#   Add to ~/.bashrc or ~/.bash_profile:
#     source /path/to/ccs/scripts/completion/ccs.bash
#
#   Or install system-wide (requires sudo):
#     sudo cp scripts/completion/ccs.bash /etc/bash_completion.d/ccs

_ccs_completion() {
  local cur prev words cword
  COMPREPLY=()

  # Get current word and previous word
  cur="${COMP_WORDS[COMP_CWORD]}"
  prev="${COMP_WORDS[COMP_CWORD-1]}"

  # Top-level completion (first argument)
  if [[ ${COMP_CWORD} -eq 1 ]]; then
    local commands="auth doctor sync"
    local flags="--help --version --shell-completion -h -v -sc"
    local profiles=""

    # Add profiles from config.json (settings-based profiles)
    if [[ -f ~/.ccs/config.json ]]; then
      profiles="$profiles $(jq -r '.profiles | keys[]' ~/.ccs/config.json 2>/dev/null || true)"
    fi

    # Add profiles from profiles.json (account-based profiles)
    if [[ -f ~/.ccs/profiles.json ]]; then
      profiles="$profiles $(jq -r '.profiles | keys[]' ~/.ccs/profiles.json 2>/dev/null || true)"
    fi

    # Combine all options
    local opts="$commands $flags $profiles"
    COMPREPLY=( $(compgen -W "${opts}" -- ${cur}) )
    return 0
  fi

  # auth subcommands
  if [[ ${prev} == "auth" ]]; then
    local auth_commands="create list show remove default --help -h"
    COMPREPLY=( $(compgen -W "${auth_commands}" -- ${cur}) )
    return 0
  fi

  # Completion for auth subcommands that need profile names
  if [[ ${COMP_WORDS[1]} == "auth" ]]; then
    case "${prev}" in
      show|remove|default)
        # Complete with account profile names only
        if [[ -f ~/.ccs/profiles.json ]]; then
          local profiles=$(jq -r '.profiles | keys[]' ~/.ccs/profiles.json 2>/dev/null || true)
          COMPREPLY=( $(compgen -W "${profiles}" -- ${cur}) )
        fi
        return 0
        ;;
      create)
        # No completion for create (user enters new name)
        return 0
        ;;
      list)
        # Complete with list flags
        COMPREPLY=( $(compgen -W "--verbose --json" -- ${cur}) )
        return 0
        ;;
    esac
  fi

  # Flags for doctor command
  if [[ ${COMP_WORDS[1]} == "doctor" ]]; then
    COMPREPLY=( $(compgen -W "--help -h" -- ${cur}) )
    return 0
  fi

  # Flags for shell-completion command
  if [[ ${prev} == "--shell-completion" ]]; then
    COMPREPLY=( $(compgen -W "--bash --zsh --fish --powershell" -- ${cur}) )
    return 0
  fi

  return 0
}

# Register completion function
complete -F _ccs_completion ccs
