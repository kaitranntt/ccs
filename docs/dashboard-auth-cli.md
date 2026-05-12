# Dashboard Authentication CLI

Last Updated: 2026-05-05

CLI commands for managing CCS dashboard authentication.

## Overview

The CCS dashboard (`ccs config`) can be protected with username/password authentication. This is useful whenever the dashboard is reachable from another device, such as when you explicitly bind it beyond loopback with `ccs config --host 0.0.0.0`.

Authentication is **disabled by default** for backward compatibility, while `ccs config` binds to `localhost` by default. Use the CLI to configure and enable auth before exposing the dashboard to other devices.

CCS does **not** ship a default dashboard username or password. When someone opens the dashboard from a non-loopback/IP address before auth is enabled, the UI now shows a setup state instead of an ambiguous login form. The host owner must run `ccs config auth setup`, or the user should switch back to the localhost URL if they are on the same machine.

Docker note: the integrated `ccs docker` stack stores its config inside the running container volume, not in the outer shell's `~/.ccs`. For Docker deployments, run auth setup inside the container:

```bash
docker exec -it ccs-cliproxy ccs config auth setup
```

When auth stays disabled, CCS now applies a localhost-only fallback on sensitive management endpoints. Remote devices can still open the dashboard UI when you intentionally bind it beyond loopback, but write-capable routes such as AI Provider management and CLIProxy auth/status helpers reject non-loopback requests until you enable dashboard auth.

## Account Context Modes (Related Feature)

Dashboard auth and account context metadata are separate:

- `dashboard_auth`: protects dashboard access with username/password
- `accounts.<name>.context_mode/context_group`: controls isolated vs shared account context
- `accounts.<name>.shared_resource_mode`: controls plugins/commands/skills/agents/settings.json sharing

Account context is isolation-first. The recommended two-account route is:

```bash
ccs auth create work
ccs auth create personal
ccs work
ccs personal
```

Only enable history sync when both accounts should share local continuity while tokens stay separate:

| Mode | Default | Requirement |
|------|---------|-------------|
| `isolated` | Yes | No `context_group` required |
| `shared` | No (opt-in) | Valid non-empty `context_group` |

Shared continuity depth:

- `standard` (default): shares project workspace context only
- `deeper` (advanced opt-in): also syncs `session-env`, `file-history`, `shell-snapshots`, `todos`

`ccs auth show <profile>` reports credential isolation, shared resource mode, settings sync state, history lane, and whether plain `ccs` currently uses the same resume lane.

Non-bare account profiles share Claude-local resources with native Claude:

```text
~/.ccs/instances/<profile>/settings.json -> ~/.ccs/shared/settings.json -> ~/.claude/settings.json
```

This keeps ordinary Claude settings, plugins, commands, skills, and agents in sync without copying account tokens. Existing accounts can opt out or back in:

```bash
ccs auth resources work --mode profile-local
ccs auth resources work --mode shared
```

Local history is separate: if users want future plain `ccs` and `ccs ck` sessions to resume from the same account lane, run `ccs auth default ck` after backing up the current native lane with `ccs auth backup default`.

`context_group` normalization and validation:

- trim + lowercase + collapse internal whitespace to `-`
- allowed characters: lowercase letters, numbers, `_`, `-`
- must start with a letter
- max length: 64
- shared mode requires non-empty value after normalization
- `continuity_mode` is only valid when mode is `shared`

`PUT /api/config` behavior for account context:

- rejects invalid unified payloads
- rejects explicit `context_mode: shared` with invalid/empty `context_group`
- rejects invalid `continuity_mode` values
- normalizes valid shared `context_group` before save
- defaults missing shared `continuity_mode` to `standard`
- rejects `context_group` when mode is not `shared`
- rejects `continuity_mode` when mode is not `shared`

Dashboard accounts context editing:

- `PUT /api/accounts/:name/context` updates context mode/group/continuity for existing auth accounts
- rejects CLIProxy OAuth account keys for this route
- applies normalization/validation rules above

Shared resource editing:

- `PUT /api/accounts/:name/shared-resources` updates `shared_resource_mode` for existing auth accounts
- accepts only `shared` or `profile-local`
- rejects CLIProxy OAuth account keys for this route
- reconciles the account instance after metadata is updated
- Dashboard -> Accounts exposes this as a separate Resources action so it is not confused with History Sync.
- Dashboard -> Shared Resources shows the shared hub inventory for commands, skills, agents, plugins, and `settings.json`.
- The Plugins tab is registry-oriented: installed plugin entries come from `installed_plugins.json`, while internal cache/data/marketplace folders stay hidden unless a real plugin entry exists.
- Shared `settings.json` is read-only in the Shared Resources page and still edited through the settings surfaces that own those values.

