# OpenCode Zen / Go — API Compatibility Spec (CCS CLIProxy integration)

Status: research output, verified against live endpoints 2026-08-04
Task: t_c7bed65c — handoff for implementers of Zen/Go support in CCS.

OpenCode Zen (`https://opencode.ai/zen`) and OpenCode Go (`https://opencode.ai/zen/go`)
are **multi-protocol AI gateways**. One API key works across four different
protocols; the protocol is chosen **per model family**, not per gateway. The
gateway mimics each upstream provider's native auth header and request shape, so
there is no single "OpenCode API" — there are four protocol shims under one
host with one billing key.

---

## 1. Base URLs and auth

| Gateway | Base URL | Auth mechanism |
| --- | --- | --- |
| Zen | `https://opencode.ai/zen/v1` | protocol-native header (see below) |
| Go  | `https://opencode.ai/zen/go/v1` | protocol-native header (see below) |

Key obtained at https://opencode.ai/auth. Same key works for Zen and Go.

Auth header is **per endpoint protocol** (verified live 2026-08-04 with dummy keys):

| Protocol / path family | Header | Notes |
| --- | --- | --- |
| OpenAI Chat Completions `POST /chat/completions` | `Authorization: Bearer <key>` | wrong header → 401 `Missing API key.` |
| OpenAI Responses `POST /responses` | `Authorization: Bearer <key>` | wrong header → 401 `Missing API key.` |
| Anthropic Messages `POST /messages` | `x-api-key: <key>` (+ `anthropic-version: 2023-06-01`) | Bearer → 401 `Missing API key.` |
| Google GenAI `POST /models/{model}:generateContent` | `x-goog-api-key: <key>` | Bearer → 401 `Missing API key.` |

Error bodies are protocol-native: `{"type":"error","error":{"type":"AuthError","message":"..."}}`
(anthropic shape) or OpenAI-style JSON.

## 2. Endpoint matrix (docs table, opencode.ai/docs/zen and /docs/go)

Zen:

| Model family (examples) | Path | Protocol | AI SDK |
| --- | --- | --- | --- |
| GPT 5.x / Codex family (`gpt-5.6-sol`, `gpt-5.5`, `gpt-5.1-codex`, …) | `/zen/v1/responses` | OpenAI Responses API | `@ai-sdk/openai` |
| Claude (`claude-fable-5`, `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5`), Qwen3.7/3.6/3.5 Plus/Max, MiniMax M3/M2.x | `/zen/v1/messages` | Anthropic Messages API | `@ai-sdk/anthropic` |
| Gemini (`gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3-flash`, `gemini-3.1-pro`) | `/zen/v1/models/{model}` | Google Generative Language API | `@ai-sdk/google` |
| Grok 4.5, DeepSeek V4 Pro/Flash, GLM 5.x, Kimi K2.x/K3, MiniMax (openai-routed), all `*-free` models | `/zen/v1/chat/completions` | OpenAI Chat Completions | `@ai-sdk/openai-compatible` |

Go (subscription, usage-limited): only two protocol families are exposed:

| Model family | Path | Protocol |
| --- | --- | --- |
| Grok 4.5, GLM 5.x, Kimi K2.x/K3, DeepSeek V4, MiMo, Hy3 | `/zen/go/v1/chat/completions` | OpenAI Chat Completions |
| MiniMax M3/M2.7/M2.5, Qwen3.7/3.6 Plus/Max | `/zen/go/v1/messages` | Anthropic Messages API |

Go has **no** `/responses` and no Gemini protocol family.

## 3. Request / response shapes

There is no OpenCode-specific schema. Requests and responses are byte-for-byte
the upstream protocols:

- Chat Completions: standard OpenAI `POST /chat/completions` — `{model, messages, stream?, tools?, …}`, response `choices[].message`, usage in `usage`.
- Responses: standard OpenAI `POST /responses` — `{model, input, stream?, tools?, …}`, response `output[]` with `response.completed` event carrying `usage` in streamed mode.
- Messages: standard Anthropic `POST /messages` — `{model, max_tokens, messages, system?, tools?, stream?, …}`, response `content[]` + `usage`. `anthropic-version` header required per Anthropic convention.
- Gemini: standard Google `generateContent` / `streamGenerateContent` — `{contents, systemInstruction?, generationConfig?, tools?}`.

**Model field handling:** the `model` field in any request body is the **bare
model ID** (`gpt-5.5`, `claude-sonnet-4-6`, `deepseek-v4-flash`, …). The
`opencode/…` / `opencode-go/…` prefixes seen in OpenCode config
(`opencode/gpt-5.5`) are OpenCode-internal provider prefixes only — never send
them in API requests.

