# Session Sharing Technical Analysis

Last Updated: 2026-05-05

## Summary

CCS supports practical cross-account continuity by sharing workspace context files between selected accounts, while keeping credentials isolated per account.

This is implemented as a context policy per account:

- `isolated` (default): account keeps its own workspace context
- `shared` + `standard` (default): account workspace context is linked to a shared context group
- `shared` + `deeper` (advanced opt-in): account also shares continuity artifacts

## Recommended Two-Account Route

Use `ccs auth` account profiles when you want two real Claude accounts and want to choose which one runs each session:

```bash
ccs auth create work
ccs auth create personal

ccs work
ccs personal
```

This keeps usage and credentials isolated. Each account owns its own Claude config directory, login state, and `.anthropic` credentials.

Basic Claude settings are shared for non-bare account profiles:

```text
~/.ccs/instances/<account>/settings.json
  -> ~/.ccs/shared/settings.json
  -> ~/.claude/settings.json
```

This is for ordinary Claude Code settings, hooks, commands, skills, agents, and plugins. It is not token sharing. `ccs auth show <account>` reports the current `Settings`, `History`, and `Plain ccs` lanes so users can see whether settings and resume history are aligned.

Only opt in to shared history when both accounts should see the same local continuity:

```bash
ccs auth create work2 --share-context --context-group daily --deeper-continuity
```

For existing accounts, use Dashboard -> Accounts -> Sync on both accounts, set both to `shared`, and use the same `History Sync Group`. Use `deeper` only when users expect stronger local handoff beyond project context.

## Why This Is Safe Enough

CCS only shares workspace context paths (project/session context files). It does **not** merge or copy authentication credentials between accounts.

Credential storage remains per account instance.

## Implementation Model

Account metadata is stored in `~/.ccs/config.yaml`:

```yaml
accounts:
  work:
    created: "2026-02-24T00:00:00.000Z"
    last_used: null
    context_mode: "shared"
    context_group: "team-alpha"
    continuity_mode: "deeper"
```

Rules:

- `context_mode` must be `isolated` or `shared`
- `context_group` is required when `context_mode=shared`
- `continuity_mode` is valid only when `context_mode=shared` (`standard` or `deeper`)
- group normalization: trim, lowercase, internal spaces -> `-`
- group must start with a letter and only include `[a-zA-Z0-9_-]`
- max length: `64`

Deeper continuity links these directories per context group:

- `session-env`
- `file-history`
- `shell-snapshots`
- `todos`

`.anthropic` and account credentials remain isolated.

## Cross-Profile Inheritance (API / CLIProxy / Copilot)

You can explicitly map non-account profiles (including `default`) to reuse continuity artifacts from an account profile:

```yaml
continuity:
  inherit_from_account:
    glm: pro
    gemini: pro
    copilot: pro
```

Behavior:

- Applies only when running Claude target (`ccs <profile>` or `--target claude`)
- Does not change provider credentials or API routing
- Reuses `CLAUDE_CONFIG_DIR` from mapped account profile after normal account context policy resolution
- Invalid/missing mapped accounts are skipped safely

### Resume Lane Note

Resume follows the active `CLAUDE_CONFIG_DIR`, not just the continuity group:

- plain `ccs -r` resumes the lane plain `ccs` is using right now
- `ccs <account> -r` resumes only that account lane
- those two commands can point at different continuity inventories

That means `shared + deeper` on an account does **not** automatically make old plain-`ccs` resume history appear inside `ccs <account> -r`.

If you want future plain `ccs` sessions to use an account lane, either:

```bash
ccs auth default work
```

or map the default profile explicitly:

```yaml
continuity:
  inherit_from_account:
    default: work
```

Example with an existing `ck` account:

```bash
ccs auth show ck
ccs auth backup default
ccs auth default ck
```

`ccs auth default ck` makes future plain `ccs` sessions use the `ck` account lane, so future `ccs` and `ccs ck` resume from the same local inventory. It does not automatically import old native `~/.claude/projects` history into `ck`; keep using `ccs -r` for the old native lane until you intentionally migrate that local history.

## User Workflows

### New account with shared context

```bash
ccs auth create work2 --share-context
ccs auth create backup --share-context --context-group sprint-a
ccs auth create backup2 --share-context --context-group sprint-a --deeper-continuity
```

### Existing account

- Open `ccs config`
- Go to `Accounts`
- Click the pencil icon (`Edit History Sync`)
- Choose `isolated` or `shared`, set group, and (optionally) choose deeper continuity

No account recreation required for this workflow.

### Backup Before Changing Sync

CCS can back up local continuity artifacts before you change settings:

```bash
ccs auth backup work
ccs auth backup default
```

- `ccs auth backup work` backs up the selected account lane
- `ccs auth backup default` backs up the lane plain `ccs` would use right now
- this is a local continuity backup, not a guaranteed export of all upstream Claude-hosted resume state

## Current Limitations

- Shared context is local filesystem sharing. It does not bypass remote provider permission models.
- Session continuity still depends on what the upstream tool/provider stores and allows.
- Context sharing should only be enabled for accounts you intentionally trust to share workspace history.

## Alternative: CLIProxy Claude Pool

For users who prefer lower manual account switching, use CLIProxy Claude pool instead:

- Authenticate pool accounts via `ccs cliproxy auth claude`
- Manage account pool behavior in `ccs config` -> `CLIProxy Plus`

## Validation Checklist

- Confirm account row shows `shared (<group>)` in Dashboard Accounts table
- Switch between accounts in the same group and verify workspace continuity
- Run `ccs doctor` if symlink/context health looks inconsistent
