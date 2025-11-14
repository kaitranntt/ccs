#compdef ccs

# Zsh completion for CCS (Claude Code Switch)
# Compatible with zsh 5.0+
#
# Installation:
#   Add to ~/.zshrc:
#     fpath=(~/.zsh/completion $fpath)
#     autoload -Uz compinit && compinit
#     source /path/to/ccs/scripts/completion/ccs.zsh
#
#   Or install system-wide:
#     sudo cp scripts/completion/ccs.zsh /usr/local/share/zsh/site-functions/_ccs

_ccs() {
  local -a commands profiles settings_profiles account_profiles
  local curcontext="$curcontext" state line
  typeset -A opt_args

  # Define top-level commands
  commands=(
    'auth:Manage multiple Claude accounts'
    'doctor:Run health check and diagnostics'
  )

  # Load settings-based profiles from config.json
  if [[ -f ~/.ccs/config.json ]]; then
    settings_profiles=(${(f)"$(jq -r '.profiles | keys[]' ~/.ccs/config.json 2>/dev/null)"})
  fi

  # Load account-based profiles from profiles.json
  if [[ -f ~/.ccs/profiles.json ]]; then
    account_profiles=(${(f)"$(jq -r '.profiles | keys[]' ~/.ccs/profiles.json 2>/dev/null)"})
  fi

  # Combine all profiles
  profiles=($settings_profiles $account_profiles)

  _arguments -C \
    '(- *)'{-h,--help}'[Show help message]' \
    '(- *)'{-v,--version}'[Show version information]' \
    '1: :->command' \
    '*:: :->args'

  case $state in
    command)
      local -a all_options
      all_options=($commands $profiles)
      _describe -t commands 'ccs commands' all_options
      ;;

    args)
      case $words[1] in
        auth)
          _ccs_auth
          ;;
        doctor)
          _arguments \
            '(- *)'{-h,--help}'[Show help for doctor command]'
          ;;
        *)
          # For profile names, complete with Claude CLI arguments
          _message 'Claude CLI arguments'
          ;;
      esac
      ;;
  esac
}

_ccs_auth() {
  local curcontext="$curcontext" state line
  typeset -A opt_args

  local -a auth_commands account_profiles

  # Define auth subcommands
  auth_commands=(
    'create:Create new profile and login'
    'list:List all saved profiles'
    'show:Show profile details'
    'remove:Remove saved profile'
    'default:Set default profile'
  )

  # Load account profiles
  if [[ -f ~/.ccs/profiles.json ]]; then
    account_profiles=(${(f)"$(jq -r '.profiles | keys[]' ~/.ccs/profiles.json 2>/dev/null)"})
  fi

  _arguments -C \
    '(- *)'{-h,--help}'[Show help for auth commands]' \
    '1: :->subcommand' \
    '*:: :->subargs'

  case $state in
    subcommand)
      _describe -t auth-commands 'auth commands' auth_commands
      ;;

    subargs)
      case $words[1] in
        create)
          _message 'new profile name'
          _arguments '--force[Allow overwriting existing profile]'
          ;;
        list)
          _arguments \
            '--verbose[Show additional details]' \
            '--json[Output in JSON format]'
          ;;
        show)
          _arguments \
            '1:profile:($account_profiles)' \
            '--json[Output in JSON format]'
          ;;
        remove)
          _arguments \
            '1:profile:($account_profiles)' \
            {--yes,-y}'[Skip confirmation prompts]'
          ;;
        default)
          _arguments '1:profile:($account_profiles)'
          ;;
      esac
      ;;
  esac
}

# Register the completion function
_ccs "$@"
