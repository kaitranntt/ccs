#!/usr/bin/env bash
set -euo pipefail

echo "[WARN] ghcr.io/kaitranntt/ccs-dashboard is deprecated. Migrate to ghcr.io/kaitranntt/ccs:latest. See https://github.com/kaitranntt/ccs/issues/1251" >&2

ccs_home_dir="${CCS_HOME_DIR:-/home/node/.ccs}"

mkdir -p "$ccs_home_dir"

# Fix volume permissions if running as root
if [ "$(id -u)" = "0" ]; then
  if ! chown -R node:node "$ccs_home_dir" 2>/dev/null; then
    echo "[!] Warning: Could not change ownership of $ccs_home_dir (read-only volume?)" >&2
  fi
fi

# Show usage if no command provided
if [ "$#" -eq 0 ]; then
  echo "[X] No command provided" >&2
  echo "" >&2
  echo "Usage: docker run ccs-dashboard <command>" >&2
  echo "" >&2
  echo "Examples:" >&2
  echo "  docker run ccs-dashboard node dist/ccs.js config" >&2
  echo "  docker run ccs-dashboard ccs --help" >&2
  echo "" >&2
  exit 1
fi

# Drop privileges from root to node user
if [ "$(id -u)" = "0" ]; then
  cmd="$(printf '%q ' "$@")"
  exec su -s /bin/bash node -c "exec ${cmd}"
fi

exec "$@"
