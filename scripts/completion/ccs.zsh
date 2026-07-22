#compdef ccs

# Zsh completion for CCS (Claude Codex Switch)

_ccs() {
  local current
  current="${words[CURRENT]}"

  local -a tokens_before_current
  if (( CURRENT > 2 )); then
    tokens_before_current=("${words[@]:2:$((CURRENT-2))}")
  else
    tokens_before_current=()
  fi

  local -a suggestions
  suggestions=("${(@f)$(__ccs_completion_run "${current}" "${tokens_before_current[@]}")}")
  compadd -- "${suggestions[@]}"
}

__ccs_completion_run() {
  local current="$1"
  shift || true

  if (( $+commands[ccs] )); then
    ccs __complete --shell zsh --current "${current}" -- "$@" 2>/dev/null
  fi
}
