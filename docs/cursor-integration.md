# Cursor IDE Integration

This guide covers the local Cursor integration in CCS, including CLI setup, daemon lifecycle, and dashboard controls.

## What It Provides

- OpenAI-compatible local endpoint powered by Cursor credentials.
- Anthropic-compatible local endpoint at `/v1/messages` for Claude-native clients.
- Cursor model list and chat completions via local daemon.
- Dedicated dashboard page: `ccs config` -> `Cursor IDE`.

## Prerequisites

- Cursor IDE installed and logged in.
- CCS installed and configured (`ccs config` works).
- For auto-detect auth on macOS/Linux: `sqlite3` available in PATH.

## CLI Workflow

### 1) Enable integration

```bash
ccs cursor enable
```

### 2) Import credentials

Auto-detect from Cursor local SQLite state:

```bash
ccs cursor auth
```

Manual fallback:

```bash
ccs cursor auth --manual --token <token> --machine-id <machine-id>
```

### 3) Start daemon

```bash
ccs cursor start
```

### 4) Verify status

```bash
ccs cursor status
```

Or use the bare command to see the same status view plus the local endpoint details
needed for OpenAI-compatible and Anthropic-compatible clients:

```bash
ccs cursor
```

### 5) Stop daemon

```bash
ccs cursor stop
```

## Runtime Defaults

- Default port: `20129`
- `ghost_mode`: enabled
- `auto_start`: disabled
- Model list resolution: authenticated live fetch when available, with cached/default fallback.
- Request model validation: if a requested model is not present in the available Cursor model catalog, daemon falls back to the resolved default model.
- Daemon API surface: `POST /v1/chat/completions`, `POST /v1/messages`, and `GET /v1/models`.

These values are managed in unified config and can be updated from CLI or dashboard.

## Dashboard Usage

Open dashboard:

```bash
ccs config
```

Then navigate to `Cursor IDE` in the sidebar.

Available controls:

- Integration toggle (`enabled`)
- Auth actions (auto-detect, manual import)
- Daemon actions (start/stop)
- Runtime config (port, auto-start, ghost mode)
- Models list with searchable combobox filtering for large catalogs
- Raw editor for `~/.ccs/cursor.settings.json`

## Raw Settings and Unified Config Sync

Raw settings are stored in:

`~/.ccs/cursor.settings.json`

When raw settings include a local `ANTHROPIC_BASE_URL` port override, CCS synchronizes that port back into unified config so CLI and dashboard remain consistent.

## Troubleshooting

### `Not authenticated` or `expired` in `ccs cursor status`

- Re-run `ccs cursor auth` (or manual auth command).

### Auto-detect fails

- Ensure Cursor is logged in.
- Confirm `sqlite3` is installed (macOS/Linux).
- Use manual auth import if needed.

### Daemon fails to start

- Check if port `20129` is in use.
- Change port in dashboard config tab, then retry `ccs cursor start`.
