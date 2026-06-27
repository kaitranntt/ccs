# WebSearch Configuration Guide

Last Updated: 2026-04-11

CCS provides automatic web search for third-party profiles that cannot access Anthropic's native WebSearch API.

## How WebSearch Works

### Native Claude Accounts

Native Claude subscription accounts still use Anthropic's server-side WebSearch directly.

### Third-Party Profiles

Third-party profiles cannot execute Anthropic's server-side WebSearch because the tool never reaches their backend. CCS now handles that by provisioning a first-class local MCP tool when the managed runtime is available, suppressing native `WebSearch` for those launches, appending a short launch-time steering hint, and running real local search providers directly.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                   Claude Code CLI                                │
│                                                                  │
│  Search Request                                                  │
│       │                                                          │
│       ├── Native Claude Account? → Anthropic WebSearch API       │
│       │                                                          │
│       └── Third-party Profile? → native WebSearch disabled       │
│                                   │                              │
│                                   ├── CCS MCP tool when ready    │
│                                   │   ccs-websearch.WebSearch    │
│                                   │             │                │
│                                   │             ├── 1. Exa       │
│                                   │             ├── 2. Tavily    │
│                                   │             ├── 3. Brave     │
│                                   │             ├── 4. SearXNG   │
│                                   │             ├── 5. DuckDuckGo│
│                                   │             └── 6. Legacy CLI│
│                                   │                    fallback  │
│                                   │                    (Gemini/  │
│                                   │                     OpenCode/│
│                                   │                     Grok)    │
│                                   └── Bash/network fallback      │
└──────────────────────────────────────────────────────────────────┘
```

## Why This Changed

The previous design asked another model CLI to perform web search and summarize the answer. A later compatibility path also depended on a denied native-tool hook. Both were brittle:

- CLI syntax changed upstream
- auth state varied per tool
- prompt/tool behavior drifted across releases
- hook-shaped denial output produced awkward host UX

The new flow matches the `goclaw` model more closely: web search is treated as a first-class deterministic capability, not an LLM-to-LLM workaround or a denied native tool call.

When provisioned, the managed MCP tool is exposed as `ccs-websearch.WebSearch`, not a generic `search` helper. That naming is deliberate: it gives Claude a tool that matches the native `WebSearch` concept more directly, which should reduce cases where the model reaches for ad hoc Bash or `curl` fetches instead.

CCS also appends a third-party-only `--append-system-prompt` hint telling Claude to prefer that managed `WebSearch` tool for web lookups and current-information requests. This is soft steering only: if the user explicitly asks for shell commands, or the tool is unavailable, Claude can still fall back to Bash/network tools.
That shared launch helper applies to normal third-party settings profiles, CLIProxy/Copilot-backed Claude launches, and CCS headless/delegation runs that execute through a settings profile.

`websearch.enabled: false` disables the managed local runtime, but CCS still suppresses Anthropic's native `WebSearch` on third-party profiles. That native tool cannot be satisfied by Exa, Tavily, Brave, DuckDuckGo, or other non-Anthropic backends, so CCS avoids sending a broken native-tool request and lets Claude fall back to normal shell/network tools instead.

## Providers

| Provider | Type | Setup | Default | Notes |
|----------|------|-------|---------|-------|
| Exa | HTTP API | `EXA_API_KEY` | No | High-quality API search with extracted content |
| Tavily | HTTP API | `TAVILY_API_KEY` | No | Agent-oriented search API |
| Brave Search | HTTP API | `BRAVE_API_KEY` | No | Cleaner snippets and metadata |
| SearXNG | JSON API | `providers.searxng.url` | No | Self-hosted/public SearXNG backend via `/search?format=json` |
| DuckDuckGo | HTML fetch | None | Yes | Built-in zero-setup fallback |
| Antigravity (agy) | LLM CLI | `curl -fsSL https://antigravity.google/cli/install.sh \| bash` | No | Recommended LLM CLI fallback (Gemini CLI successor) |
| Gemini CLI | LLM CLI | Deprecated, use Antigravity (agy) | No | Deprecated. Google retired the gemini CLI on 2026-06-18 |
| OpenCode | LLM CLI | `curl -fsSL https://opencode.ai/install \| bash` | No | Optional compatibility fallback |
| Grok CLI | LLM CLI | `npm i -g @vibe-kit/grok-cli` + `GROK_API_KEY` | No | Optional compatibility fallback |

## Configuration

### Via Dashboard

Open `ccs config` → `Settings` → `WebSearch`.

- Enable Exa, Tavily, Brave, SearXNG, or DuckDuckGo in the backend chain
- Configure the SearXNG base URL (for example `https://search.example.com`) when SearXNG is enabled
  Do not include `/search`, embedded credentials, query parameters, or URL fragments. CCS appends `/search?format=json`.
- Set or rotate Exa, Tavily, and Brave API keys directly inside each provider card
- Saved keys are persisted in `global_env` and injected at runtime, so readiness updates from the same screen
- Review whether any legacy fallback CLIs are still enabled in config

### Via Config File

Edit `~/.ccs/config.yaml`:

