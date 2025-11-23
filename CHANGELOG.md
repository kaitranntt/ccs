# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/)

## [4.3.6] - 2025-11-23

### Added
- **Plugin Support**: Claude Code plugins now shared across all CCS profiles via `~/.ccs/shared/plugins/`
- Symlink architecture: `~/.claude/plugins/` ← `~/.ccs/shared/plugins/` ← `instance/plugins/`
- Install plugins once, use across GLM, GLMT, Kimi, and all Claude accounts
- Cross-platform support with Windows fallback (copy mode)

## [4.3.5] - 2025-11-22

### Changed
- **Deprecated Agent Cleanup**: Removed deprecated `ccs-delegator.md` agent file from installations
- Enhanced installation process to automatically clean up obsolete files
- Improved `ccs sync` command with migration logic for deprecated components

### Removed
- **ccs-delegator.md**: Agent file deprecated in favor of `ccs-delegation` skill (v4.3.2)
- Clean up of package copy in `~/.ccs/.claude/agents/ccs-delegator.md`
- Clean up of user symlink in `~/.claude/agents/ccs-delegator.md`

### Added
- Automatic migration marker system for tracking cleanup completion
- Intelligent backup system for user-modified deprecated files
- Version-aware migration logic following existing patterns

### Migration
- **Automatic**: Users upgrading from v4.3.2 or earlier will have deprecated files cleaned up automatically
- **Manual**: Run `ccs sync` to trigger cleanup manually
- **Backups**: User-modified files are backed up with timestamp before removal
- **Idempotent**: Cleanup is safe to run multiple times

### Technical Details
- Integrated into `npm postinstall` script for automatic cleanup on package updates
- Added to `ccs sync` command for manual cleanup operations
- Uses migration markers in `~/.ccs/.migrations/v435-delegator-cleanup`
- Follows existing SharedManager migration patterns for consistency

## [4.3.4] - 2025-11-22

### Fixed
- **CCS Update Command**: Enhanced `ccs update` to support multiple package managers
- Added automatic detection for npm, yarn, pnpm, and bun package managers
- Update commands now use the appropriate package manager automatically
- Improved installation method detection for more reliable updates

## [4.3.3] - 2025-11-21

### ⚠️ BREAKING CHANGES

- **CCS Delegation Commands Consolidated**: Replaced 4 hardcoded commands with 2 intelligent commands
  - Old: `/ccs:glm`, `/ccs:kimi`, `/ccs:glm:continue`, `/ccs:kimi:continue`
  - New: `/ccs` (auto-selects profile), `/ccs:continue` (auto-detects profile)
  - Override with flags: `/ccs --glm "task"`, `/ccs --kimi "task"`

### Changed
- Updated `--help` text across Node.js, Bash, and PowerShell implementations
- Updated delegation examples in README.md and workflow documentation
- Fixed CCS Doctor health checks to validate new command files
- Updated user configuration templates with new command syntax

### Added
- Intelligent profile selection based on task analysis (reasoning, long-context, cost-optimized)
- Support for custom profiles without creating new commands
- Enhanced session management with automatic profile detection

### Migration
| Old Command | New Command |
|-------------|-------------|
| `/ccs:glm "task"` | `/ccs "task"` (or `/ccs --glm "task"`) |
| `/ccs:kimi "task"` | `/ccs "task"` (or `/ccs --kimi "task"`) |
| `/ccs:glm:continue` | `/ccs:continue` |
| `/ccs:kimi:continue` | `/ccs:continue` |

---

## [4.1.5] - 2025-11-17

### Added
- **Sync command** (`ccs sync`) for updating delegation commands and skills
- **Short flag** `-sc` for `--shell-completion` command
- **Enhanced version display** with delegation status information

### Changed
- **Auth help text** now emphasizes concurrent account usage across all platforms
- **Help text standardization** ensures consistent messaging across bash, PowerShell, and Node.js
- **Description text** emphasizes running different Claude CLI sessions concurrently
- **GitHub documentation links** updated to stable permalinks
- **Shell completions** updated to include sync command and -sc flag

### Fixed
- **Inconsistent help text** across different platform implementations
- **Outdated description** text to emphasize concurrent sessions over specific examples

---

## [4.1.4] - 2025-11-17

