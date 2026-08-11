#!/usr/bin/env bash

set -Eeuo pipefail

container_name="${CCS_CLIPROXY_CONTAINER:-ccs-cliproxy}"
compose_dir="${CCS_CLIPROXY_COMPOSE_DIR:-/root/.ccs/docker}"
compose_file="${CCS_CLIPROXY_COMPOSE_FILE:-$compose_dir/docker-compose.integrated.yml}"
lock_file="${CCS_CLIPROXY_LOCK_FILE:-/run/lock/ccs-cliproxy-maintenance.lock}"
log_file="${CCS_CLIPROXY_RECONCILE_LOG:-/var/log/ccs-cliproxy-reconcile.log}"

log() {
  printf '[%s] %s\n' "$(date -Is)" "$*" | tee -a "$log_file"
}

exec 9>"$lock_file"
if ! flock -n 9; then
  exit 0
fi

probe() {
  docker exec "$container_name" sh -c \
    'curl -fsS --max-time 2 http://127.0.0.1:3000/ >/dev/null && curl -fsS --max-time 2 http://127.0.0.1:8317/ >/dev/null' \
    >/dev/null 2>&1
}

wait_for_health() {
  attempts=0
  while [ "$attempts" -lt 30 ]; do
    if probe; then
      return 0
    fi
    attempts=$((attempts + 1))
    sleep 2
  done
  return 1
}

compose_up() {
  cd "$compose_dir"
  docker compose -f "$compose_file" up -d --no-build || \
    docker compose -f "$compose_file" up -d --build
}

if ! docker inspect "$container_name" >/dev/null 2>&1; then
  log "Container $container_name is missing; recreating from $compose_file"
  compose_up
  wait_for_health
  log "Container $container_name was recreated and passed both health probes"
  exit 0
fi

if [ "$(docker inspect --format '{{.State.Running}}' "$container_name")" != 'true' ]; then
  log "Container $container_name is stopped; restoring the Compose service"
  compose_up
  wait_for_health
  log "Container $container_name is running and passed both health probes"
  exit 0
fi

if probe; then
  exit 0
fi

sleep 10
if probe; then
  exit 0
fi

log 'Dashboard or proxy failed two consecutive probes; restarting supervised processes'
docker exec "$container_name" supervisorctl -c /etc/supervisord.conf restart ccs-dashboard cliproxy
if wait_for_health; then
  log 'Supervised processes recovered and passed both health probes'
  exit 0
fi

log 'Supervisor recovery failed; restarting the container'
docker restart "$container_name" >/dev/null
wait_for_health
log "Container $container_name recovered and passed both health probes"