## 4. Streaming / SSE

Streaming is native SSE of the protocol used (`stream: true`):

- Chat Completions: `text/event-stream`, `data: {…choices[0].delta…}` chunks, `data: [DONE]` terminator; usage via `stream_options.include_usage`.
- Responses: SSE events `response.created`, `response.output_item.added`, `response.content_part.delta`, `response.completed` (final usage), …
- Anthropic: SSE events `message_start`, `content_block_delta`, `message_delta`, `message_stop` (final usage in `message_delta`).
- Gemini: `streamGenerateContent` returns SSE chunks.

A proxy must forward the event stream untouched (same framing, same event
names) for the protocol family in use; do not normalize across families unless
the client explicitly requires a conversion layer.

## 5. Model discovery

- `GET {base}/models` — **public, no auth required**, OpenAI list shape:
  `{"object":"list","data":[{"id":"claude-fable-5","object":"model","created":<ts>,"owned_by":"opencode"}, …]}`.
  Verified live on both `/zen/v1/models` and `/zen/go/v1/models`.
- The list carries **no protocol metadata** — mapping model → protocol must come
  from the docs endpoint table or from Models.dev:
  - Zen: https://models.dev → provider `opencode`, base `https://opencode.ai/zen/v1`, 85 models
  - Go: https://models.dev → provider `opencode-go`, base `https://opencode.ai/zen/go/v1`, 24 models
- OpenCode's own client (packages/opencode/src/provider/provider.ts) resolves
  the per-model SDK from Models.dev data + AI SDK packages, then uses the SDK's
  native auth header — the same contract described here.

## 6. Compatibility caveats

1. **Gemini via Zen had a server-side 500 bug** (`Cannot read properties of undefined (reading 'promptTokenCount')`) affecting all `generateContent` calls, reported in anomalyco/opencode#8228 (Jan 2026), closed "not planned". Verify Gemini works with a real key before shipping; if still broken, exclude Gemini models from the catalog.
2. **Cross-protocol requests are undocumented.** Routing an Anthropic-shaped request to `/chat/completions` (or vice versa) is not a supported contract — some third-party proxies do body conversion (e.g. GOST example rewrites `/v1/messages` → `/zen/v1/chat/completions` with an `openai-converter`), but treat it as fragile, not a feature to depend on.
3. **Per-model routing is the hard part.** Neither the model list nor the gateway routes by prefix; the implementer must carry a model→protocol table (from the docs table + models.dev) and route the request to the right path + auth header.
4. **Go usage limits** (5h/$12, week/$30, month/$60) and Zen pay-as-you-go pricing apply per key; gateway returns provider-style errors when limits are hit. Free models (DeepSeek V4 Flash Free, MiMo-V2.5 Free, …) may use data for training — see privacy section of the docs.
5. **Anthropic-family models** (Claude, Qwen, MiniMax on `/messages`) need the `anthropic-version` header or the Anthropic SDK rejects them client-side.
6. Claude Sonnet 4.5 / Gemini 3.1 Pro / GPT 5.x / Grok 4.5 have tiered pricing above ~200–272K tokens; token counts come back in the protocol-native `usage` objects.

## 7. Requirements CCS must satisfy to proxy OpenCode

Current CCS surface (docs/openai-compatible-providers.md, src/cliproxy):
- `openai-compatibility` config entries: `name`, `base-url`, `headers` (custom map), `api-key-entries`, `models[{name, alias}]`. This covers **chat-completions-family** models directly:
  - provider `opencode` → `base-url: https://opencode.ai/zen/v1`, header `Authorization: Bearer <key>`
  - provider `opencode-go` → `base-url: https://opencode.ai/zen/go/v1`, header `Authorization: Bearer <key>`
- Anthropic-protocol models (Claude / Qwen / MiniMax) and Responses-protocol models (GPT) and Gemini **cannot** be reached through the existing openai-compat path — the gateway rejects them on the chat-completions route (undocumented cross-protocol; do not attempt body conversion).

So a complete integration requires, in order of value:

