# WebSearch Configuration Guide

CCS provides a local `WebSearch` MCP tool for managed Claude launches that use a
third-party provider. Native Claude sessions keep Anthropic's native search
behavior.

## Launch Contract

For a third-party Claude launch, CCS:

1. suppresses the native `WebSearch` tool because most third-party backends
   cannot execute it (see [Native WebSearch profiles](#native-websearch-profiles)
   for the opt-out);
2. when WebSearch is enabled, adds a short steering prompt that prefers the CCS
   MCP `WebSearch` tool;
3. when WebSearch is enabled, installs the managed MCP server and adds the
   `ccs-websearch` entry to the applicable Claude configuration;
4. searches enabled and ready providers in deterministic order.

Enabled launches fail closed if the MCP runtime or configuration cannot be
prepared. This prevents a launch where native search is suppressed but the
managed replacement is missing. When `websearch.enabled` is `false`, CCS skips
MCP provisioning but still suppresses native WebSearch for third-party
profiles; the model can use ordinary network or shell tools when allowed.

Claude subcommands that reject session flags are passed through without
WebSearch argument injection.

### Native WebSearch profiles

Some third-party backends do serve the native tool. Claude Code runs
`WebSearch` as a separate request that uses the small/fast model
(`ANTHROPIC_DEFAULT_HAIKU_MODEL`) and carries only the `web_search_20250305`
server tool, so any backend that executes that server tool works. Examples:
CLIProxy translates it to OpenAI `web_search` for Codex, and some
Anthropic-compatible gateways run it with their own search.

List those profiles in `websearch.native_profiles`. The name is the launched
settings profile, CLIProxy provider, or CLIProxy variant. For a listed profile
CCS skips steps 1–3 above: native `WebSearch` stays available, no steering
prompt is added, and the managed MCP runtime is not required for the launch.

```yaml
websearch:
  native_profiles:
    - my-gateway   # settings profile whose backend serves web_search
    - codex        # CLIProxy translates web_search for Codex
```

Search runs on whichever backend serves the small/fast model. A profile routed
through CLIProxy can therefore point `ANTHROPIC_DEFAULT_HAIKU_MODEL` at a Codex
model so that searches use the Codex subscription while the main model stays on
another upstream.

Implementation sources:

- [`src/utils/websearch/mcp-installer.ts`](../src/utils/websearch/mcp-installer.ts)
- [`src/utils/websearch/claude-tool-args.ts`](../src/utils/websearch/claude-tool-args.ts)
- [`src/dispatcher/flows/settings-flow.ts`](../src/dispatcher/flows/settings-flow.ts)
- [`lib/mcp/ccs-websearch-server.cjs`](../lib/mcp/ccs-websearch-server.cjs)

## Provider Order, Runtime Eligibility, and Dashboard Status

The managed runtime tries eligible providers sequentially:

1. Exa
2. Tavily
3. Brave Search
4. SearXNG
5. DuckDuckGo
6. Antigravity CLI
7. Gemini CLI compatibility fallback
8. OpenCode
9. Grok CLI

The first successful provider wins. Temporarily failing providers can enter a
bounded cooldown and be skipped on later calls. Runtime attempt eligibility is
defined in
[`lib/hooks/websearch-transformer.cjs`](../lib/hooks/websearch-transformer.cjs);
do not duplicate that list in other architecture docs.

The transformer and dashboard answer related but different questions:

| Provider | Transformer attempts when | Dashboard reports available when |
| --- | --- | --- |
| Exa | Enabled and `EXA_API_KEY` is present. | Enabled and the key is available through the active process or enabled Global Env. |
| Tavily | Enabled and `TAVILY_API_KEY` is present. | Enabled and the key is available through the active process or enabled Global Env. |
| Brave Search | Enabled and `BRAVE_API_KEY` is present. | Enabled and the key is available through the active process or enabled Global Env. |
| SearXNG | Enabled and a base URL is present. | Enabled with a valid normalized base URL. |
| DuckDuckGo | Enabled. | Enabled. |
| Antigravity | Enabled and the `agy` executable is available. | Enabled and the CLI is installed. |
| Gemini compatibility | Enabled and the `gemini` executable is available. | Enabled, installed, and authenticated. |
| OpenCode | Enabled and the `opencode` executable is available. | Enabled and the CLI is installed. |
| Grok | Enabled and the `grok` executable is available. | Enabled, installed, and `GROK_API_KEY` is available. |

DuckDuckGo is the default zero-setup provider. API-backed and CLI fallback
providers are disabled by default. Dashboard availability and setup guidance
are computed separately by
[`src/utils/websearch/status.ts`](../src/utils/websearch/status.ts); they do not
change the transformer's attempt predicate.

## Configuration

Use `ccs config` and open `Settings` → `WebSearch`, or edit the `websearch`
section in the unified CCS configuration:

The runtime schema supports Antigravity through `providers.agy`; the current
dashboard editor does not expose that provider, so configure it in
`config.yaml`. The same applies to `native_profiles`; the dashboard save route
keeps the stored list.

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
  native_profiles: []
```

The schema is
[`src/config/schemas/websearch.ts`](../src/config/schemas/websearch.ts), and
defaults are in
[`src/config/schemas/unified-config.ts`](../src/config/schemas/unified-config.ts).
Deprecated top-level WebSearch fields remain load-compatible but must not be
used for new configuration.

### SearXNG URL

Configure the instance base URL, for example
`https://search.example.invalid`. Do not include `/search`, credentials, query
parameters, or a URL fragment. CCS normalizes the base and calls the JSON search
endpoint.

### Dashboard-managed API keys

The dashboard stores supported provider keys in `global_env`. They are
available to WebSearch only when global environment injection is enabled.
Shell-provided environment values remain supported. Never place real keys in
documentation, tests, or committed configuration.

## Managed Files

In the default user layout, CCS manages:

- `~/.claude.json` → `mcpServers.ccs-websearch`
- `~/.ccs/mcp/ccs-websearch-server.cjs`
- `~/.ccs/hooks/websearch-transformer.cjs`

CCS installation and test paths can differ because configuration helpers honor
the active CCS and Claude home locations. Provisioning uses a lock and
preserves unrelated MCP server entries. Malformed Claude configuration is not
overwritten.

## Runtime Environment

[`src/utils/websearch/hook-env.ts`](../src/utils/websearch/hook-env.ts) converts
the resolved configuration into runtime environment values. Provider API keys
remain environment inputs; boolean and limit variables describe provider
selection.

Operational overrides:

| Variable | Effect |
| --- | --- |
| `CCS_DEBUG` | Enables verbose diagnostics and WebSearch trace collection. |
| `CCS_WEBSEARCH_TRACE` | Enables WebSearch JSONL trace collection. |
| `CCS_WEBSEARCH_TRACE_FILE` | Requests a trace path within an allowed CCS log, system temporary, or `/var/log` boundary. |

An unsafe trace-file override is ignored. Trace writes are best effort and do
not change launch or search results.

## Diagnostics

By default, trace records are written under
`~/.ccs/logs/websearch-trace.jsonl`. They correlate launch preparation, MCP
exposure, tool calls, provider attempts, provider success/failure, and session
summaries.

Normal trace metadata uses a query fingerprint and length instead of the raw
query. Provider-failure records can also include `error` detail returned by a
provider implementation, including HTTP response excerpts or CLI stderr.
That provider-generated detail is not guaranteed to exclude query text or
other sensitive content unless the implementation redacts it. Treat the trace
file as sensitive operational data.

For delegated/headless sessions, a likely-bypass summary means the tool was
exposed but no WebSearch call occurred and another allowed tool path was used.

When search is unavailable:

1. confirm `websearch.enabled` and at least one provider are enabled;
2. check readiness in the dashboard;
3. verify API keys or the SearXNG base URL without printing secrets;
4. enable `CCS_WEBSEARCH_TRACE=1` for one launch;
5. inspect provider attempt and cooldown events.

Focused coverage lives under
[`tests/unit/utils/websearch/`](../tests/unit/utils/websearch/),
[`tests/unit/hooks/`](../tests/unit/hooks/), and
[`tests/unit/targets/settings-profile-websearch-launch.test.ts`](../tests/unit/targets/settings-profile-websearch-launch.test.ts).
