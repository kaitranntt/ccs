# OpenAI-Compatible Provider Routing

CCS can route Claude Code traffic through a local Anthropic-compatible proxy when
your API profile points at an OpenAI-compatible chat completions endpoint.

This is useful for providers such as:

- Hugging Face Inference Providers
- OpenRouter
- Ollama
- llama.cpp servers
- OpenAI-compatible self-hosted gateways

## Related Project: claude-code-router

[claude-code-router](https://github.com/musistudio/claude-code-router) is the
main external reference that informed this CCS work. Their Anthropic/OpenAI
transformer design helped shape the routing approach here.

When to use CCR:

- you want a standalone router without CCS profile integration
- you do not need CCS account/runtime management around the request flow

When to use CCS:

- you already use CCS API profiles or runtime bridges
- you want the proxy flow available through `ccs <profile>` and `ccs proxy ...`
- you want the routing behavior documented and tested inside the CCS workflow

## What CCS Does

When you launch a compatible settings profile with the Claude target, CCS now:

1. Starts a local proxy on `127.0.0.1` using the resolved local port for that profile
2. Accepts Anthropic `/v1/messages` traffic from Claude Code
3. Translates requests into OpenAI chat-completions format
4. Forwards them to your configured upstream provider
5. Translates streaming responses back into Anthropic SSE

You do not need to rewrite your profile by hand each time.

## Quick Start

Create or reuse an API profile that points at an OpenAI-compatible endpoint:

```bash
ccs api create --preset hf
```

Then you can use the profile directly:

```bash
ccs hf
```

CCS detects that the profile is OpenAI-compatible and auto-routes Claude Code
through the local proxy.

## Manual Proxy Lifecycle

If you want to manage the proxy explicitly:

```bash
ccs proxy start hf
eval "$(ccs proxy activate)"
ccs proxy status
ccs proxy stop
```

Useful variants:

```bash
ccs proxy start hf --host 127.0.0.1
ccs proxy start hf --port 3460
ccs proxy activate hf
ccs proxy activate --fish
ccs proxy status hf
ccs proxy stop hf
```

Port selection precedence is:

1. CLI `--port` for an exact one-off pin
2. `proxy.profile_ports[profile]` for an exact per-profile pin
3. `proxy.port` for a shared preferred starting port
4. adaptive per-profile fallback when nothing is pinned

Legacy shared `proxy.port: 3456` values are treated as unset so older configs
move onto the adaptive path instead of staying on the hot legacy default. If
you need an exact `3456` binding now, pin it via `--port` or `proxy.profile_ports`.

`ccs proxy activate` now prints the full local runtime contract:

- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_AUTH_TOKEN`
- `ANTHROPIC_MODEL` plus tier defaults when present
- `DISABLE_TELEMETRY`
- `DISABLE_COST_WARNINGS`
- `API_TIMEOUT_MS`
- `NO_PROXY`

## Multiple Active Proxy Profiles

CCS now stores OpenAI-compatible proxy state per profile instead of treating the
runtime as a singleton.

- Different compatible profiles can run at the same time on separate local ports
- `ccs proxy activate` without a profile stays convenient when only one proxy is
  running
- When multiple proxies are running, pass the profile explicitly to
  `activate`, `status`, or `stop`
- `status` and `activate` always reflect the actual running port instead of an
  assumed default

If you want to pin or guide ports explicitly, configure them in `~/.ccs/config.yaml`:

```yaml
proxy:
  port: 45000
  profile_ports:
    hf: 3460
    openai: 3461
```

## Request-Time Routing

The proxy is no longer limited to the startup profile's default model.

Supported request-time selectors:

- `profile:model`
  Example: `deepseek:deepseek-reasoner`
- `profile`
  Example: `openrouter`
- plain model ids
  Example: `deepseek-chat`

Plain model ids use exact string equality against the configured profile model
slots (`model`, `opusModel`, `sonnetModel`, `haikuModel`). CCS does not apply
fuzzy matching or prefix matching here. If no exact match is found, the request
stays on the active profile with the requested model id unchanged.

Routing behavior:

1. `profile:model` wins immediately.
2. Scenario routing may override the active profile when configured.
3. Plain model ids are matched against the configured OpenAI-compatible
   profiles before falling back to the active profile.

This means a Claude session launched through one compatible profile can still
request another compatible profile/model when the proxy can resolve it safely.

## Scenario Routing

Scenario routing is now supported through `proxy.routing` in your CCS config.

Example `~/.ccs/config.yaml`:

```yaml
proxy:
  routing:
    default: "deepseek:deepseek-chat"
    background: "ollama:qwen2.5-coder:0.5b"
    think: "deepseek:deepseek-reasoner"
    longContext: "openrouter:google/gemini-2.5-pro"
    longContextThreshold: 60000
    webSearch: "openrouter:perplexity/sonar-pro"
```

Current scenario detection:

- `background`: requested model contains `haiku`
- `think`: Anthropic `thinking` is enabled
- `longContext`: estimated request tokens exceed `longContextThreshold`
- `webSearch`: tool list includes `web_search`
- `default`: fallback selector when the above do not apply

Routing decisions are logged through CCS structured logs.

`longContextThreshold` uses an intentionally approximate token estimate based on
message characters, tool payload size, and a `chars / 4` heuristic. Tune the
threshold conservatively if your routing decision needs a sharper cutoff near
the boundary.

## How Profile Detection Works

CCS keeps these profiles in the normal API/settings-profile flow.

Anthropic-compatible endpoints such as:

- `https://api.anthropic.com`
- `https://api.z.ai/api/anthropic`
- `https://api.deepseek.com/anthropic`

continue to launch directly.

OpenAI-compatible endpoints such as:

- `https://router.huggingface.co/v1`
- `https://api.openai.com/v1`
- `http://localhost:11434`

are routed through the local proxy for Claude-target launches.

## Provider Setup

### DeepSeek

Use a settings profile whose env looks like:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.deepseek.com/v1",
    "ANTHROPIC_AUTH_TOKEN": "sk-...",
    "ANTHROPIC_MODEL": "deepseek-chat",
    "CCS_DROID_PROVIDER": "generic-chat-completion-api"
  }
}
```

Typical override target:

- `deepseek:deepseek-reasoner`

### OpenRouter

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://openrouter.ai/api/v1",
    "ANTHROPIC_AUTH_TOKEN": "sk-or-...",
    "ANTHROPIC_MODEL": "openai/gpt-4.1-mini",
    "CCS_DROID_PROVIDER": "generic-chat-completion-api"
  }
}
```