### Fixed
- **Shell completion ENOTDIR errors** when parent path conflicts with existing files
- **Zsh completion syntax errors** with _alternative and _describe functions
- **Reversed color application** in zsh completion (commands vs descriptions)

### Added
- **Enhanced shell completion UI/UX** with descriptions and grouping
- **Color-coded completions** for zsh and fish shells
- **Custom settings profile support** in shell completions
- **Improved completion formatting** with section headers and separators

### Changed
- **Generalized help text** removed specific account examples for broader applicability
- **Delegation help section** clarified context and removed non-existent commands
- **Shell completion organization** grouped by categories (commands, model profiles, account profiles)

---

## [4.1.3] - 2025-11-17

### Fixed
- **Doctor command delegation check false positive**
  - Fixed `ccs doctor` incorrectly checking for delegation commands in `~/.ccs/shared/commands/ccs/` instead of `~/.ccs/.claude/commands/ccs/`
  - Removed check for non-existent `create.md` file
  - Now correctly detects installed delegation commands (glm.md, kimi.md) after npm install
  - Users will no longer see "[!] Delegation commands not found" warning when delegation is properly installed

---

## [4.1.2] - 2025-11-16

### Fixed
- **Kimi API 401 errors** caused by deprecated model fields
  - Removed `ANTHROPIC_MODEL`, `ANTHROPIC_SMALL_FAST_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL` from Kimi settings
  - Kimi API update now rejects requests with these fields (previously optional, now break authentication)
  - Automatic migration removes deprecated fields from existing `~/.ccs/kimi.settings.json`
  - Preserves user API keys and custom settings during migration
  - Updated `config/base-kimi.settings.json` template
  - Users experiencing 401 errors will be automatically fixed on next install/update

### Changed
- Kimi settings now minimal: only `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` required

---

## [4.1.1] - 2025-11-16

### Fixed
- **npm install fails to copy .claude/ directory** to `~/.ccs/.claude/`
  - Error: "[!] CCS .claude/ directory not found, skipping symlink installation"
  - Created `bin/utils/claude-dir-installer.js` utility to copy `.claude/` from package
  - Updated `scripts/postinstall.js` to copy `.claude/` before creating symlinks
  - Updated `ccs update` command to re-install `.claude/` directory
  - Supports Node.js 14+ with fallback for versions < 16.7.0

### Added
- `ClaudeDirInstaller` utility class for managing `.claude/` directory installation

---

## [4.1.0] - 2025-11-16

### Added
- **Selective .claude/ directory symlinking** for shared resources across profiles
- `claude-symlink-manager.js` utility for managing symlinks with Windows fallback
- Enhanced `ccs doctor` command to verify .claude/ directory health
- Postinstall script for automatic .claude/ directory setup
- **Stream-JSON output** for real-time delegation visibility (`--output-format stream-json --verbose`)
- **Real-time tool tracking** with verbose context (shows file paths, commands, patterns)
- **Smart slash command detection** (preserves /cook, /plan, /commit in delegated prompts)
- **Signal handling** (Ctrl+C/Esc kills delegated child processes, prevents orphans)
- **Comprehensive tool support** (13 Claude Code tools: Bash, Read, Write, Edit, Glob, Grep, NotebookEdit, NotebookRead, SlashCommand, Task, TodoWrite, WebFetch, WebSearch)
- **Active task display** for TodoWrite (shows current task instead of count)
- Documentation: Stream-JSON workflow diagrams

### Changed
- Installers now create selective symlinks (commands/, skills/, agents/) instead of full directory copies
- Windows support: Falls back to directory copying when symlinks unavailable
- Profile-specific files (settings.json, sessions/, todolists/, logs/) remain isolated
- Improved README with symlink architecture documentation
- **BREAKING**: Delegation now uses stream-json instead of single JSON blob
- **Time-based limits** replace turn-based limits (10min default timeout vs 20 max-turns)
- **Graceful termination** with SIGTERM → SIGKILL fallback (2s grace period)
- Removed `--max-turns` flag (deprecated, use timeout instead)
- Simplified slash command docs (removed over-prescriptive instructions)
- Internal tools (TodoWrite, Skill) now show meaningful progress

