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

After installation, CCS reads the app version directly from the bundle's `Info.plist` and pins it to `~/.ccs/bar/.version`. It then performs a reachability check against the bar API (`GET /api/bar/summary`). A 404 response means the running CCS server predates CCS Bar support — update CCS to a version that includes CCS Bar, then restart `ccs bar`.

### Gatekeeper note

The v1 builds use ad-hoc signing, so the first launch may be blocked by Gatekeeper. Either right-click the app and choose Open, or clear the quarantine attribute:

```bash
xattr -dr com.apple.quarantine "$HOME/Applications/CCS Bar.app"
```

## Launch

```bash
ccs bar          # alias: ccs bar launch
```

This makes sure the web-server is up, writes the discovery file `~/.ccs/bar.json`, and opens the app. The discovery file looks like this:

```json
{ "baseUrl": "http://127.0.0.1:3000", "port": 3000, "authMode": "loopback" }
```

The Swift app reads `~/.ccs/bar.json` to find the server.

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
- Server failed to start: usually a port conflict. Free the port or re-run `ccs bar` to pick a fresh one.
- App won't open (Gatekeeper): right-click and Open, or clear quarantine with the `xattr` command above.
- Blank app: the web-server is not running. Re-run `ccs bar` and confirm `~/.ccs/bar.json` exists.
- Quota not updating: re-open the menu to force a refresh, or confirm the server is still reachable on loopback.

## Development

The source lives in `macos-bar/`. Contributors can build and run the logic checks with a Swift 5.9+ toolchain (CommandLineTools is enough, full Xcode not required):

```bash
swift build                 # build all targets, including the app
swift run ccs-bar-check     # run the logic tests
```