Useful when you want:

- model fan-out behind one provider profile
- long-context or web-search scenario targets

### Ollama / Local Gateways

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:11434",
    "ANTHROPIC_AUTH_TOKEN": "ollama",
    "ANTHROPIC_MODEL": "qwen3-coder",
    "CCS_DROID_PROVIDER": "generic-chat-completion-api"
  }
}
```

For self-signed HTTPS gateways, add `CCS_OPENAI_PROXY_INSECURE=1`.

### DashScope / Qwen Compatible Mode

DashScope's compatible endpoint works even when older settings files still
carry a stale Anthropic-style provider hint:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://dashscope-us.aliyuncs.com/compatible-mode/v1",
    "ANTHROPIC_AUTH_TOKEN": "sk-...",
    "ANTHROPIC_MODEL": "qwen3.6-plus",
    "CCS_DROID_PROVIDER": "anthropic"
  }
}
```

CCS now infers the OpenAI-compatible route from the base URL and does not let
that stale provider hint block proxy routing.

## Self-Signed TLS

If your upstream gateway uses a self-signed or privately issued certificate,
set this in the profile settings JSON:

```json
{
  "env": {
    "CCS_OPENAI_PROXY_INSECURE": "1"
  }
}
```

That flag is respected by both:

- `ccs <profile>` auto-routing
- `ccs proxy start <profile>`

## Supported Runtime Paths

- `ccs <profile>` with Claude target: auto-starts the local proxy when needed
- `ccs proxy start <profile>`: starts the proxy explicitly
- `GET /`: proxy info and bound profile details
- `GET /health`: proxy liveness check
- `GET /v1/models`: local view of the configured model mapping
- `POST /v1/messages`: Anthropic-compatible request entrypoint

## Troubleshooting

### Missing or invalid local proxy token

- Re-run `eval "$(ccs proxy activate)"`
- Check `ccs proxy status` and confirm the expected profile is running

### Self-signed or private CA upstream

- Add `CCS_OPENAI_PROXY_INSECURE=1` to the profile settings
- Restart the proxy after changing the setting

### Need to pin or verify the local port

- Check the active binding with `ccs proxy status hf`
- Pin a one-off port with `ccs proxy start hf --port 3460`
- Reserve a stable profile port with `proxy.profile_ports`
- Re-run `ccs proxy activate hf` after changing the port

### Provider returns `429` or empty upstream output

- CCS now preserves upstream rate-limit errors and retry headers
- Empty or malformed provider JSON is returned as Anthropic-style `api_error`

### Slow upstreams: `socket connection was closed unexpectedly`

- Long-running upstreams (self-hosted LLMs with queue/prefill phases) can stay
  silent for minutes before the first or next token. The proxy already allows up
  to 10 minutes per request; set `CCS_OPENAI_PROXY_REQUEST_TIMEOUT_MS` in the
  profile settings to raise or lower that ceiling.
- Restart the proxy after changing the setting.

### Requests route to the wrong model/profile

- Use an explicit selector such as `profile:model`
- Review `proxy.routing` if scenario routing is enabled
- Check CCS structured logs in `~/.ccs/logs/current.jsonl` for routing decisions

## Validation

The shipped coverage includes:

- unit tests for OpenAI-compatible profile detection
- unit tests for Anthropic -> OpenAI request translation
- unit tests for request-time profile/model routing and scenario routing
- unit tests for multi-line SSE parsing
- integration tests for `/v1/messages` request/response translation
- integration tests for rate limits, empty upstream responses, timeout handling,
  thinking/tool-call chunk streaming, and request-time routing
- integration tests for daemon lifecycle and `/health` / `/v1/models`
- e2e tests for `ccs proxy` lifecycle
- e2e tests for `ccs <profile>` auto-routing through a mock upstream

Focused verification command:

```bash
bun test tests/e2e/proxy-command.e2e.test.ts tests/integration/proxy/request-routing.test.ts --coverage
```

Pre-merge gate:

```bash
bun run validate
```
