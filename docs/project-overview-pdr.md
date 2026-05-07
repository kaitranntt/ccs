# CCS Product Development Requirements (PDR)

Last Updated: 2026-05-07

## Product Overview

**Product Name**: CCS (Claude Code Switch)

**Tagline**: The multi-provider profile and runtime manager for Claude Code and compatible CLIs

**Description**: Multi-provider CLI/runtime manager enabling seamless switching between multiple Claude accounts, OAuth/API providers, and alternate targets such as Claude Code, Factory Droid, and Codex CLI. Includes a React-based dashboard for configuration management, plus support for local and remote CLIProxyAPI instances, hybrid quota management, and official Claude channel runtime setup for Telegram, Discord, and iMessage.

**Current Version**: v7.34.x+ (First-class ImageAnalysis MCP tooling, WebSearch MCP, performance improvements)

---

## Problem Statement

Developers using Claude Code face these challenges:

1. **Single Account Limitation**: Cannot run multiple Claude subscriptions simultaneously
2. **Provider Lock-in**: Stuck with Anthropic's API, cannot use alternatives
3. **No Concurrent Sessions**: Cannot work on different projects with different accounts
4. **Complex Configuration**: Manual env var and config file management
5. **No Usage Analytics**: Lack visibility into token usage and costs across providers

---

## Solution

CCS provides:

1. **Multi-Account Claude**: Isolated instances via `CLAUDE_CONFIG_DIR`
2. **OAuth Providers**: Zero-config Gemini, Codex, Antigravity, Kiro, and other active OAuth integrations, with deprecated Copilot compatibility for existing setups
3. **AI Providers**: Dedicated CLIProxy dashboard for Gemini, Codex, Claude, Vertex, and OpenAI-compatible API-key families
4. **API Profiles**: GLM, Kimi, OpenRouter, any Anthropic-compatible API
5. **Visual Dashboard**: React SPA for configuration management
6. **Automatic WebSearch**: First-class local WebSearch tool with deterministic provider chain for third-party providers
7. **Automatic Image Analysis**: First-class local ImageAnalysis tool with direct provider routing for third-party profiles
8. **Usage Analytics**: Token tracking, cost analysis, model breakdown
9. **Official Claude Channels**: Runtime auto-enable plus dashboard token/config flow for Telegram, Discord, and macOS-only iMessage
10. **Routing Strategy Guidance**: First-class `round-robin` vs `fill-first` controls in CLI and dashboard, with explicit opt-in changes and no account-based guessing

---

## Target Users

| User Type | Use Case | Primary Features |
|-----------|----------|------------------|
| Individual Developer | Work/personal separation | Multi-account Claude |
| Agency/Contractor | Client account isolation | Profile switching |
| Cost-conscious Dev | GLM for bulk operations | API profiles, analytics |
| Enterprise | Custom LLM integration | OpenAI-compatible endpoints |
| Power User | Multiple providers | OpenRouter 300+ models |

---

## Functional Requirements

### FR-001: Profile Switching
- Switch between profiles with `ccs <profile>` command
- Support default profile when no argument provided
- Pass through all Claude CLI arguments

### FR-002: Multi-Account Claude
- Create isolated Claude instances
- Maintain separate sessions, todolists, logs per account
- Share commands, skills, agents across accounts

### FR-003: OAuth Provider Integration
- Support Gemini, Codex, Antigravity, Kiro, and deprecated Copilot compatibility OAuth flows
- Browser-based authentication (Authorization Code flow for most, Device Code for ghcp compatibility)
- Token caching and refresh

### FR-004: API Profile Management
- Configure custom API endpoints
- Support Anthropic-compatible APIs
- Model mapping and configuration
- OpenRouter integration with 300+ models

### FR-004A: CLIProxy AI Provider Management
- Configure CLIProxy-managed Gemini, Codex, Claude, Vertex, and OpenAI-compatible API-key entries
- Keep provider authoring separate from CCS API Profile creation
- Support local config editing and remote CLIProxy management parity where available

