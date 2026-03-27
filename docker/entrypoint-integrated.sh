#!/bin/sh
set -eu

LOG_DIR="/var/log/ccs"

mkdir -p /root/.ccs /root/.ccs/cliproxy "$LOG_DIR"
touch "$LOG_DIR/ccs-dashboard.log" "$LOG_DIR/cliproxy.log"

exec /usr/bin/supervisord -c /etc/supervisord.conf
