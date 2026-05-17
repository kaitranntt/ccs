/**
 * Help text for `ccsx auth` command tree.
 * ASCII-only. Includes ccsxp scope clarifier (H5).
 */

export function printCodexAuthHelp(): void {
  process.stdout.write(`CCS Concurrent Codex Account Management

Usage
  ccsx auth <command> [options]

Commands
  create <name>          Create a new Codex profile (idempotent)
  login <name>           Run \`codex login\` against the profile (auto-creates if missing)
  switch <name>          Set the persistent default Codex profile
  use <name>             Emit shell-eval exports to activate a profile in this shell only
  show [name]            List profiles or show details for one
  remove <name>          Delete a profile (auth.json + profile dir + registry entry)
  import-default <name>  Migrate legacy ~/.codex/auth.json into a new profile

Shell activation (per terminal)
  bash/zsh: eval "$(ccsx auth use work)"
  fish:     ccsx auth use work | source
  pwsh:     ccsx auth use work | Invoke-Expression

Examples
  ccsx auth create work
  ccsx auth login work          # OAuth in browser
  ccsx auth create personal
  ccsx auth login personal
  eval "$(ccsx auth use work)"  # terminal A
  eval "$(ccsx auth use personal)"  # terminal B
  codex                              # each terminal uses its own account
  ccsx auth show
  ccsx auth switch personal     # change persistent default
  ccsx auth remove old --yes

Options
  --yes, -y              Skip confirmation (remove)
  --force                Re-link config.toml (create) | override default check (remove) |
                         overwrite existing profile (import-default)
  --json                 JSON output (show)
  --shell <s>            Override shell detection (use): bash|zsh|fish|pwsh|cmd
  --with-history         Copy history.jsonl + sessions/ too (import-default, default: off)
  --force-while-running  Allow import-default even if Codex is running (risky)

Notes
  Auth state (auth.json) and history.jsonl are isolated per profile.
  config.toml is shared via symlink to ~/.codex/config.toml.
  Default profile (switch) is persistent across shells.
  Active profile (use) is per-terminal via CODEX_HOME / CCS_CODEX_PROFILE.

  Note: This feature applies only to native \`codex\`. \`ccsxp\` ignores
  CCS_CODEX_PROFILE and uses its own cliproxy pool.
`);
}

export function printCodexAuthUseHelp(): void {
  process.stdout.write(`ccsx auth use — Activate a Codex profile in the current shell

Usage
  ccsx auth use <name> [--shell <bash|zsh|fish|pwsh|cmd>]

Description
  Emits shell-evalable export statements to stdout. Use within eval "$(...)"
  only. Output to stdout is shell-evaluatable; do not pipe to other commands.

  All errors and informational messages go to stderr so the eval is never
  contaminated.

Shell evaluation
  bash/zsh: eval "$(ccsx auth use work)"
  fish:     ccsx auth use work | source
  pwsh:     ccsx auth use work | Invoke-Expression
  cmd:      (not supported natively; use PowerShell)

Options
  --shell <s>   Override auto-detected shell: bash|zsh|fish|pwsh|cmd

Note: This profile applies only to native \`codex\`. \`ccsxp\` ignores
CCS_CODEX_PROFILE and uses its own cliproxy pool.
`);
}
