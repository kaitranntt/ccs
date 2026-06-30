# CCS Bar (macOS)

Native SwiftUI menu bar app for CCS. A thin client of the CCS local web-server:
it glances per-account quota, cost and tier, and performs account control
(pause/resume, set default, solo, tier-lock) from the menu bar.

The app never talks to a provider directly. Every call goes to `localhost`, and
CCS performs any provider fetch server-side. Opening the menu fires a debounced
force-refresh so the glance reflects live data without blocking the UI.

## Layout

- `Sources/CCSBarCore` — pure Foundation logic (no SwiftUI): API client,
  discovery handshake, models, formatting, refresh debounce. Fully unit-tested.
- `Sources/CCSBarApp` — SwiftUI `MenuBarExtra` app: view-model + views.
- `Sources/CCSBarCheck` — runnable assert harness used in place of XCTest
  (XCTest ships with full Xcode; this builds on a CommandLineTools toolchain).

## Build and test

Requires a Swift 5.9+ toolchain (CommandLineTools is enough; full Xcode not
required for build/test).

```bash
swift build                 # build all targets, including the app
swift run ccs-bar-check     # run the logic tests (exits non-zero on failure)
```

## Discovery

The app reads `~/.ccs/bar.json` (written by `ccs bar launch`):

```json
{ "baseUrl": "http://127.0.0.1:3000", "port": 3000, "authMode": "loopback" }
```

v1 supports `authMode: "loopback"` only (dashboard auth disabled, localhost).

## Packaging

`Scripts/package_app.sh` assembles `CCS Bar.app` from a release build and signs
it. v1 uses ad-hoc signing (`CCS_BAR_SIGNING=adhoc`, the default); users open it
the first time via right-click then Open, or clear quarantine with
`xattr -dr com.apple.quarantine "/Applications/CCS Bar.app"`. Developer ID
signing + notarization (`CCS_BAR_SIGNING=developer-id`) is the public-launch
path and is not required for ad-hoc distribution.