### Fixed
- Duplicate .claude/ resources across multiple profiles
- Installer logic now handles symlink creation during setup
- Orphaned `claude -p` processes after parent termination
- Slash commands broken by IMPORTANT safety prefix
- Slash commands detected as file paths (/home vs /cook)
- Stream-json requires `--verbose` flag with `-p`
- Tool output spam (filtered internal tools, show active tasks)

### Removed
- IMPORTANT safety prefix (broke slash command positioning)
- Outdated test files (json-output.test.js, max-turns.test.js)
- TTY detection (now shows progress unless CCS_QUIET=1)

---

## [3.5.0] - 2025-11-15

### Added
- Shell auto-completion (bash, zsh, PowerShell, Fish)
- `--shell-completion` command (auto-installs for detected shell with proper comment markers, cross-platform)
- Error codes (E101-E901) with documentation at docs/errors/
- Fuzzy matching "Did you mean?" suggestions (Levenshtein distance)
- Progress indicators (doctor command: [n/9] counter, GLMT proxy startup spinner)
- Interactive confirmation prompts for destructive operations
- `--yes/-y` flag for automation (skips confirmations)
- `--json` flag for auth commands (list, show)
- Impact display (session count, paths) before profile deletion
- Comprehensive test suite (15 tests, 100% pass rate)

### Changed
- Error boxes: Unicode (╔═╗) → ASCII (===) for cross-platform compatibility
- JSON output uses CCS version (3.5.0) instead of separate schema version
- Help text includes EXAMPLES section across all platforms
- Test suite properly counts test cases (not assertions)

### Fixed
- Standalone installer dependency handling (now downloads error-codes, progress-indicator, prompt files)
- `--yes` flag bug (returned false instead of true, preventing auto-confirmation)
- Help text consistency between Node.js and bash versions (added Uninstall section to bash)
- Test pass rate calculation (now excludes skipped tests from denominator)
- Help section comparison (locale-specific sort order)

---

## [3.4.6] - 2025-11-12

### Added
- GLMT ReasoningEnforcer: Prompt injection + API params hybrid (4 effort levels, always enabled)

### Changed
- Added GLMT production warnings (NOT PRODUCTION READY)
- Streamlined CLAUDE.md (-337 lines)
- Simplified GLMT controls: 4 mechanisms → 3 automatic
- Locale + reasoning enforcement now always enabled

### Removed
- GLMT Budget Calculator mechanism (consolidated into automatic controls)
- Deprecated GLMT environment variables (`CCS_GLMT_FORCE_ENGLISH`, `CCS_GLMT_THINKING_BUDGET`, `CCS_GLMT_STREAMING`)
- Outdated test scenarios for removed environment variables

---

## [3.4.5] - 2025-11-11

### Fixed
- Thinking block signature timing race (blocks appeared blank in Claude CLI UI)
- Content verification guard in `_createSignatureDeltaEvent()` returns null if empty

### Changed
- Consolidated debug flags: `CCS_DEBUG_LOG`, `CCS_GLMT_DEBUG` → `CCS_DEBUG` only

### Added
- 6 regression tests for thinking signature race (`test-thinking-signature-race.js`)

---

## [3.4.4] - 2025-11-11

### Fixed
- Postinstall symlink creation (fixed require path to shared-manager.js)

---

## [3.4.3] - 2025-11-11

### Added
- Keyword thinking control: `think` < `think hard` < `think harder` < `ultrathink`
- Streaming auto-fallback on error

### Changed
- YAGNI/KISS: Removed budget-calculator.js, task-classifier.js (-272 LOC)
- `CCS_DEBUG_LOG` → `CCS_DEBUG` (backward compatible)

### Removed
- `CCS_GLMT_THINKING_BUDGET`, `CCS_GLMT_STREAMING`, `CCS_GLMT_FORCE_ENGLISH` env vars

### Fixed
- GLMT proxy path (glmt/glmt-proxy.js)
- `ultrathink` effort: `high` → `max`

---

## [3.4.2] - 2025-11-11

### Changed
- Version bump for npm CI workaround

---

## [3.4.1] - 2025-11-11

### Added
- GLMT loop prevention (locale enforcer, budget calculator, task classifier, loop detector)
- Env vars: `CCS_GLMT_FORCE_ENGLISH`, `CCS_GLMT_THINKING_BUDGET`
- 110 GLMT tests (all passing)

