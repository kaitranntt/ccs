# Codex Auth Profile Isolation (`ccsx auth`)

Run two Codex accounts simultaneously — one per terminal — with full auth isolation.

## Why

Codex stores its OAuth credentials in a single directory (`~/.codex/`). When you run two
`codex` sessions in separate terminals, they both write to the same `auth.json`. A token
refresh in one session overwrites the other's credentials.

`ccsx auth` solves this by giving each account its own profile directory under
`~/.ccs/codex-instances/<name>/`. Each profile holds its own `auth.json` and
`history.jsonl`. A shared `config.toml` is linked via symlink so model/provider settings
stay in sync.

## Quick start (4 commands)

```bash
# Create and authenticate two profiles
ccsx auth create work       # creates ~/.ccs/codex-instances/work/ and prompts for login
ccsx auth create personal   # same for personal account

# Activate per terminal (ephemeral — only this shell)
# Terminal A:
eval "$(ccsx auth use work)"
codex

# Terminal B:
eval "$(ccsx auth use personal)"
codex
```

## Two-terminal example

```bash
# Terminal A — work account
eval "$(ccsx auth use work)"
codex                         # runs with CODEX_HOME=~/.ccs/codex-instances/work

# Terminal B — personal account (simultaneously)
eval "$(ccsx auth use personal)"
codex                         # runs with CODEX_HOME=~/.ccs/codex-instances/personal

# No token clobbering. Each session refreshes its own auth.json only.
```

## Command reference

| Command | Description |
|---------|-------------|
| `ccsx auth create <name>` | Create profile dir + auto-login |
| `ccsx auth login <name>` | (Re-)authenticate an existing profile |
| `ccsx auth switch <name>` | Set the persistent default profile for future `ccsx` launches |
| `ccsx auth use <name>` | Emit shell exports for this shell only (use with `eval`) |
| `ccsx auth show [name]` | List all profiles or show details for one |
| `ccsx auth remove <name>` | Delete profile dir + registry entry |
| `ccsx auth import-default <name>` | Migrate legacy `~/.codex/auth.json` into a new profile |

## Persistent vs ephemeral switching

| Method | Scope | How |
|--------|-------|-----|
| `ccsx auth switch <name>` | Future `ccsx` launches | Writes to `~/.ccs/codex-profiles.yaml` |
| `eval "$(ccsx auth use <name>)"` | Current shell only | Sets `CODEX_HOME` + `CCS_CODEX_PROFILE` in your shell |

Native `codex` shells only see the persistent default when launched through the `ccsx`
Codex runtime. For an already-open shell or a plain native `codex` binary, use `auth use`.

Do not use `ccs persist codex` for Claude Code or the Claude Code Extension. That path
would persist Claude settings that send Claude traffic through the Codex translator. CCS
blocks Codex CLIProxy profiles from Claude extension setup; use `ccsxp` or
`ccs codex --target codex` for ChatGPT/Codex subscriptions. If old settings were already
persisted, clear them with:

```bash
ccs persist default --yes
```

Shell syntax for `use`:

```bash
# bash / zsh
eval "$(ccsx auth use work)"

# fish
ccsx auth use work | source

# PowerShell
ccsx auth use work | Invoke-Expression
```

## Migration from `~/.codex`

If you already have a logged-in session in `~/.codex/auth.json`, import it without
disturbing the original:

```bash
# Auth only (default — recommended)
ccsx auth import-default legacy

# Auth + history + sessions (opt-in)
ccsx auth import-default legacy --with-history

# Make it the default
ccsx auth switch legacy
```

The source `~/.codex/` directory is **never modified**. If `import-default` is not run,
`codex` continues to work exactly as before.

### Torn-write safety

Codex writes `auth.json` with truncate+write (not atomic rename). Running
`import-default` while a token refresh is in flight can produce a corrupt copy.
The command detects a running `codex` process via `pgrep` and refuses unless you
pass `--force-while-running`. The safest approach is to quit Codex before
importing.

## Dashboard

The CCS dashboard shows active profile metadata at the **Auth Profiles** tab on the
Codex page:

- Profile name and whether it is the current default
- Decoded email address (from `id_token` — no signature verification; display only)
- Plan tier (Plus, Pro, Free) when present in the token
- Last-used timestamp

No OAuth tokens are ever returned by the API endpoint or shown in the UI.

## Profile disk layout

```
~/.ccs/
├── codex-profiles.yaml          # Registry: version, default, profiles metadata
└── codex-instances/
    └── <name>/
        ├── auth.json            # OAuth credentials (Codex writes here)
        ├── history.jsonl        # Per-profile prompt history (optional)
        ├── sessions/            # Per-profile chat session dirs (optional)
        └── config.toml -> ~/.codex/config.toml   (symlink — shared)

~/.codex/
└── config.toml                  # Single shared model/provider config
```

## Caveats

### Windows symlinks

On Windows, creating symlinks requires Developer Mode or elevated privileges.
If symlink creation fails, CCS falls back to copying `config.toml`. In this case,
changes to `~/.codex/config.toml` are **not** automatically reflected in the profile —
you must re-run `ccsx auth create <name> --force` to refresh the copy.

### `ccsx` vs `ccsxp`

`ccsx auth` profiles apply only to the **native `codex`** CLI. They have no effect on
`ccsxp` (the CLIProxy round-robin pool). `ccsxp` unconditionally sets its own
`CODEX_HOME` on startup and ignores `CCS_CODEX_PROFILE`.

If you run `eval "$(ccsx auth use work)"` and then invoke `ccsxp`, a notice is emitted
to stderr:

```
[i] CCS_CODEX_PROFILE is ignored by ccsxp; profile applies to native 'codex' only
```

### cmd.exe

`ccsx auth use` emits `set FOO=bar` syntax for cmd.exe. Native `eval` is not available
in legacy cmd — use PowerShell (`Invoke-Expression`) instead.

### Backup files from `--force`

When re-importing with `--force`, the existing `auth.json` is backed up as
`auth.json.bak-<timestamp>` in the profile directory. These accumulate over time; remove
them manually when no longer needed.
