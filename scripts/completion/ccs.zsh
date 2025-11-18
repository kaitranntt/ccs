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

# Set up completion styles for better formatting and colors
# Color codes: 0;34=blue, 0;32=green, 0;33=yellow, 2;37=dim white
# Pattern format: =(#b)(group1)(group2)==color_for_group1=color_for_group2
# The leading '=' means no color for whole match, then each '=' assigns to each group
zstyle ':completion:*:*:ccs:*:commands' list-colors '=(#b)(auth|doctor|sync)([[:space:]]#--[[:space:]]#*)==0\;34=2\;37'
zstyle ':completion:*:*:ccs:*:model-profiles' list-colors '=(#b)(default|glm|glmt|kimi|[^[:space:]]##)([[:space:]]#--[[:space:]]#*)==0\;32=2\;37'
zstyle ':completion:*:*:ccs:*:account-profiles' list-colors '=(#b)([^[:space:]]##)([[:space:]]#--[[:space:]]#*)==0\;33=2\;37'
zstyle ':completion:*:*:ccs:*' group-name ''
zstyle ':completion:*:*:ccs:*:descriptions' format $'\n%B%F{yellow}── %d ──%f%b'
zstyle ':completion:*:*:ccs:*' list-separator '  --  '
zstyle ':completion:*:*:ccs:*' list-rows-first true
zstyle ':completion:*:*:ccs:*' menu select

_ccs() {
  local -a commands settings_profiles_described account_profiles_described
  local curcontext="$curcontext" state line
  typeset -A opt_args

  # Define top-level commands (padded for alignment)
  commands=(
    'auth:Manage multiple Claude accounts'
    'doctor:Run health check and diagnostics'
    'sync:Sync delegation commands and skills'
  )

  # Define known settings profiles with descriptions (consistent padding)
  local -A profile_descriptions
  profile_descriptions=(
    'default' 'Default Claude Sonnet 4.5'
    'glm'     'GLM-4.6 (cost-optimized)'
    'glmt'    'GLM-4.6 with thinking mode'
    'kimi'    'Kimi for Coding (long-context)'
  )

  # Load settings-based profiles from config.json
  if [[ -f ~/.ccs/config.json ]]; then
    local -a raw_settings_profiles
    raw_settings_profiles=(${(f)"$(jq -r '.profiles | keys[]' ~/.ccs/config.json 2>/dev/null)"})

    # Add descriptions to settings profiles
    for profile in $raw_settings_profiles; do
      local desc="${profile_descriptions[$profile]:-Settings-based profile}"
      settings_profiles_described+=("${profile}:${desc}")
    done
  fi

  # Load account-based profiles from profiles.json
  if [[ -f ~/.ccs/profiles.json ]]; then
    local -a raw_account_profiles
    raw_account_profiles=(${(f)"$(jq -r '.profiles | keys[]' ~/.ccs/profiles.json 2>/dev/null)"})

    # Add descriptions to account profiles
    for profile in $raw_account_profiles; do
      account_profiles_described+=("${profile}:Account-based profile")
    done
  fi

  _arguments -C \
    '(- *)'{-h,--help}'[Show help message]' \
    '(- *)'{-v,--version}'[Show version information]' \
    '(- *)'{-sc,--shell-completion}'[Install shell completion]' \
    '1: :->command' \
    '*:: :->args'

  case $state in
    command)
      # Describe commands and profiles with proper tagging for colors
      _describe -t commands 'commands' commands
      _describe -t model-profiles 'model profiles' settings_profiles_described
      _describe -t account-profiles 'account profiles' account_profiles_described
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
        --shell-completion)
          _arguments \
            '--bash[Install for bash]' \
            '--zsh[Install for zsh]' \
            '--fish[Install for fish]' \
            '--powershell[Install for PowerShell]'
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
