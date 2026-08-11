#!/usr/bin/env bash

set -Eeuo pipefail

container_name="${CCS_CLIPROXY_CONTAINER:-ccs-cliproxy}"
lock_file="${CCS_CLIPROXY_LOCK_FILE:-/run/lock/ccs-cliproxy-maintenance.lock}"
log_file="${CCS_CLIPROXY_UPDATE_LOG:-/var/log/ccs-cliproxy-update.log}"

log() {
  printf '[%s] %s\n' "$(date -Is)" "$*" | tee -a "$log_file"
}

exec 9>"$lock_file"
if ! flock -n 9; then
  log 'Another CLIProxy maintenance operation is active; skipping update check'
  exit 0
fi

if ! docker inspect "$container_name" >/dev/null 2>&1; then
  log "Container $container_name is missing; reconciliation must restore it before updating"
  exit 1
fi

if [ "$(docker inspect --format '{{.State.Running}}' "$container_name")" != 'true' ]; then
  log "Container $container_name is not running; reconciliation must restore it before updating"
  exit 1
fi

status_output="$(docker exec "$container_name" ccs cliproxy --version --backend plus 2>&1)" || {
  log "Unable to inspect the installed CLIProxy version: $status_output"
  exit 1
}

if ! grep -qi 'update available' <<<"$status_output"; then
  exit 0
fi

log 'CLIProxy Plus update available; staging verified replacement while the current proxy stays online'

if ! docker exec -i "$container_name" sh -s <<'CONTAINER_UPDATE'
set -eu

live_dir='/root/.ccs/cliproxy/bin/plus'
live_binary="$live_dir/cli-proxy-api-plus"
live_version="$live_dir/.version"
stage_root="$(mktemp -d /root/.ccs/cliproxy/.host-update.XXXXXX)"
stage_ccs_dir="$stage_root/ccs"
stage_dir="$stage_ccs_dir/cliproxy/bin/plus"
stage_binary="$stage_dir/cli-proxy-api-plus"
stage_version="$stage_dir/.version"
backup_binary="$stage_root/previous-binary"
backup_version="$stage_root/previous-version"
swap_started=0

supervisorctl_cmd() {
  supervisorctl -c /etc/supervisord.conf "$@"
}

cleanup() {
  rm -rf -- "$stage_root"
}

wait_for_proxy() {
  attempts=0
  while [ "$attempts" -lt 30 ]; do
    if curl -fsS --max-time 2 http://127.0.0.1:8317/ >/dev/null; then
      return 0
    fi
    attempts=$((attempts + 1))
    sleep 2
  done
  return 1
}

rollback() {
  supervisorctl_cmd stop cliproxy >/dev/null 2>&1 || true
  if [ -f "$backup_binary" ]; then
    install -m 0755 "$backup_binary" "$live_binary.rollback"
    mv -f "$live_binary.rollback" "$live_binary"
  fi
  if [ -f "$backup_version" ]; then
    install -m 0644 "$backup_version" "$live_version.rollback"
    mv -f "$live_version.rollback" "$live_version"
  fi
  supervisorctl_cmd start cliproxy >/dev/null
  wait_for_proxy
}

on_exit() {
  rc=$?
  trap - EXIT INT TERM HUP
  if [ "$rc" -ne 0 ] && [ "$swap_started" -eq 1 ]; then
    rollback || true
  fi
  cleanup
  exit "$rc"
}

trap on_exit EXIT INT TERM HUP

mkdir -p "$stage_ccs_dir"
CCS_DIR="$stage_ccs_dir" ccs cliproxy --latest --backend plus
test -x "$stage_binary"
test -s "$stage_version"
"$stage_binary" --version >/dev/null

cp -p "$live_binary" "$backup_binary"
cp -p "$live_version" "$backup_version"

supervisorctl_cmd stop cliproxy >/dev/null
swap_started=1
mv -f "$stage_binary" "$live_binary"
mv -f "$stage_version" "$live_version"
chmod 0755 "$live_binary"
supervisorctl_cmd start cliproxy >/dev/null
wait_for_proxy
swap_started=0
CONTAINER_UPDATE
then
  log 'CLIProxy Plus update failed; previous binary was restored and restarted'
  exit 1
fi

installed_output="$(docker exec "$container_name" ccs cliproxy --version --backend plus 2>&1)"
log "CLIProxy Plus update completed and passed health verification: $(grep -m1 'Version:' <<<"$installed_output" | xargs)"
