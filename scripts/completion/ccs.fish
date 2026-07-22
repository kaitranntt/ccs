# Fish completion for CCS (Claude Codex Switch)

function __fish_ccs_complete
    set -l tokens_before_current (commandline -opc)
    if test (count $tokens_before_current) -gt 0
        set -e tokens_before_current[1]
    end

    set -l current (commandline -ct)
    if test -n "$current"; and test (count $tokens_before_current) -gt 0; and test "$tokens_before_current[-1]" = "$current"
        set -e tokens_before_current[-1]
    end

    if command -sq ccs
        ccs __complete --shell fish --current "$current" -- $tokens_before_current 2>/dev/null
    end
end

complete -c ccs -f -a "(__fish_ccs_complete)"
