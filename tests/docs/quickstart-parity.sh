#!/usr/bin/env bash
# quickstart-parity.sh
# Assert that README.md and docker/README.md both contain the canonical quickstart
# snippet verbatim (anchored by marker comments).
# Usage: bash tests/docs/quickstart-parity.sh  (from repo root)
set -euo pipefail

SNIPPET=$(awk '/<!-- quickstart-snippet-start -->/,/<!-- quickstart-snippet-end -->/' docs/quickstart-snippet.md)

fail=0
for f in README.md docker/README.md; do
  file_block=$(awk '/<!-- quickstart-snippet-start -->/,/<!-- quickstart-snippet-end -->/' "$f")
  if ! diff -q <(printf '%s' "$SNIPPET") <(printf '%s' "$file_block") >/dev/null 2>&1; then
    echo "[X] $f quickstart snippet drift detected" >&2
    echo "--- canonical (docs/quickstart-snippet.md) ---" >&2
    printf '%s\n' "$SNIPPET" >&2
    echo "--- found in $f ---" >&2
    printf '%s\n' "$file_block" >&2
    fail=1
  else
    echo "[OK] $f snippet matches canonical"
  fi
done

exit "$fail"
