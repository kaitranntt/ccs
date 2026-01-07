# WebSearch Configuration Guide

Last Updated: 2026-01-06

CCS provides automatic web search capability for all profiles, including third-party providers that cannot access Anthropic's native WebSearch API.

## How WebSearch Works

### Native Claude Accounts

When using a native Claude subscription account, WebSearch is handled by Anthropic's server-side API ($10/1000 searches, usage-based billing).

### Third-Party Profiles

Third-party profiles (OAuth and API-based) cannot use Anthropic's WebSearch because:
- Claude Code CLI executes tools locally
- CLIProxyAPI only receives conversation messages
- Tool execution never reaches the third-party backend

CCS solves this with a hybrid fallback approach:

1. **Gemini CLI Transformer** (Primary) - Uses `gemini -p` with `google_web_search` tool
2. **MCP Fallback Chain** (Secondary) - MCP-based web search servers

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                   Claude Code CLI                             │
│                                                               │
│  WebSearch Tool Request                                       │
│       │                                                       │
│       ├── Native Claude Account? → Anthropic WebSearch API   │
│       │                            ($10/1000 searches)        │
│       │                                                       │
│       └── Third-party Profile? → PreToolUse Hook             │
│                                   │                           │
│                                   ├── 1. Gemini CLI           │
│                                   │    (google_web_search)    │
│                                   │    No API key needed!     │
│                                   │                           │
│                                   └── 2. MCP Fallback Chain   │
│                                        ├── web-search-prime   │
│                                        ├── Brave Search       │
│                                        └── Tavily             │
└──────────────────────────────────────────────────────────────┘
```

## Gemini CLI Integration (Primary)

The **ultimate solution** for third-party WebSearch. Uses `gemini` CLI with OAuth authentication - **no API key needed!**

### How It Works

1. A PreToolUse hook intercepts WebSearch tool calls
2. Executes `gemini -p` with explicit google_web_search instruction
3. Returns search results directly to Claude via the hook's deny reason
4. Claude receives full search results and continues the conversation

### Requirements

- `gemini` CLI installed and authenticated (run `gemini` to authenticate via browser)
- OAuth authentication (no GEMINI_API_KEY needed)

### Installation

The Gemini CLI is installed via npm:
```bash
npm install -g @google/gemini-cli
```

Then authenticate by running gemini once (opens browser):
```bash
gemini
```

## MCP Providers

| Provider | Type | Cost | API Key Required | Notes |
|----------|------|------|------------------|-------|
| web-search-prime | HTTP MCP | z.ai subscription | No | Requires z.ai coding plan |
| Brave Search | stdio MCP | Free tier | `BRAVE_API_KEY` | 15k queries/month |
| Tavily | stdio MCP | Paid | `TAVILY_API_KEY` | AI-optimized search |

## Configuration

### Via Dashboard

1. Open dashboard: `ccs config`
2. Navigate to **Settings** page
3. Configure WebSearch options:
   - **Enable/Disable**: Toggle auto-configuration
   - **Provider**: Choose preferred provider
   - **Fallback**: Enable/disable fallback chain

### Via Config File

Edit `~/.ccs/config.yaml`:

```yaml
websearch:
  enabled: true                    # Enable auto-config (default: true)
  provider: auto                   # auto | web-search-prime | brave | tavily
  fallback: true                   # Enable fallback chain (default: true)
  webSearchPrimeUrl: "https://..."  # Optional: custom endpoint

  # Gemini CLI configuration (new!)
  gemini:
    enabled: true                  # Use Gemini CLI for WebSearch (default: true)
    timeout: 55                    # Timeout in seconds (default: 55)
```

### Environment Variables

The WebSearch hook also respects these environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `CCS_WEBSEARCH_SKIP` | Skip WebSearch hook entirely | `0` |
| `CCS_GEMINI_SKIP` | Skip Gemini CLI, use MCP only | `0` |
| `CCS_GEMINI_TIMEOUT` | Gemini CLI timeout (seconds) | `55` |
| `CCS_DEBUG` | Enable debug output | `0` |

### Provider Options

- **auto** (default): Uses web-search-prime, adds Brave/Tavily if API keys available
- **web-search-prime**: Requires z.ai coding plan subscription
- **brave**: Requires `BRAVE_API_KEY` env var
- **tavily**: Requires `TAVILY_API_KEY` env var

## Setting Up Optional Providers

### Brave Search (Free Tier)

1. Get API key: [brave.com/search/api](https://brave.com/search/api)
2. Set environment variable:
   ```bash
   export BRAVE_API_KEY="your-api-key"
   ```
3. Restart CCS - Brave will be added to fallback chain

**Free tier limits**: 15,000 queries/month, 1 query/second

### Tavily (AI-Optimized)

1. Get API key: [tavily.com](https://tavily.com)
2. Set environment variable:
   ```bash
   export TAVILY_API_KEY="your-api-key"
   ```
3. Restart CCS - Tavily will be added to fallback chain

## MCP Configuration

CCS writes MCP configuration to `~/.claude/.mcp.json`. Example:

```json
{
  "mcpServers": {
    "web-search-prime": {
      "type": "http",
      "url": "https://api.z.ai/api/mcp/web_search_prime/mcp",
      "headers": {}
    },
    "brave-search": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": { "BRAVE_API_KEY": "..." }
    }
  }
}
```

## Troubleshooting

### Gemini CLI Issues

1. **Not installed**: Install with `npm install -g @google/gemini-cli`
2. **Not authenticated**: Run `gemini` to open browser for OAuth login
3. **Timeout**: Increase timeout in config or via `CCS_GEMINI_TIMEOUT=90`
4. **Skip Gemini**: Set `CCS_GEMINI_SKIP=1` to use MCP fallback only

### WebSearch Not Working

1. **Check config**: Ensure `websearch.enabled: true` in config
2. **Verify MCP**: Check `~/.claude/.mcp.json` exists
3. **Debug mode**: Run with `CCS_DEBUG=1 ccs gemini` for verbose output

### MCP Server Errors

1. **Network issues**: web-search-prime requires internet access
2. **npx failures**: Brave/Tavily require Node.js and npx
3. **API key issues**: Verify env vars are set correctly

### Existing MCP Config

CCS respects existing web search MCP configuration. If you have manually configured web search MCPs, CCS will not overwrite them.

To reset:
1. Remove web search entries from `~/.claude/.mcp.json`
2. Run any CCS third-party profile to regenerate

## Security Considerations

- API keys are stored in environment variables only
- Never commit API keys to version control
- Use `.env` files with proper permissions (chmod 600)
- Dashboard settings are stored in `~/.ccs/config.yaml` (no API keys)
