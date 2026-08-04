#!/usr/bin/env bash
# Live local-proxy e2e for the OpenCode Zen/Go adapter (t_2be8f081).
# Starts the CCS OpenAI-compat proxy daemon against opencode.ai zen/go/v1 with
# a real key. The daemon's local surface is Anthropic-shaped (/v1/messages +
# /v1/models); the OpenAI-compatible upstream contract is exercised through
# /v1/messages with chat-completions-family models (deepseek-v4-flash), which
# the proxy translates to <base>/chat/completions with Bearer auth, and with
# Anthropic-family models (qwen3.7-max), which pass through to
# <base>/messages with x-api-key. Both non-streaming and streaming/SSE.
set -uo pipefail

PORT="${1:-3999}"
BASE_URL="${OPENCODE_BASE_URL:-https://opencode.ai/zen/go/v1}"
API_KEY="${OPENCODE_API_KEY:?set OPENCODE_API_KEY to the dashboard key}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SMOKE_DIR="$(mktemp -d)"
DAEMON_PID=""
LOCAL_TOKEN="local-test-token"

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
{"env":{"ANTHROPIC_BASE_URL":"${BASE_URL}","ANTHROPIC_AUTH_TOKEN":"${API_KEY}","ANTHROPIC_MODEL":"deepseek-v4-flash","CCS_DROID_PROVIDER":"generic-chat-completion-api"}}
EOF
cat > "$SMOKE_DIR/.ccs/config.json" <<EOF
{"profiles":{"oc":"${SMOKE_DIR}/.ccs/oc.settings.json"},"proxy":{"routing":{}}}
EOF

CCS_HOME="$SMOKE_DIR" bun "$REPO_ROOT/src/proxy/proxy-daemon-entry.ts" \
  --port "$PORT" --host 127.0.0.1 --profile oc \
  --settings-path "$SMOKE_DIR/.ccs/oc.settings.json" --auth-token "$LOCAL_TOKEN" >"$SMOKE_DIR/daemon.log" 2>&1 &
DAEMON_PID=$!

for _ in $(seq 1 50); do
  if curl -s -m 2 "http://127.0.0.1:${PORT}/v1/models" -o /dev/null; then
    break
  fi
  sleep 0.2
done

pass=0; fail=0
check() { # label expected_code actual_code
  if [ "$2" = "$3" ]; then
    echo "[OK] $1 (HTTP $3)"
    pass=$((pass+1))
  else
    echo "[X] $1: expected HTTP $2, got $3"
    fail=$((fail+1))
  fi
}

msg_probe() { # label model extra_body
  local label="$1" model="$2" extra="$3"
  curl -s -m 180 -X POST "http://127.0.0.1:${PORT}/v1/messages" \
    -H "x-api-key: ${LOCAL_TOKEN}" -H "anthropic-version: 2023-06-01" -H "content-type: application/json" \
    -d "{\"model\":\"${model}\",\"max_tokens\":96,\"messages\":[{\"role\":\"user\",\"content\":\"Reply with exactly: pong\"}]${extra}}"
}

echo "== 1. Anthropic protocol (Claude Code /v1/messages, qwen3.7-max) — non-streaming =="
body=$(msg_probe "qwen3.7-max non-stream" qwen3.7-max "")
code=$(echo "$body" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('type',''))" 2>/dev/null || echo "non-json")
if [ "$code" = "message" ]; then
  echo "[OK] claude-code /v1/messages qwen3.7-max non-stream (Anthropic message type)"
  pass=$((pass+1))
else
  echo "[X] expected Anthropic message type, got: $(echo "$body" | head -c 300)"
  fail=$((fail+1))
fi

echo "== 2. Anthropic protocol — streaming SSE (qwen3.7-max) =="
body=$(curl -s -m 180 -N -X POST "http://127.0.0.1:${PORT}/v1/messages" \
  -H "x-api-key: ${LOCAL_TOKEN}" -H "anthropic-version: 2023-06-01" -H "content-type: application/json" \
  -d '{"model":"qwen3.7-max","max_tokens":96,"stream":true,"messages":[{"role":"user","content":"Count from 1 to 3."}]}')
events=$(echo "$body" | grep -c '^event:')
echo "  SSE events received: $events"
[ "$events" -ge 3 ] && { echo "[OK] qwen3.7-max streaming SSE"; pass=$((pass+1)); } || { echo "[X] too few SSE events"; fail=$((fail+1)); }
echo "$body" | grep -q 'message_stop' && { echo "[OK] message_stop event present"; pass=$((pass+1)); } || { echo "[X] no message_stop"; fail=$((fail+1)); }

echo "== 3. OpenAI protocol (deepseek-v4-flash via /v1/messages → /chat/completions) — non-streaming =="
body=$(msg_probe "deepseek non-stream" deepseek-v4-flash "")
if echo "$body" | grep -q '"type":"message"'; then
  echo "[OK] deepseek-v4-flash non-stream (translated to chat/completions, Anthropic-shaped reply)"
  pass=$((pass+1))
else
  echo "[X] expected Anthropic-shaped reply, got: $(echo "$body" | head -c 300)"
  fail=$((fail+1))
fi

echo "== 4. OpenAI protocol — streaming SSE (deepseek-v4-flash) =="
body=$(curl -s -m 180 -N -X POST "http://127.0.0.1:${PORT}/v1/messages" \
  -H "x-api-key: ${LOCAL_TOKEN}" -H "anthropic-version: 2023-06-01" -H "content-type: application/json" \
  -d '{"model":"deepseek-v4-flash","max_tokens":96,"stream":true,"messages":[{"role":"user","content":"Count from 1 to 3."}]}')
events=$(echo "$body" | grep -c '^event:')
echo "  SSE events received: $events"
[ "$events" -ge 3 ] && { echo "[OK] deepseek-v4-flash streaming SSE"; pass=$((pass+1)); } || { echo "[X] too few SSE events"; fail=$((fail+1)); }
echo "$body" | grep -q 'message_stop' && { echo "[OK] message_stop present"; pass=$((pass+1)); } || { echo "[X] no message_stop"; fail=$((fail+1)); }

echo "== 5. Responses-protocol model rejected locally (gpt-5.5) =="
code=$(curl -s -m 30 -o /dev/null -w "%{http_code}" -X POST "http://127.0.0.1:${PORT}/v1/messages" \
  -H "x-api-key: ${LOCAL_TOKEN}" -H "anthropic-version: 2023-06-01" -H "content-type: application/json" \
  -d '{"model":"gpt-5.5","max_tokens":16,"messages":[{"role":"user","content":"hi"}]}')
check "gpt-5.5 local 400, no dispatch" 400 "$code"

echo "== 6. /v1/messages claude-sonnet-4-6 (go tier has no claude-* models; expect upstream error, not local 400) =="
resp=$(curl -s -m 60 -w '\n%{http_code}' -X POST "http://127.0.0.1:${PORT}/v1/messages" \
  -H "x-api-key: ${LOCAL_TOKEN}" -H "anthropic-version: 2023-06-01" -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4-6","max_tokens":16,"messages":[{"role":"user","content":"hi"}]}')
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | head -n -1)
echo "  status: $code, body: $(echo "$body" | head -c 220)"
if [ "$code" != "400" ] || echo "$body" | grep -q 'invalid_request_error'; then
  echo "[OK] claude-sonnet-4-6 did NOT short-circuit locally (routed to /messages, upstream answered)"
  pass=$((pass+1))
else
  echo "[X] claude-sonnet-4-6 rejected locally (should have been routed upstream)"
  fail=$((fail+1))
fi

echo
echo "RESULT: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
