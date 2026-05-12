# Browser Automation

Last Updated: 2026-05-11

CCS provides browser automation through two separate runtime paths:

- **Claude Browser Attach**: reuses a running Chrome/Chromium session through the CCS-managed local `ccs-browser` MCP runtime
- **Codex Browser Tools**: injects Playwright MCP tooling into Codex-target launches

These are related, but they are not the same implementation and they do not promise a shared browser session.
On new installs, and on upgrades that do not already have explicit browser settings, both lanes
start **disabled** and **manual** so browser tooling is not auto-exposed until you opt in.

## How Browser Automation Works

### Claude Browser Attach

Claude-target CCS launches can provision a managed local MCP server named `ccs-browser`.
That path is designed for workflows where you want Claude to interact with a browser session
that already has useful authenticated state.

Claude Browser Attach requires a browser launched in attach mode with remote debugging
enabled. A recent Chrome update alone is not sufficient.

### Codex Browser Tools

Codex-target CCS launches use a separate managed path: CCS injects Playwright MCP overrides
for the `ccs_browser` runtime config entry.

This is configured from the same Browser settings surface, but it is distinct from Claude
Browser Attach.

## Configuration

### Via Dashboard

Open `ccs config` -> `Settings` -> `Browser`.

The Browser screen exposes two sections:

- **Claude Browser Attach**
  - enable/disable the Claude attach lane
  - choose the Chrome user-data directory
  - set the expected DevTools port
  - review readiness and next-step guidance
  - copy a generated browser launch command
- **Codex Browser Tools**
  - enable/disable CCS-managed browser tooling for Codex-target launches
  - review whether the detected Codex build supports managed browser overrides

Browser policy controls are CLI-first in this release. The dashboard remains the shared setup and
status surface, while `ccs browser policy` is the authoritative place to decide whether browser
tooling is auto-exposed or kept manual by default. Fresh installs, plus upgrades without an
existing browser section, surface both lanes as off/manual until you explicitly enable them.

### Via CLI

```bash
ccs help browser
ccs browser setup
ccs browser status
ccs browser doctor
ccs browser policy
ccs browser policy --all manual
```

Use `ccs browser setup` for the primary one-command setup path. Use `ccs browser status` for
the current state, `ccs browser doctor` for read-only troubleshooting guidance, and
`ccs browser policy` to control default browser exposure. If you only want browser access for one
run, keep policy manual and add `--browser` to that launch.

### Via Config File

Edit `~/.ccs/config.yaml`:

```yaml
browser:
  claude:
    enabled: false
    policy: manual
    user_data_dir: "~/.ccs/browser/chrome-user-data"
    devtools_port: 9222
  codex:
    enabled: false
    policy: manual
```

Notes:

- `claude.policy` and `codex.policy` accept `auto` or `manual`
- `claude.user_data_dir` is a **Chrome user-data directory**, not a display-name browser profile
- `claude.devtools_port` is the expected remote debugging port for attach mode
- `codex.enabled` controls whether CCS injects browser tooling into Codex-target launches
- New installs, plus upgrades without saved browser settings, default both lanes to `enabled: false` and `policy: manual`
- `manual` keeps the lane configured but hidden until a launch explicitly opts in with `--browser`

## Runtime Policy Controls

CCS now separates **lane enablement** from **default exposure policy**:

- `enabled: false`
  - the lane is off; this is the default for both lanes on new installs and upgrades without saved browser settings
- `enabled: true` + `policy: auto`
  - the lane is exposed automatically on matching launches
- `enabled: true` + `policy: manual`
  - the lane stays configured, but CCS keeps browser tooling hidden unless the current launch uses
    `--browser`

One-run launch overrides:

```bash
ccs browser policy --all manual
ccs glm --browser "inspect the page"
ccs glm --no-browser "summarize the docs"
ccs default --target codex --browser "use the browser tools for this run"
```

- `--browser` forces browser tooling on for the current launch when that lane is enabled
- `--no-browser` suppresses browser tooling for the current launch even when policy is `auto`

## Environment Variable Overrides

CCS still supports environment-variable overrides for backward compatibility.

| Variable | Description |
|----------|-------------|
| `CCS_BROWSER_USER_DATA_DIR` | Preferred override for Claude Browser Attach user-data dir |
| `CCS_BROWSER_PROFILE_DIR` | Legacy alias for the same attach directory |
| `CCS_BROWSER_DEVTOOLS_PORT` | Explicit DevTools port override |
| `CCS_BROWSER_UPLOAD_ROOTS` | Optional `path.delimiter`-separated allowlist for local files that browser upload tools may read |
| `CCS_BROWSER_DOWNLOAD_ROOTS` | Optional `path.delimiter`-separated allowlist for caller-provided browser download directories |

If an override is active, Browser status surfaces should report that the current session is being
managed externally by environment variables.

The saved browser policy still controls default exposure. Env overrides change the effective attach
path/port for the current shell; they do not bypass `policy: manual`.