### FR-005: Dashboard UI
- Visual profile management
- Real-time health monitoring
- Usage analytics with cost tracking
- Modular page architecture (settings, analytics, auth-monitor)

### FR-006: Health Diagnostics
- Verify Claude CLI installation
- Check config file integrity
- Validate symlinks and permissions

### FR-007: WebSearch Fallback
- Expose a CCS-managed local WebSearch tool for third-party profiles that cannot reach Anthropic's native tool
- Suppress native `WebSearch` on third-party launches and steer Claude toward the CCS-owned path when it is available
- Support Exa, Tavily, Brave, and DuckDuckGo real search backends
- Keep Gemini CLI, OpenCode, and Grok as optional legacy fallback
- Graceful fallback chain

### FR-007A: First-Class Image Analysis
- Expose a CCS-managed local `ImageAnalysis` MCP tool for third-party profiles that need provider-backed vision
- Resolve the provider route before launch and send requests directly to `/api/provider/<backend>/v1/messages`
- Use editable prompt templates for `default`, `screenshot`, and `document` analysis modes
- Suppress the old CCS-managed `Read` hook during healthy MCP launches so it cannot compete with the primary path
- Keep the old `Read` hook as compatibility fallback only when MCP provisioning fails but provider-backed analysis is still viable
- Auto-heal stale CCS-managed image hooks and missing isolated MCP sync through launch-time cleanup, dashboard provisioning, and `ccs doctor --fix`
- Fall back to native `Read` without failing the whole launch when managed runtime, auth, or proxy readiness is unavailable

### FR-008: Remote CLIProxy Support
- Connect to remote CLIProxyAPI instances
- CLI flags for proxy configuration (--proxy-host, --proxy-port, etc.)
- Environment variable configuration (CCS_PROXY_HOST, etc.)
- Fallback to local proxy when remote unreachable
- Protocol-based default ports (443 for HTTPS, 8317 for HTTP)
- Dashboard UI for remote server configuration and testing

### FR-009: Quota Management (v7.14)
- Pause/resume individual accounts via `ccs cliproxy pause/resume <account>`
- Check quota status via `ccs cliproxy status [account]`
- Inspect the current proxy-wide routing strategy via `ccs cliproxy routing`
- Explicitly switch `round-robin` vs `fill-first` from CLI or dashboard
- Keep `round-robin` as the default until the user explicitly changes it
- Never infer routing strategy from account count, tier mix, or paused/default account state
- Auto-failover when account exhausted
- Tier detection: free/pro/ultra/unknown
- Distinguish entitlement failures from temporary capacity exhaustion
- Pre-flight quota checks before session start
- Dashboard UI with pause/resume toggles, tier badges, and quota-detail guidance

### FR-010: Docker Deployment
- Multi-stage Dockerfile with bun 1.2.21 and node:20-bookworm-slim
- Docker Compose setup with resource limits and healthcheck
- Persistent volumes for config, credentials, and CLI tools
- Pre-installed CLIs: claude, gemini, grok, opencode, ccs
- Ports: 3000 (Dashboard), 8317 (CLIProxy)
- Entrypoint with privilege dropping and usage help
- Environment variable configuration support

### FR-011: Third-Party Tool Integration
- Export shell-evaluable env vars via `ccs env` command
- Support OpenAI, Anthropic, raw output formats
- Auto-detect shell (bash/zsh, fish, PowerShell) from $SHELL
- Security: single-quoted output, key sanitization, shell-specific escaping
- Cross-platform compatibility (macOS, Linux, Windows)

