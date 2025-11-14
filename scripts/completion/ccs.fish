# Fish completion for CCS (Claude Code Switch)
# Compatible with fish 3.0+
#
# Installation:
#   Copy to ~/.config/fish/completions/:
#     mkdir -p ~/.config/fish/completions
#     cp scripts/completion/ccs.fish ~/.config/fish/completions/
#
#   Fish will automatically load completions from this directory.
#   No need to source or reload - completions are loaded on demand.

# Helper function to get profiles
function __fish_ccs_get_profiles
    set -l config_path ~/.ccs/config.json
    set -l profiles_path ~/.ccs/profiles.json

    # Get settings-based profiles from config.json
    if test -f $config_path
        jq -r '.profiles | keys[]' $config_path 2>/dev/null
    end

    # Get account-based profiles from profiles.json
    if test -f $profiles_path
        jq -r '.profiles | keys[]' $profiles_path 2>/dev/null
    end
end

# Helper function to get account profiles only
function __fish_ccs_get_account_profiles
    set -l profiles_path ~/.ccs/profiles.json

    if test -f $profiles_path
        jq -r '.profiles | keys[]' $profiles_path 2>/dev/null
    end
end

# Helper function to check if we're in auth context
function __fish_ccs_using_auth
    __fish_seen_subcommand_from auth
end

# Helper function to check specific auth subcommand
function __fish_ccs_using_auth_subcommand
    set -l subcommand $argv[1]
    __fish_ccs_using_auth; and __fish_seen_subcommand_from $subcommand
end

# Disable file completion for ccs
complete -c ccs -f

# Top-level flags
complete -c ccs -s h -l help -d 'Show help message'
complete -c ccs -s v -l version -d 'Show version information'

# Top-level commands
complete -c ccs -n 'not __fish_seen_subcommand_from auth doctor' -a 'auth' -d 'Manage multiple Claude accounts'
complete -c ccs -n 'not __fish_seen_subcommand_from auth doctor' -a 'doctor' -d 'Run health check and diagnostics'

# Top-level profile completion (all profiles)
complete -c ccs -n 'not __fish_seen_subcommand_from auth doctor' -a '(__fish_ccs_get_profiles)' -d 'Switch to profile'

# auth subcommands
complete -c ccs -n '__fish_ccs_using_auth; and not __fish_seen_subcommand_from create list show remove default' -a 'create' -d 'Create new profile and login'
complete -c ccs -n '__fish_ccs_using_auth; and not __fish_seen_subcommand_from create list show remove default' -a 'list' -d 'List all saved profiles'
complete -c ccs -n '__fish_ccs_using_auth; and not __fish_seen_subcommand_from create list show remove default' -a 'show' -d 'Show profile details'
complete -c ccs -n '__fish_ccs_using_auth; and not __fish_seen_subcommand_from create list show remove default' -a 'remove' -d 'Remove saved profile'
complete -c ccs -n '__fish_ccs_using_auth; and not __fish_seen_subcommand_from create list show remove default' -a 'default' -d 'Set default profile'

# auth command flags
complete -c ccs -n '__fish_ccs_using_auth' -s h -l help -d 'Show help for auth commands'

# auth create flags
complete -c ccs -n '__fish_ccs_using_auth_subcommand create' -l force -d 'Allow overwriting existing profile'

# auth list flags
complete -c ccs -n '__fish_ccs_using_auth_subcommand list' -l verbose -d 'Show additional details'
complete -c ccs -n '__fish_ccs_using_auth_subcommand list' -l json -d 'Output in JSON format'

# auth show - profile names and flags
complete -c ccs -n '__fish_ccs_using_auth_subcommand show' -a '(__fish_ccs_get_account_profiles)' -d 'Account profile'
complete -c ccs -n '__fish_ccs_using_auth_subcommand show' -l json -d 'Output in JSON format'

# auth remove - profile names and flags
complete -c ccs -n '__fish_ccs_using_auth_subcommand remove' -a '(__fish_ccs_get_account_profiles)' -d 'Account profile'
complete -c ccs -n '__fish_ccs_using_auth_subcommand remove' -l yes -d 'Skip confirmation prompts'
complete -c ccs -n '__fish_ccs_using_auth_subcommand remove' -s y -d 'Skip confirmation prompts'

# auth default - profile names only
complete -c ccs -n '__fish_ccs_using_auth_subcommand default' -a '(__fish_ccs_get_account_profiles)' -d 'Account profile'

# doctor command flags
complete -c ccs -n '__fish_seen_subcommand_from doctor' -s h -l help -d 'Show help for doctor command'