### Changed
- Directory structure: bin/{glmt,auth,management,utils}, tests/{unit,integration}
- Token savings: 50-80% for execution tasks

### Fixed
- Thinking parameter processing from Claude CLI
- GLMT tool support (MCP tools, function calling)
- Unbounded planning loops (20+ min → <2 min)
- Chinese output issues

---

## [3.4.0] - 2025-11-11

### Added
- GLMT streaming (5-20x faster TTFB: <500ms vs 2-10s)
- SSEParser, DeltaAccumulator classes
- Security limits (1MB SSE, 10MB content, 100 blocks)

---

## [3.3.0] - 2025-11-11

### Added
- Debug mode: `CCS_DEBUG_LOG=1`
- Verbose flag: `ccs glmt --verbose`
- GLMT config defaults

---

## [3.2.0] - 2025-11-10

### Changed
- **BREAKING**: Symlink-based shared data (was copy-based)
- ~/.ccs/shared/ → ~/.claude/ symlinks
- 60% faster installs

---

## [3.1.1] - 2025-11-10

### Fixed
- Migration now runs during install (not on first `ccs` execution)

---

## [3.1.0] - 2025-11-10

### Added
- Shared data architecture (commands/skills/agents shared across profiles)

---

## [3.0.2] - 2025-11-10

### Fixed
- Profile creation no longer auto-sets as default
- Help text simplified (40% shorter)

---

## [3.0.1] - 2025-11-10

### Added
- Auto-recovery system for missing/corrupted configs
- `ccs doctor` health check command
- ErrorManager class

---

## [3.0.0] - 2025-11-09

### Added
- **Multi-account switching**: Run multiple Claude accounts concurrently
- Auth commands: create, list, show, remove, default
- Profile isolation (sessions, todos, logs per profile)

### BREAKING
- Removed v2.x vault encryption
- Login-per-profile model

---

## [2.5.1] - 2025-11-07
### Added
- Kimi `ANTHROPIC_SMALL_FAST_MODEL` support

## [2.5.0] - 2025-11-07
### Added
- Kimi integration

## [2.4.9] - 2025-11-05
### Fixed
- Node.js DEP0190 warning

## [2.4.8] - 2025-11-05
### Fixed
- Deprecation warning (platform-specific shell)

## [2.4.7] - 2025-11-05
### Fixed
- Windows spawn EINVAL error

## [2.4.6] - 2025-11-05
### Fixed
- Color detection, TTY handling

## [2.4.5] - 2025-11-05
### Added
- Performance benchmarks (npm vs shell)

## [2.4.3] - 2025-11-04
### Fixed
- **CRITICAL**: DEP0190 command injection vulnerability

## [2.4.2] - 2025-11-04
### Changed
- Version bump for republish

## [2.4.1] - 2025-11-04
### Fixed
- **CRITICAL**: Windows PATH detection
- PowerShell terminal termination

## [2.4.0] - 2025-11-04
### Added
- npm package support
### BREAKING
- Executables moved to lib/

## [2.3.1] - 2025-11-04
### Fixed
- PowerShell syntax errors

## [2.3.0] - 2025-11-04
### Added
- Custom Claude CLI path: `CCS_CLAUDE_PATH`

## [2.2.3] - 2025-11-03
### Added
- `ccs --uninstall` command

## [2.2.2] - 2025-11-03
### Fixed
- `ccs --install` via symlinks

## [2.2.1] - 2025-11-03
### Changed
- Hardcoded versions (no VERSION file)

## [2.2.0] - 2025-11-03
### Added
- Auto PATH configuration
- Terminal colors (NO_COLOR support)
### Changed
- Unified install: ~/.local/bin (Unix)
### Fixed
- **CRITICAL**: Shell injection vulnerability

## [2.1.0] - 2025-11-02
### Changed
- Windows uses --settings flag (27% code reduction)

## [2.0.0] - 2025-11-02
### BREAKING
- Removed `ccs son` profile
### Added
- Config templates, installers/ folder
### Fixed
- **CRITICAL**: PowerShell env var crash

## [1.1.0] - 2025-11-01
### Added
- Git worktrees support

## [1.0.0] - 2025-10-31
### Added
- Initial release
