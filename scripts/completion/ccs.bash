# Bash completion for CCS (Claude Codex Switch)
# Compatible with bash 3.2+

_ccs_completion() {
  local cur
  COMPREPLY=()
  cur="${COMP_WORDS[COMP_CWORD]}"

  local tokens_before_current=()
  if [[ ${COMP_CWORD} -gt 1 ]]; then
    tokens_before_current=("${COMP_WORDS[@]:1:COMP_CWORD-1}")
  fi

  while IFS= read -r line; do
    [[ -n "${line}" ]] && COMPREPLY+=("${line}")
  done < <(__ccs_completion_run "${cur}" "${tokens_before_current[@]}")

  return 0
}

__ccs_completion_run() {
  local current="$1"
  shift || true

  if command -v ccs >/dev/null 2>&1; then
    ccs __complete --shell bash --current "${current}" -- "$@" 2>/dev/null
  fi
}

complete -F _ccs_completion ccs
