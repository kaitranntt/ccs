# Browser Automation Developer Contract

User setup and troubleshooting live in the canonical
[Browser Automation guide](https://docs.ccs.kaitran.ca/features/workflow/browser-automation).
This local file retains security-sensitive runtime invariants that contributors
must preserve until the public guide covers them fully.

## Exposure And Runtime Ownership

- Claude Browser Attach and Codex Browser Tools are separate lanes; they do not
  promise a shared browser session.
- New installs and upgrades without saved browser settings default both lanes
  to `enabled: false` and `policy: manual`.
- `--browser` and `--no-browser` are one-run exposure overrides. They do not
  change saved policy.
- CCS owns `mcpServers.ccs-browser`, the
  `~/.ccs/mcp/ccs-browser-server.cjs` runtime, and Codex `ccs_browser`
  overrides. Generic MCP editors are not the primary setup surface.

## Attach Override Precedence

1. `CCS_BROWSER_USER_DATA_DIR`
2. legacy `CCS_BROWSER_PROFILE_DIR`
3. persisted `browser.claude.user_data_dir`

Config-backed attach always passes an explicit DevTools port, including the
default `9222`. Metadata-based port discovery exists only for the legacy
profile-dir override when `CCS_BROWSER_DEVTOOLS_PORT` is unset.

## Interception Safety

Request interception may continue or fail matched requests by default.
Synthetic fulfillment can serve caller-supplied content inside the target
origin, so it must stay hidden and blocked unless
`CCS_BROWSER_INTERCEPT_FULFILL_MODE=enabled` is explicitly set for a trusted
local test.

## Event Observation Safety

- `browser_wait_for_event` requires `urlIncludes` for network-request events.
- Download events require either `urlIncludes` or
  `suggestedFilenameIncludes`.
- Returned navigation, request, and download URLs must redact query strings,
  fragments, and path-scoped bearer values before reaching the MCP caller.

## File Transfer Safety

Browser file transfer is deny-by-default:

- implicit downloads use a CCS-created temporary session directory;
- explicit download paths must remain inside that session directory or a
  `CCS_BROWSER_DOWNLOAD_ROOTS` allowlisted root;
- uploads and drag-and-drop files must remain inside the session directory or a
  `CCS_BROWSER_UPLOAD_ROOTS` allowlisted root;
- hidden segments and common secret locations/files (`.ssh`, `.aws`, `.ccs`,
  `.claude`, `.env`, private keys) remain denied inside allowed roots;
- each call permits at most 10 files, each no larger than 10 MiB.

Allowlist only purpose-built scratch directories. Never allowlist a home
directory, source checkout containing secrets, or real tooling configuration
directory.