Override precedence is:

1. `CCS_BROWSER_USER_DATA_DIR`
2. `CCS_BROWSER_PROFILE_DIR`
3. the persisted `browser.claude.user_data_dir` config value

Config-backed Browser Attach always passes an explicit DevTools port to the runtime, even when the
effective value is the default `9222`. Metadata-based port discovery is preserved only for the
legacy `CCS_BROWSER_PROFILE_DIR` flow when `CCS_BROWSER_DEVTOOLS_PORT` is not set.

### Browser File Transfer Safety

Claude Browser Attach file-transfer tools intentionally use a deny-by-default filesystem boundary:

- Downloads without an explicit `downloadPath` go to a CCS-created temporary session directory.
- A caller-provided `downloadPath` must be inside that temporary session directory or inside one of
  the directories listed in `CCS_BROWSER_DOWNLOAD_ROOTS`.
- Local upload and drag-and-drop files must be inside the temporary session download directory or
  inside one of the directories listed in `CCS_BROWSER_UPLOAD_ROOTS`.
- Hidden path segments and common secret locations/files, such as `.ssh`, `.aws`, `.ccs`,
  `.claude`, `.env`, and private-key filenames, are rejected even inside an allowed root.
- Each file-transfer call is limited to 10 files, and each local file must be at most 10 MiB.

Set upload/download roots only to purpose-built scratch directories. Do not point these variables at
your home directory, a source checkout with secrets, or a real cloud/tooling config directory.

## Managed Runtime Files

- `~/.claude.json` -> CCS manages `mcpServers.ccs-browser` for Claude Browser Attach
- `~/.ccs/mcp/ccs-browser-server.cjs` -> local Claude Browser Attach MCP runtime
- `Codex runtime config overrides` -> CCS manages the `ccs_browser` MCP entry for Codex-target launches

Do not treat the generic Codex MCP editor as the primary browser setup path. CCS-managed browser
entries should be configured from `Settings -> Browser`.

## Primary Setup Flow

The shortest supported setup path is:

```bash
ccs browser setup
```

That flow:

1. enables Claude Browser Attach in the saved CCS browser config
2. leaves launch exposure under the saved policy, so `policy: manual` still requires `--browser`
3. keeps the configured DevTools port normalized
4. creates the configured browser user-data directory if needed
5. prints the exact browser launch command for the current platform
6. re-checks readiness and reports the next step if Chrome still needs manual attention

## Launching Chrome For Claude Attach

Claude Browser Attach needs a browser launched with remote debugging.

Typical examples:

```bash
# macOS
open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir="$HOME/.ccs/browser/chrome-user-data"

# Linux
google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.ccs/browser/chrome-user-data"

# Windows
chrome.exe --remote-debugging-port=9222 --user-data-dir="%USERPROFILE%\\.ccs\\browser\\chrome-user-data"
```

Using a dedicated CCS browser data dir is recommended. It avoids profile-locking issues and keeps
automation state separate from your daily browser profile.

When Claude Browser Attach uses the recommended managed path (`~/.ccs/browser/chrome-user-data`),
CCS now creates that directory automatically the first time it needs it. After that bootstrap step,
the remaining requirement is a running Chrome session started with `--remote-debugging-port`.

## Troubleshooting

### Browser status says Claude Browser Attach is disabled

Run `ccs browser setup`, enable Claude Browser Attach in `Settings -> Browser`, or edit the
browser config block in `~/.ccs/config.yaml`.

### Browser status says the path is missing

The configured Chrome user-data directory does not exist yet.

1. Run `ccs browser setup`
2. If Chrome still is not ready, use the generated launch command
3. Rerun `ccs browser doctor`

If you are using the CCS-managed default path, this usually means the path could not be created
automatically and now needs manual attention.

### Browser status says no running browser session was found

CCS could not find usable DevTools attach metadata for the configured user-data directory.

1. Run `ccs browser setup`
2. If needed, make sure Chrome was started with `--remote-debugging-port=<port>`
3. Make sure it is using the same `user_data_dir` configured in CCS
4. Rerun `ccs browser doctor`

For the CCS-managed default path, this is the normal first-run state after CCS bootstraps the
directory for you.

### Browser status says the DevTools endpoint is unreachable

CCS found attach metadata, but the endpoint did not answer successfully.

1. Run `ccs browser setup`
2. If needed, restart the attach browser session
3. Confirm the expected port matches the real remote debugging port
4. Rerun `ccs browser status`

### Codex Browser Tools are unavailable

Codex browser tooling depends on a Codex build that supports `--config` overrides.

If CCS reports `unsupported_build`, upgrade Codex and rerun `ccs browser status`.

## Security Notes

- Browser automation may operate inside authenticated browser sessions
- Prefer a dedicated automation user-data dir instead of your everyday browser profile
- Do not commit browser paths, secrets, or generated session state to version control
- Treat `~/.ccs/config.yaml`, `~/.claude.json`, and the browser user-data directory as local machine state