## Commands

### `ccs config auth setup`

Interactive wizard to configure dashboard login.

```bash
$ ccs config auth setup

╭─────────────────────────────────╮
│  Dashboard Auth Setup           │
╰─────────────────────────────────╯

[i] Configure username and password for dashboard access.
    Password will be hashed with bcrypt before storage.

Username
Enter username: admin

Password
    Minimum 8 characters
Enter password: ********
Confirm password: ********

[i] Hashing password...

[OK] Dashboard authentication configured

[i] Settings saved to ~/.ccs/config.yaml
[i] Username: admin
[i] Session timeout: 24 hours

    Start dashboard: ccs config
    Show status: ccs config auth show
    Disable auth: ccs config auth disable
```

### `ccs config auth show`

Display current authentication status.

```bash
$ ccs config auth show

╭─────────────────────────────────╮
│  Dashboard Auth Status          │
╰─────────────────────────────────╯

Configuration
[OK] Authentication: Enabled
[OK] Username: admin
[i] Session timeout: 24 hours

Commands
  ccs config auth setup     Configure authentication
  ccs config auth disable   Disable authentication
  ccs config                Open dashboard
```

### `ccs config auth disable`

Disable dashboard authentication with confirmation.

```bash
$ ccs config auth disable

╭─────────────────────────────────╮
│  Disable Dashboard Auth         │
╰─────────────────────────────────╯

[!] This will disable login protection for the dashboard.
[i] Anyone with network access will be able to view the dashboard.

Disable authentication? [y/N]: y

[OK] Dashboard authentication disabled

[i] Credentials preserved - re-enable with: ccs config auth setup
```

### `ccs config auth --help`

Display usage information.

## Environment Variables

Environment variables override `config.yaml` values:

| Variable | Description |
|----------|-------------|
| `CCS_DASHBOARD_AUTH_ENABLED` | Enable/disable auth (`true`/`false`) |
| `CCS_DASHBOARD_USERNAME` | Username |
| `CCS_DASHBOARD_PASSWORD_HASH` | Bcrypt password hash |

### Generating a Password Hash

Use bcrypt to generate a hash:

```bash
# Using Node.js
node -e "console.log(require('bcrypt').hashSync('your-password', 10))"

# Using npx
npx bcrypt-cli hash "your-password"
```

## Configuration

Settings are stored in `~/.ccs/config.yaml`:

```yaml
# Dashboard Auth: Optional login protection for CCS dashboard
# Generate password hash: npx bcrypt-cli hash "your-password"
# ENV override: CCS_DASHBOARD_AUTH_ENABLED, CCS_DASHBOARD_USERNAME, CCS_DASHBOARD_PASSWORD_HASH
dashboard_auth:
  enabled: true
  username: "admin"
  password_hash: "$2b$10$..."
  session_timeout_hours: 24
```

## Security Notes

1. **Bcrypt hashing**: Passwords are hashed with bcrypt (10 rounds) before storage
2. **Session cookies**: Sessions use HTTP-only cookies (not accessible via JavaScript)
3. **Rate limiting**: Login attempts are rate-limited (5 per 15 minutes)
4. **Fail-closed remote writes**: When auth is disabled, sensitive management routes allow localhost only
5. **File permissions**: Config file is created with 0o600 permissions

## Troubleshooting

### "Authentication not configured"

Run `ccs config auth setup` to configure credentials.

If you are using the integrated Docker stack, run that command inside `ccs-cliproxy`. Running it on the outer host shell updates a different config directory and will not unlock the running dashboard.

### Forgot password

Run `ccs config auth setup` again to set a new password.

### ENV override not working

Ensure the variable is exported:

```bash
export CCS_DASHBOARD_AUTH_ENABLED=true
export CCS_DASHBOARD_USERNAME=admin
export CCS_DASHBOARD_PASSWORD_HASH='$2b$10$...'
```

### Session expired immediately

Check `session_timeout_hours` in config. Default is 24 hours.

### "Invalid ... context_group ..."

This error comes from `PUT /api/config` when an account explicitly sets shared mode with an invalid group. Use a canonical group value (for example: `team-alpha`).

## See Also

- [Dashboard Auth Feature](https://ccs.kaitran.ca/features/dashboard-auth) - Full documentation
- [Config Schema](https://ccs.kaitran.ca/reference/config-schema) - All config options