### FR-012: Official Claude Channels
- Support Telegram, Discord, and iMessage selection via `ccs config channels` and the dashboard
- Auto-inject `--channels` only for native Claude `default` and `account` sessions
- Store Telegram/Discord bot tokens in Claude's own `~/.claude/channels/<channel>/.env` state or the official `*_STATE_DIR` override path when one is configured
- Treat iMessage as macOS-only, tokenless, and dependent on Claude-side install plus OS permissions
- Require Bun, Claude Code v2.1.80+, and verified `claude.ai` auth before runtime auto-enable
- Keep `--dangerously-skip-permissions` optional and never add it when the user already made an explicit permission choice
- Surface platform/auth/version/setup blockers clearly in both CLI and dashboard flows
- Preserve dashboard token drafts when save/refresh fails, and let already-selected unsupported iMessage entries be turned off without allowing re-enable on unsupported platforms

---

## Non-Functional Requirements

### NFR-001: Performance
- CLI startup < 100ms
- Dashboard load < 2s
- Minimal memory footprint

### NFR-002: Reliability
- Idempotent operations
- Graceful error handling
- Automatic recovery where possible

### NFR-003: Security
- Local-only proxy binding (127.0.0.1)
- No credential exposure in logs
- Secure token storage

### NFR-004: Cross-Platform
- Support Linux, macOS, Windows
- Bash 3.2+, PowerShell 5.1+, Node.js 14+
- Identical behavior across platforms

### NFR-005: Maintainability
- Files < 200 lines (with documented exceptions)
- Domain-based organization
- Barrel exports for clean imports
- 90%+ test coverage

---

## Technical Requirements

### TR-001: Runtime Dependencies
- Node.js 14+ or Bun 1.0+
- Claude Code CLI installed
- Internet access for OAuth/API calls

### TR-002: Optional Dependencies
- CLIProxyAPI binary (auto-managed)
- Exa/Tavily/Brave API keys for higher-quality WebSearch
- Gemini CLI for legacy WebSearch fallback
- Bun plus Claude Code v2.1.80+ with `claude.ai` auth for Official Channels auto-enable

### TR-003: Configuration
- YAML-based config (`~/.ccs/config.yaml`)
- JSON settings per profile
- Environment variable overrides
- Official channel bot tokens stored in Claude-managed `~/.claude/channels/<channel>/.env`

---

## Architecture Constraints

### AC-001: CLI-First Design
- All features accessible via CLI
- Dashboard is convenience layer, not required
- Scriptable and automatable

### AC-002: Non-Invasive
- Never modify `~/.claude/settings.json`
- Use environment variables for configuration
- Reversible changes only

### AC-003: Proxy Pattern
- Use local proxy for provider routing
- Claude CLI communicates with localhost
- Proxy handles upstream API calls

---

## Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Startup time | < 100ms | Achieved |
| Dashboard load | < 2s | Achieved |
| Error rate | < 1% | Achieved |
| Test coverage | > 90% | 90% (1440 tests, 6 skipped) |
| File size compliance | 100% < 200 lines | 95% |

---

## Release Criteria

### v1.0 Release (Complete)
- [x] Multi-account Claude support
- [x] OAuth provider integration (Gemini, Codex, AGY)
- [x] API profile management
- [x] Dashboard UI
- [x] Health diagnostics
- [x] WebSearch fallback
- [x] Cross-platform support

### v7.0 Release (Complete)
- [x] OpenRouter integration with 300+ models
- [x] Interactive model picker
- [x] Dynamic model discovery
- [x] Tier mapping (opus/sonnet/haiku)
- [x] Settings page modularization (20 files)
- [x] Analytics page modularization (8 files)
- [x] Auth monitor modularization (8 files)
- [x] Comprehensive test infrastructure (539 CLI + 99 UI tests)

### v7.1 Release (Complete)
- [x] Remote CLIProxy routing support
- [x] CLI flags for remote proxy (--proxy-host, --proxy-port, etc.)
- [x] Environment variables for proxy config (CCS_PROXY_*)
- [x] Dashboard remote proxy configuration UI
- [x] Connection testing with latency display
- [x] Fallback to local when remote unreachable
- [x] Protocol-based default ports (HTTPS:443, HTTP:8317)