```yaml
websearch:
  enabled: true
  providers:
    exa:
      enabled: false
      max_results: 5
    tavily:
      enabled: false
      max_results: 5
    brave:
      enabled: false
      max_results: 5
    searxng:
      enabled: false
      url: ""
      max_results: 5
    duckduckgo:
      enabled: true
      max_results: 5
    agy:
      enabled: false
      model: gemini-2.5-flash
      timeout: 90
    gemini:
      enabled: false
      model: gemini-2.5-flash
      timeout: 55
    opencode:
      enabled: false
      model: opencode/grok-code
      timeout: 90
    grok:
      enabled: false
      timeout: 55
```

Note: `enabled: false` stops provisioning the managed local `ccs-websearch.WebSearch` runtime. It does not re-enable Anthropic's native `WebSearch` for third-party backends.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `EXA_API_KEY` | Enables Exa when `providers.exa.enabled: true` |
| `TAVILY_API_KEY` | Enables Tavily when `providers.tavily.enabled: true` |
| `BRAVE_API_KEY` | Enables Brave Search when `providers.brave.enabled: true` |
| `CCS_WEBSEARCH_SEARXNG_URL` | Runtime URL used when `providers.searxng.enabled: true` |
| `CCS_WEBSEARCH_SEARXNG_MAX_RESULTS` | Optional runtime override for SearXNG result count (clamped 1..10) |
| `GROK_API_KEY` | Required only for legacy Grok CLI fallback |
| `CCS_WEBSEARCH_SKIP` | Disable the CCS local WebSearch runtime for the current process; third-party launches still keep native Anthropic `WebSearch` disabled |
| `CCS_DEBUG` | Verbose WebSearch runtime logging |
| `CCS_WEBSEARCH_TRACE` | Write opt-in JSONL trace records under `~/.ccs/logs/websearch-trace.jsonl` |
| `CCS_WEBSEARCH_TRACE_FILE` | Override the trace file path (must stay inside `~/.ccs/`, your system temp directory, or `/var/log`) |

## Managed Runtime Files

- `~/.claude.json` → CCS manages `mcpServers.ccs-websearch`
- `~/.ccs/mcp/ccs-websearch-server.cjs` → local MCP server binary
- `~/.ccs/hooks/websearch-transformer.cjs` → shared provider runtime plus legacy compatibility fallback

## Troubleshooting

### WebSearch says "Ready (DuckDuckGo)"

That is expected. DuckDuckGo is the default zero-setup backend.

### Exa, Tavily, or Brave is enabled but not ready

Set the matching API key in the WebSearch dashboard card, or export it in the environment that launches CCS, then refresh status:

```bash
export EXA_API_KEY="your-api-key"
# or: export TAVILY_API_KEY="your-api-key"
# or: export BRAVE_API_KEY="your-api-key"
ccs config
```

If the dashboard says the key is stored but still not ready, check whether `Settings -> Global Env` is disabled. WebSearch reuses that injection path for dashboard-managed keys.

### SearXNG is enabled but not ready

1. Confirm the configured base URL is valid (for example `https://search.example.com`)
2. Confirm the instance exposes `GET /search?q=<query>&format=json`
3. If the hook reports `SearXNG returned 403: format=json is disabled on this instance`, enable JSON format on that SearXNG deployment or switch to another backend

### I still want Gemini/OpenCode/Grok fallback

Those providers remain supported, but they are no longer the primary path. Enable them explicitly in `config.yaml` if you want them as last-resort fallback.

### I need to see whether CCS exposed WebSearch or the model bypassed it

Run the launch with `CCS_WEBSEARCH_TRACE=1` (or `CCS_DEBUG=1`). CCS writes a JSONL trace to `~/.ccs/logs/websearch-trace.jsonl` with:

1. source-side launch records from CCS (`ccs_websearch_launch`)
2. MCP exposure and call records (`mcp_initialize`, `mcp_tools_list`, `mcp_tool_call_*`)
3. provider attempt and winner records (`websearch_provider_attempt`, `websearch_provider_success`)
4. session summaries (`mcp_session_summary`, and headless `headless_websearch_summary` when applicable)

Queries are fingerprinted (`queryHash`, `queryLength`) instead of logged raw by default. For headless/delegation runs, `headless_websearch_summary.likelyBypassed=true` means the MCP tool was exposed, no WebSearch call occurred, and Claude fell back to `Bash` or `WebFetch`.

### WebSearch returns no results

1. Check `websearch.enabled: true`
2. Keep DuckDuckGo enabled unless you have a strong reason to disable it
3. If using Exa, Tavily, or Brave, verify the matching API key
4. Run with `CCS_DEBUG=1` for runtime logs, or `CCS_WEBSEARCH_TRACE=1` for correlated launch/MCP/provider traces
5. If DuckDuckGo returns a non-result HTML error, retry later or enable another provider. CCS now treats that as a provider failure instead of a false empty result.

## Security Considerations

- API keys entered from the dashboard are stored in `~/.ccs/config.yaml` under `global_env` and injected as environment variables at runtime
- Shell-exported keys still work and are detected as external environment input
- Never commit API keys to version control
- Use the dashboard only on trusted machines, and protect `~/.ccs/config.yaml` with normal user-level filesystem permissions
