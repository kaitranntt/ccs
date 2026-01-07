# CCS Product Development Requirements (PDR)

Last Updated: 2026-01-06

## Product Overview

**Product Name**: CCS (Claude Code Switch)

**Tagline**: The universal AI profile manager for Claude Code

**Description**: CLI wrapper enabling seamless switching between multiple Claude accounts and alternative AI providers (GLM, Gemini, Codex, OpenRouter, Qwen, Kimi, DeepSeek) with a React-based dashboard for configuration management. Supports both local and remote CLIProxyAPI instances with hybrid quota management.

**Current Version**: v7.14.x (Hybrid Quota Management + Pause/Resume)

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
2. **OAuth Providers**: Zero-config Gemini, Codex, Antigravity, Copilot, Kiro (ghcp) integration
3. **API Profiles**: GLM, Kimi, OpenRouter, any Anthropic-compatible API
4. **Visual Dashboard**: React SPA for configuration management
5. **Automatic WebSearch**: MCP fallback for third-party providers
6. **Usage Analytics**: Token tracking, cost analysis, model breakdown

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
- Support Gemini, Codex, Antigravity, Copilot, Kiro (ghcp) OAuth flows
- Browser-based authentication (Authorization Code flow for most, Device Code for ghcp)
- Token caching and refresh

### FR-004: API Profile Management
- Configure custom API endpoints
- Support Anthropic-compatible APIs
- Model mapping and configuration
- OpenRouter integration with 300+ models

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
- Auto-configure MCP web search for third-party profiles
- Support Gemini CLI, OpenCode, Grok providers
- Graceful fallback chain

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
- Auto-failover when account exhausted
- Tier detection: free/paid/unknown
- Pre-flight quota checks before session start
- Dashboard UI with pause/resume toggles and tier badges

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
- Gemini CLI for WebSearch
- Additional MCP servers

### TR-003: Configuration
- YAML-based config (`~/.ccs/config.yaml`)
- JSON settings per profile
- Environment variable overrides

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
| Test coverage | > 90% | 90% (539 CLI + 99 UI tests) |
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
- [x] GitHub Copilot (ghcp) OAuth provider via Device Code flow
- [x] Authorization Code flow for Kiro (port 9876)
- [x] Device Code flow for ghcp (no local port needed)

### v7.14 Release (Complete)
- [x] Hybrid quota management with auto-failover
- [x] `ccs cliproxy pause/resume/status` commands
- [x] API tier detection (free/paid/unknown)
- [x] Dashboard pause/resume toggles and tier badges
- [x] Pre-flight quota checks before session start

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
- GitHub Codex/Copilot API
- GitHub Copilot (ghcp - Device Code OAuth)
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
- [System Architecture](./system-architecture.md) - Architecture diagrams
- [Project Roadmap](./project-roadmap.md) - Development phases and GitHub issues
