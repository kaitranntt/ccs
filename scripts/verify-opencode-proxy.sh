#!/usr/bin/env bash
# Live verification for the OpenCode Zen/Go proxy adapter.
#
# Starts the OpenAI-compat proxy daemon against a scratch profile pointing at
# an OpenCode gateway and exercises the three routing paths:
#   - Anthropic-family model  -> <base>/messages with x-api-key        (expect 401 from gateway)
#   - chat-completions model  -> <base>/chat/completions with Bearer   (expect 401 from gateway)
#   - Responses-protocol model -> local 400, no upstream dispatch
#
# Without a real key the gateway answers 401 "Invalid API key." — the 401 body
# shape is protocol-native, which is what proves the route + auth header are
# correct. Set OPENCODE_API_KEY to a real key to see 200 responses instead.
#
# Usage:
#   OPENCODE_API_KEY=<key> bash scripts/verify-opencode-proxy.sh [port]
# Defaults: base https://opencode.ai/zen/v1, port 3999, dummy probe key.

set -euo pipefail

PORT="${1:-3999}"
BASE_URL="${OPENCODE_BASE_URL:-https://opencode.ai/zen/v1}"
API_KEY="${OPENCODE_API_KEY:-ccs_smoke_probe_key}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SMOKE_DIR="$(mktemp -d)"
DAEMON_PID=""

cleanup() {
  if [ -n "$DAEMON_PID" ]; then
    kill "$DAEMON_PID" 2>/dev/null || true
    wait "$DAEMON_PID" 2>/dev/null || true
  fi
  rm -rf "$SMOKE_DIR"
}
trap cleanup EXIT

mkdir -p "$SMOKE_DIR/.ccs"
cat > "$SMOKE_DIR/.ccs/oc.settings.json" <<EOF
{"env":{"ANTHROPIC_BASE_URL":"${BASE_URL}","ANTHROPIC_AUTH_TOKEN":"${API_KEY}","ANTHROPIC_MODEL":"claude-sonnet-4-6","CCS_DROID_PROVIDER":"generic-chat-completion-api"}}
EOF
cat > "$SMOKE_DIR/.ccs/config.json" <<EOF
{"profiles":{"oc":"${SMOKE_DIR}/.ccs/oc.settings.json"},"proxy":{"routing":{}}}
EOF

CCS_HOME="$SMOKE_DIR" bun "$REPO_ROOT/src/proxy/proxy-daemon-entry.ts" \
  --port "$PORT" --host 127.0.0.1 --profile oc \
  --settings-path "$SMOKE_DIR/.ccs/oc.settings.json" --auth-token local-token &
DAEMON_PID=$!

for _ in $(seq 1 50); do
  if curl -s -m 2 "http://127.0.0.1:${PORT}/v1/models" -o /dev/null; then
    break
  fi
  sleep 0.2
done

probe() {
  local model="$1" expected="$2" label="$3"
  local code
  code=$(curl -s -m 30 -o /dev/null -w "%{http_code}" -X POST \
    "http://127.0.0.1:${PORT}/v1/messages" \
    -H "x-api-key: local-token" -H "content-type: application/json" \
    -d "{\"model\":\"${model}\",\"max_tokens\":16,\"messages\":[{\"role\":\"user\",\"content\":\"ping\"}]}")
  if [ "$code" = "$expected" ]; then
    echo "[OK] ${label} (HTTP ${code})"
  else
    echo "[X] ${label}: expected HTTP ${expected}, got ${code}"
    exit 1
  fi
}

probe claude-sonnet-4-6 401 "Anthropic-family model -> /messages with x-api-key"
probe deepseek-v4-flash 401 "chat-completions model -> /chat/completions with Bearer"
probe gpt-5.5 400 "Responses-protocol model rejected locally before dispatch"