### v7.2 Release (Complete)
- [x] Kiro (AWS) OAuth provider support via CLIProxyAPIPlus
- [x] GitHub Copilot (ghcp) OAuth provider via Device Code flow (deprecated compatibility)
- [x] Authorization Code flow for Kiro (port 9876)
- [x] Device Code flow for ghcp (no local port needed)

### v7.14 Release (Complete)
- [x] Hybrid quota management with auto-failover
- [x] `ccs cliproxy pause/resume/status` commands
- [x] API tier detection (free/pro/ultra/unknown)
- [x] Dashboard pause/resume toggles and tier badges
- [x] Pre-flight quota checks before session start

### v7.23 Release (Complete)
- [x] Docker deployment support (PR #345)
- [x] Multi-stage Dockerfile with bun 1.2.21
- [x] Docker Compose with resource limits and healthcheck
- [x] Persistent volumes for config and credentials
- [x] Pre-installed AI CLI tools (claude, gemini, grok, opencode)
- [x] Entrypoint with privilege dropping

### v7.34 Release (Complete)
- [x] First-class `ImageAnalysis` MCP tool for third-party launches
- [x] Direct provider-scoped routing for image analysis requests
- [x] Prompt template selection for default / screenshot / document flows
- [x] Hook fallback retained only for compatibility
- [x] Non-fatal native `Read` fallback when managed runtime is unavailable
- [x] `ccs config image-analysis` CLI command
- [x] Doctor integration for hook validation
- [x] 791-line E2E test suite for image analysis
- [x] Performance: Replace busy-wait with Atomics.wait in config lock
- [x] Network error handling with noRetryPatterns
- [x] Quota 429 rate limit handling improvements
- [x] WebSocket maxPayload limit (DoS prevention)

### v7.39 Release (Complete)
- [x] `ccs env` command for third-party tool integration (OpenCode, Cursor, Continue)
- [x] Multi-format output: openai, anthropic, raw
- [x] Multi-shell support: bash/zsh, fish, PowerShell (auto-detected)
- [x] CLIProxy profile support (gemini, codex, agy, qwen)
- [x] Settings profile support (glm, kimi, custom API)
- [x] Security: single-quoted output, key sanitization, shell-specific escaping
- [x] Shell completion updated (bash, zsh, fish, PowerShell)
- [x] 34 unit tests for env command

### v8.0 Release (Planned - Q1 2026)
- [ ] Multiple CLIProxyAPI instances (load balancing, failover)
- [ ] Native git worktree support
- [ ] Critical bug fixes (#158, #155, #124)

### v9.0 Release (Future - Q2 2026)
- [ ] Team collaboration features
- [ ] Cloud sync for profiles
- [ ] Plugin system
- [ ] CLI extension framework

---

## Dependencies

### External Services
- Anthropic Claude API
- Google Gemini API
- GitHub Codex API
- GitHub Copilot (ghcp - deprecated Device Code OAuth compatibility)
- AWS Kiro (Authorization Code OAuth)
- Z.AI GLM API
- OpenRouter API
- Moonshot Kimi API
- DeepSeek API
- Alibaba Qwen API
- Minimax API
- Azure Foundry API

### Third-Party Libraries
- Express.js (web server)
- React (dashboard)
- Vite (build tool)
- shadcn/ui (UI components)
- CLIProxyAPI (proxy binary)
- Vitest (testing)

---

## Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Claude CLI API changes | Medium | High | Version pinning, compatibility layer |
| Provider API deprecation | Low | High | Fallback chain, multiple providers |
| OAuth token expiry | Medium | Medium | Auto-refresh, clear error messages |
| Binary compatibility | Low | Medium | Multi-platform builds, fallback |

---

## Related Documentation

- [Codebase Summary](./codebase-summary.md) - Technical structure
- [Code Standards](./code-standards.md) - Development conventions
- [System Architecture](./system-architecture/index.md) - Architecture diagrams
- [Project Roadmap](./project-roadmap.md) - Development phases and GitHub issues
