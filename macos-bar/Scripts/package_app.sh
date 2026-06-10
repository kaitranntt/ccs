#!/usr/bin/env bash
# Assemble and sign "CCS Bar.app" from a release build.
#
# Signing mode (CCS_BAR_SIGNING):
#   adhoc        (default) ad-hoc sign with `codesign -s -`. Free, no Apple
#                Developer account. Users open via right-click > Open or clear
#                quarantine with `xattr -dr com.apple.quarantine`.
#   developer-id Sign with a Developer ID Application identity (set
#                CCS_BAR_SIGN_IDENTITY) for the notarized public-launch path.
#
# Usage:
#   ./Scripts/package_app.sh [version]
#   CCS_BAR_SIGNING=developer-id CCS_BAR_SIGN_IDENTITY="Developer ID Application: ..." ./Scripts/package_app.sh 0.1.0
set -euo pipefail

VERSION="${1:-0.0.0}"
SIGNING="${CCS_BAR_SIGNING:-adhoc}"
APP_NAME="CCS Bar"
EXEC_NAME="CCSBar"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
APP="$DIST/$APP_NAME.app"

echo "[i] Building release binary..."
( cd "$ROOT" && swift build -c release )
BIN="$ROOT/.build/release/$EXEC_NAME"
if [[ ! -x "$BIN" ]]; then
  echo "[X] Release binary not found at $BIN" >&2
  exit 1
fi

echo "[i] Assembling $APP_NAME.app (version $VERSION)..."
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/$EXEC_NAME"
sed "s/__VERSION__/$VERSION/g" "$ROOT/Resources/Info.plist" > "$APP/Contents/Info.plist"

# Bundle the CCS icon assets (menu-bar color/template + header logo) so
# Bundle.main can resolve them at runtime.
if [[ -d "$ROOT/Resources/Assets" ]]; then
  cp "$ROOT/Resources/Assets/"*.png "$APP/Contents/Resources/" 2>/dev/null || true
fi

echo "[i] Signing ($SIGNING)..."
case "$SIGNING" in
  adhoc)
    codesign --force --deep --sign - "$APP"
    ;;
  developer-id)
    : "${CCS_BAR_SIGN_IDENTITY:?Set CCS_BAR_SIGN_IDENTITY for developer-id signing}"
    codesign --force --deep --options runtime --timestamp \
      --sign "$CCS_BAR_SIGN_IDENTITY" "$APP"
    echo "[i] Signed with Developer ID. Notarize before public distribution:"
    echo "    xcrun notarytool submit <zip> --keychain-profile <profile> --wait"
    ;;
  *)
    echo "[X] Unknown CCS_BAR_SIGNING: $SIGNING (expected adhoc|developer-id)" >&2
    exit 1
    ;;
esac

ZIP="$DIST/CCS-Bar.app.zip"
echo "[i] Zipping -> $ZIP"
rm -f "$ZIP"
( cd "$DIST" && ditto -c -k --keepParent "$APP_NAME.app" "CCS-Bar.app.zip" )

echo "[OK] Packaged: $APP"
echo "[OK] Asset:    $ZIP"
if [[ "$SIGNING" == "adhoc" ]]; then
  echo "[!] Ad-hoc build: first launch needs right-click > Open, or"
  echo "    xattr -dr com.apple.quarantine \"/Applications/$APP_NAME.app\""
fi
echo "[i] To publish: gh release upload ccs-bar-latest \"$ZIP\" --clobber"