1. **OpenAI-compat coverage (smallest, do first):** register `opencode` and `opencode-go` as openai-compatibility providers; pull model lists from `GET /models` (public); seed `models[]` with the chat-completions-family IDs only; honor per-model aliases.
2. **Anthropic-protocol coverage (needed for Claude/Qwen/MiniMax):** extend the CLIProxy upstream layer with an anthropic-compatible provider type: base URL + `x-api-key` + `anthropic-version: 2023-06-01`, passthrough of Anthropic SSE. If the CLIProxy already serves `/api/provider/<name>/v1/messages` to Claude Code clients, this is an upstream-side mirror of the same protocol — no shape conversion needed.
3. **Responses-protocol coverage (needed for GPT models):** add an OpenAI-Responses upstream type (Bearer auth, responses SSE event passthrough), or exclude GPT models from the catalog until then.
4. **Gemini:** only after verifying caveat 1; requires `x-goog-api-key` header support on a google-protocol upstream type.
5. **Streaming:** forward protocol-native SSE untouched for every family above; only the CCS-facing side may convert (e.g. to Anthropic events for Claude Code clients), and that conversion must map delta/usage/stop events per family.
6. **Catalog hygiene:** merge `GET /models` (live) with the protocol table (static); models appear/disappear over time (deprecations listed in the Zen docs); disable-model → gateway returns error, surface it, don't crash.

## 8. Implementation status (2026-08-04, task t_8f91083d)

Implemented in the OpenAI-compat proxy daemon (`src/proxy`):

- `src/proxy/opencode-protocol.ts` — model→protocol classification for OpenCode
  hosts (Anthropic family → `anthropic`, GPT/Codex → `responses`, Gemini →
  `gemini`, everything else → `chat-completions`), provider-prefix stripping
  (`opencode/…`, `opencode-go/…`), and `resolveOpenCodeUpstreamMode(baseUrl,
  model)` returning the upstream mode or null for non-OpenCode hosts.
- `src/proxy/server/messages-route.ts` — per-request OpenCode routing:
  - Anthropic-family models → passthrough to `<base>/messages` with
    `x-api-key` + `anthropic-version: 2023-06-01`; Anthropic SSE forwarded
    untouched (existing passthrough pipe).
  - Chat-completions models → existing Anthropic→OpenAI translation to
    `<base>/chat/completions` with `Authorization: Bearer`.
  - Responses/Gemini models → rejected with a 400 explaining the protocol is
    not supported (Responses untranslated; Gemini disabled due to upstream
    bug #8228).

No new config flag or env var is required: OpenCode hosts (`opencode.ai` /
`*.opencode.ai`) are auto-detected, matching the existing Kimi/Anthropic
passthrough convention. OpenCode host detection overrides the generic
`CCS_OPENAI_PROXY_PASSTHROUGH` force flag so chat-completions models are never
sent to `/messages`.

Usage: point any OpenAI-compat profile at an OpenCode base URL, e.g.

```bash
export ANTHROPIC_BASE_URL="https://opencode.ai/zen/v1"
export ANTHROPIC_AUTH_TOKEN="<opencode key>"
export ANTHROPIC_MODEL="deepseek-v4-flash"        # chat-completions family
export ANTHROPIC_DEFAULT_SONNET_MODEL="claude-sonnet-4-6"  # anthropic family
export ANTHROPIC_DEFAULT_HAIKU_MODEL="claude-haiku-4-5"
```

`/zen/go/v1` works identically for the Go subscription models (chat
completions + MiniMax/Qwen on `/messages`).

Not implemented (tracked in the spec's integration steps 3–6): Responses
protocol for GPT/Codex models, Gemini (blocked upstream), live `GET /models`
catalog merge (the proxy still serves configured model IDs), and CLIProxy-side
provider presets for `opencode` / `opencode-go`.

## Verification record (2026-08-04)

- `GET https://opencode.ai/zen/v1/models` → 200, public, OpenAI list shape
- `GET https://opencode.ai/zen/go/v1/models` → 200, public, OpenAI list shape
- `POST /zen/v1/chat/completions` + Bearer dummy → 401 `Invalid API key.` (route + Bearer auth confirmed)
- `POST /zen/v1/responses` + Bearer dummy → 401 `Invalid API key.` (route + Bearer auth confirmed)
- `POST /zen/v1/messages` + `x-api-key` dummy → 401 `Invalid API key.`; + Bearer → 401 `Missing API key.`
- `POST /zen/v1/models/gemini-3.6-flash:generateContent` + `x-goog-api-key` dummy → 401 `Invalid API key.`; + Bearer → 401 `Missing API key.`
- `POST /zen/go/v1/messages` + `x-api-key` dummy → 401 `Invalid API key.`
- Sources: opencode.ai/docs/zen, opencode.ai/docs/go, models.dev api.json, anomalyco/opencode issue #8228, GOST blog proxy example.
