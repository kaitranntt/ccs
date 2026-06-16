# CCS Bar — Native macOS Menu Bar App

CCS Bar is a native macOS menu-bar app that shows live subscription quota and usage at a glance for your Claude Code, Codex, and CLIProxy accounts, without opening the dashboard.

## What It Is

CCS Bar is a thin client of the CCS local web-server. It never talks to a provider directly: every call goes to `localhost`, and CCS performs any provider fetch server-side. Opening the menu fires a debounced force-refresh so the glance reflects live data without blocking the UI.

It is macOS only.

## What It Shows

- Per-account quota percent and reset countdown
- Account tier
- Today, 7-day, and 30-day cost
- A 30-day usage sparkline
- Account state (active, paused, default)
- Native subscription rows for Claude Code and Codex

## Requirements

- macOS
- CCS CLI installed and configured (`ccs config` works)
- The CCS web-server reachable on loopback. `ccs bar` (or `ccs bar launch`) starts it for you.

## Install

```bash
ccs bar install
```

This downloads `CCS-Bar.app.zip` from the floating `ccs-bar-latest` GitHub release and installs `CCS Bar.app` into `~/Applications`. Downloads are restricted to `github.com` and `objects.githubusercontent.com`, and extraction is guarded against zip-slip.

If `CCS Bar.app` is already installed, the command shows the current version and proceeds as a reinstall.

After installation, CCS reads the app version directly from the bundle's `Info.plist` and pins it to `~/.ccs/bar/.version`. It then performs a reachability check against the bar API (`GET /api/bar/summary`). A 404 response means the running CCS server predates CCS Bar support — update CCS to a version that includes CCS Bar, then restart `ccs bar`.

After a successful install, CCS leaves the macOS Gatekeeper quarantine marker in place so macOS can perform its normal first-launch verification. CCS then asks whether to launch CCS Bar immediately (default: yes). Pass `--launch` to skip the prompt and launch right away, or `--no-launch` to suppress the prompt entirely:

```bash
ccs bar install --launch     # install and launch immediately
ccs bar install --no-launch  # install, skip launch prompt
```

### Gatekeeper note

The install command does not automatically clear the macOS Gatekeeper quarantine attribute on the downloaded app. This preserves macOS first-launch verification for the floating release download.

If macOS blocks the app on first launch, make an explicit trust decision by right-clicking the app and choosing Open.

## Run

There are two ways to run CCS Bar, and both share one background server.

**Open the app.** Launch `CCS Bar` from Spotlight, Finder, or the Dock. The first time you open the menu, the app looks for a running CCS server and, if it does not find one, starts it in the background using the launch details recorded at install (`~/.ccs/bar/launch.json`). No terminal needed.

**Or use the CLI.**

```bash
ccs bar          # alias: ccs bar launch
```

`ccs bar` probes for a running server (ports 3000, 3001, 3002, 8000, 8080, with the previous `bar.json` port first). If one is live it is reused; otherwise `ccs bar` starts the server as a detached background process and returns your prompt right away, then opens the app. The server keeps running after the command exits, so closing the terminal does not take the bar offline.

### Server lifecycle

```bash
ccs bar serve    # run the server in the current terminal (advanced; ccs bar runs this detached for you)
ccs bar stop     # stop the background server
ccs bar status   # report whether the server is running
```

### Files under ~/.ccs

| File | Purpose |
| --- | --- |
| `~/.ccs/bar.json` | Discovery file the app reads to find the live server |
| `~/.ccs/bar/launch.json` | How to start the server (recorded at install) so the app can start it without a shell PATH |
| `~/.ccs/bar/server.pid` | PID of the background server, used by `ccs bar stop` and `ccs bar status` |
| `~/.ccs/bar/serve.log` | stdout and stderr of the background server |

`~/.ccs/bar.json` looks like this:

```json
{ "baseUrl": "http://127.0.0.1:3000", "port": 3000, "authMode": "loopback" }
```

The Swift app reads `~/.ccs/bar.json` to find the server, and falls back to probing the candidate ports if it is missing or stale.

## Loopback / Localhost Requirement

CCS Bar talks only to `http://127.0.0.1:<port>`. v1 supports `authMode: "loopback"` only, meaning dashboard auth disabled on localhost.

If you bind the dashboard beyond localhost (for example `--host` set to a non-loopback address) with dashboard auth disabled, the bar's read endpoints (`GET /api/bar/summary`, `GET /api/bar/analytics`) are refused for non-loopback callers, and the app cannot reach the server. Keep the dashboard on loopback for CCS Bar to work.

## Uninstall

```bash
ccs bar uninstall
```

This removes `~/Applications/CCS Bar.app` and the installed version pin. It is a no-op if the app is not present.

## Troubleshooting

- Install fails with "server predates CCS Bar" or bar API returns 404: the CCS server running does not yet include CCS Bar. Update CCS (`npm i -g ccs@latest` or equivalent), then restart `ccs bar`.
- Server failed to start: `ccs bar` first checks whether a CCS server is already running on the candidate ports (3000, 3001, 3002, 8000, 8080) and reuses it if found. A true failure here means a non-CCS process is occupying all candidate ports. Free one of those ports and re-run `ccs bar`. Check `~/.ccs/bar/serve.log` for the background server's output.
- App won't open (Gatekeeper): right-click the app and choose Open to make an explicit trust decision.
- Menu shows "CCS is not running": open the menu again to let the app start the server, or run `ccs bar status` to check and `ccs bar` to start it.
- Quota not updating: re-open the menu to force a refresh, or confirm the server is still reachable on loopback.

## Development

The source lives in `macos-bar/`. Contributors can build and run the logic checks with a Swift 5.9+ toolchain (CommandLineTools is enough, full Xcode not required):

```bash
swift build                 # build all targets, including the app
swift run ccs-bar-check     # run the logic tests
```
