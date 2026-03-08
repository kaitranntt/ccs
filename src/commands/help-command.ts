import * as fs from 'fs';
import * as path from 'path';
import { initUI, box, color, dim, sectionHeader, subheader } from '../utils/ui';
import { isUnifiedMode } from '../config/unified-config-loader';
import { getCcsDir, getCcsDirSource } from '../utils/config-manager';
import { CLIPROXY_DEFAULT_PORT } from '../cliproxy/config/port-manager';

// Get version from package.json (same as version-command.ts)
const VERSION = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8')
).version;

/**
 * Print a major section with ═══ borders (only for 3 main sections)
 * Format:
 *   ═══ TITLE ═══
 *   Subtitle line 1
 *   Subtitle line 2
 *
 *   command    Description
 */
function printMajorSection(title: string, subtitles: string[], items: [string, string][]): void {
  // Section header with ═══ borders
  console.log(sectionHeader(title));

  // Subtitles on separate lines (dim)
  for (const subtitle of subtitles) {
    console.log(`  ${dim(subtitle)}`);
  }

  // Empty line before items
  console.log('');

  // Calculate max command length for alignment
  const maxCmdLen = Math.max(...items.map(([cmd]) => cmd.length));

  for (const [cmd, desc] of items) {
    const paddedCmd = cmd.padEnd(maxCmdLen + 2);
    console.log(`  ${color(paddedCmd, 'command')} ${desc}`);
  }

  // Extra spacing after section
  console.log('');
}

/**
 * Print a sub-section with colored title
 * Format:
 *   Title (context):
 *     command    Description
 */
function printSubSection(title: string, items: [string, string][]): void {
  // Sub-section header (colored, no borders)
  console.log(subheader(`${title}:`));

  // Calculate max command length for alignment
  const maxCmdLen = Math.max(...items.map(([cmd]) => cmd.length));

  for (const [cmd, desc] of items) {
    const paddedCmd = cmd.padEnd(maxCmdLen + 2);
    console.log(`  ${color(paddedCmd, 'command')} ${desc}`);
  }

  // Spacing after section
  console.log('');
}

/**
 * Print a config/paths section
 * Format:
 *   Title:
 *     Label:    path
 */
function printConfigSection(title: string, items: [string, string][]): void {
  console.log(subheader(`${title}:`));

  // Calculate max label length for alignment
  const maxLabelLen = Math.max(...items.map(([label]) => label.length));

  for (const [label, path] of items) {
    const paddedLabel = label.padEnd(maxLabelLen);
    console.log(`  ${paddedLabel} ${color(path, 'path')}`);
  }

  console.log('');
}

/**
 * Display comprehensive help information for CCS (Claude Code Switch)
 */
export async function handleHelpCommand(): Promise<void> {
  // Initialize UI (if not already)
  await initUI();

  // Hero box with ASCII art logo and config hint
  // Each letter: C=╔═╗/║ /╚═╝, C=╔═╗/║ /╚═╝, S=╔═╗/╚═╗/╚═╝
  const logo = `
╔═╗ ╔═╗ ╔═╗
║   ║   ╚═╗  v${VERSION}
╚═╝ ╚═╝ ╚═╝

Claude Code Profile & Model Switcher

Run ${color('ccs config', 'command')} for web dashboard`.trim();

  console.log(
    box(logo, {
      padding: 1,
      borderStyle: 'round',
      titleAlignment: 'center',
    })
  );
  console.log('');

  // Resolve display path for dynamic sections
  const [dirSource] = getCcsDirSource();
  const dirDisplay = dirSource === 'default' ? '~/.ccs' : getCcsDir();

  // Usage section
  console.log(subheader('Usage:'));
  console.log(`  ${color('ccs', 'command')} [profile] [claude-args...]`);
  console.log(`  ${color('ccs', 'command')} [flags]`);
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // MAJOR SECTION 1: API Key Profiles
  // ═══════════════════════════════════════════════════════════════════════════
  printMajorSection(
    'API Key Profiles',
    [`Configure in ${dirDisplay}/*.settings.json`],
    [
      ['ccs', 'Use default Claude account'],
      ['ccs glm', 'GLM 5 (API key required)'],
      ['ccs glmt', 'GLM with thinking mode'],
      ['ccs km', 'Kimi for Coding (API key)'],
      [
        'ccs api create --preset alibaba-coding-plan',
        'Alibaba Coding Plan (Anthropic-compatible API key)',
      ],
      ['ccs ollama', 'Local Ollama (http://localhost:11434)'],
      ['ccs ollama-cloud', 'Ollama Cloud (API key required)'],
      ['', ''], // Spacer
      ['ccs api create', 'Create custom API profile'],
      ['ccs api remove', 'Remove an API profile'],
      ['ccs api list', 'List all API profiles'],
    ]
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // MAJOR SECTION 2: Account Management
  // ═══════════════════════════════════════════════════════════════════════════
  printMajorSection(
    'Account Management',
    ['Run multiple Claude accounts concurrently'],
    [
      ['ccs auth --help', 'Show account management commands'],
      [
        'ccs auth create <name>',
        'Create account profile (supports --bare, shared groups, --deeper-continuity)',
      ],
      ['ccs config', 'Dashboard: Accounts table can edit context mode/group/continuity depth'],
      [
        '~/.ccs/config.yaml',
        'Optional: continuity.inherit_from_account maps API/CLIProxy/copilot/default profiles to an account context',
      ],
      ['ccs auth list', 'List all account profiles'],
      ['ccs auth default <name>', 'Set default profile'],
      ['ccs auth reset-default', 'Restore original CCS default'],
      ['ccs cliproxy auth claude', 'Alternative: authenticate Claude account pool via CLIProxy'],
    ]
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // MAJOR SECTION 3: CLI Proxy (OAuth Providers)
  // ═══════════════════════════════════════════════════════════════════════════
  printMajorSection(
    'CLI Proxy Plus (OAuth Providers)',
    [
      'Zero-config OAuth authentication via CLIProxy Plus',
      'First run: Browser opens for authentication, then model selection',
      'Settings: ~/.ccs/{provider}.settings.json (created after auth)',
      'Safety: do not reuse one Google account across "ccs gemini" and "ccs agy" (issue #509)',
      'Antigravity requires multi-step responsibility confirmation (issue #509)',
      'If you want to keep Google AI access, do not continue this shared-account setup',
      'CCS is as-is and does not take responsibility for account bans/access loss',
    ],
    [
      ['ccs gemini', 'Google Gemini (gemini-2.5-pro or 3-pro)'],
      ['ccs codex', 'OpenAI Codex (supports -medium/-high/-xhigh model suffixes)'],
      ['ccs agy', 'Antigravity (Claude/Gemini models)'],
      ['ccs qwen', 'Qwen Code OAuth (CLIProxy)'],
      ['ccs kimi', 'Kimi (Moonshot AI K2/K2.5 models)'],
      ['ccs kiro', 'Kiro (AWS CodeWhisperer Claude models)'],
      ['ccs ghcp', 'GitHub Copilot (OAuth via CLIProxy Plus)'],
      ['', ''], // Spacer
      ['ccs <provider> --auth', 'Authenticate only'],
      ['ccs <provider> --auth --add', 'Add another account'],
      [
        'ccs <provider> --paste-callback',
        'Show auth URL and prompt for callback paste (cross-browser)',
      ],
      ['ccs <provider> --accounts', 'List all accounts'],
      ['ccs <provider> --use <name>', 'Switch to account'],
      ['ccs <provider> --config', 'Change model (agy, gemini)'],
      [
        'ccs agy --accept-agr-risk',
        'Bypass interactive Antigravity confirmation (you accept full responsibility)',
      ],
      [
        'ccs <provider> --thinking <value>',
        'Set thinking budget (low/medium/high/xhigh/auto/off or number)',
      ],
      ['ccs codex --effort <level>', 'Set codex reasoning effort (medium/high/xhigh)'],
      ['ccs <provider> --1m', 'Enable 1M token context window'],
      ['ccs <provider> --no-1m', 'Disable 1M context (use 200K default)'],
      ['ccs <provider> --logout', 'Clear authentication'],
      ['ccs <provider> --headless', 'Headless auth (for SSH)'],
      ['ccs <provider> --port-forward', 'Force port-forwarding mode (skip prompt)'],
      ['ccs kiro --auth --kiro-auth-method aws', 'Kiro via AWS Builder ID (device code)'],
      ['ccs kiro --auth --kiro-auth-method aws-authcode', 'Kiro via AWS auth code flow'],
      ['ccs kiro --auth --kiro-auth-method google', 'Kiro via Google OAuth'],
      ['ccs kiro --auth --kiro-auth-method github', 'Kiro via GitHub OAuth (Dashboard flow)'],
      ['ccs kiro --import', 'Import token from Kiro IDE'],
      ['ccs kiro --incognito', 'Use incognito browser (default: normal)'],
      ['ccs codex "explain code"', 'Use with prompt'],
    ]
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // MAJOR SECTION 4: GitHub Copilot Integration (copilot-api)
  // ═══════════════════════════════════════════════════════════════════════════
  printMajorSection(
    'GitHub Copilot Integration (copilot-api)',
    [
      'Use your GitHub Copilot subscription with Claude Code via copilot-api',
      'Requires: npm install -g copilot-api',
      'Note: For OAuth-based access, use ccs ghcp instead',
    ],
    [
      ['ccs copilot', 'Use Copilot via copilot-api daemon'],
      ['ccs copilot auth', 'Authenticate with GitHub'],
      ['ccs copilot status', 'Show integration status'],
      ['ccs copilot models', 'List available models'],
      ['ccs copilot usage', 'Show Copilot quota usage'],
      ['ccs copilot start', 'Start copilot-api daemon'],
      ['ccs copilot stop', 'Stop copilot-api daemon'],
      ['ccs copilot enable', 'Enable integration'],
      ['ccs copilot disable', 'Disable integration'],
    ]
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // MAJOR SECTION 5: Cursor IDE Integration
  // ═══════════════════════════════════════════════════════════════════════════
  printMajorSection(
    'Cursor IDE Integration',
    [
      'Use Cursor IDE with Claude Code via cursor proxy daemon',
      'Auto-detects token from Cursor installation',
    ],
    [
      ['ccs cursor <cmd>', 'Use Cursor IDE integration'],
      ['ccs cursor auth', 'Import Cursor token'],
      ['ccs cursor auth --manual --token <t> --machine-id <id>', 'Manual token import'],
      ['ccs cursor status', 'Show connection status'],
      ['ccs cursor models', 'List available models'],
      ['ccs cursor start', 'Start proxy daemon'],
      ['ccs cursor stop', 'Stop proxy daemon'],
      ['ccs cursor enable', 'Enable cursor integration'],
      ['ccs cursor disable', 'Disable cursor integration'],
    ]
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // SUB-SECTIONS (simpler styling)
  // ═══════════════════════════════════════════════════════════════════════════

  // Delegation
  printSubSection('Delegation (inside Claude Code CLI)', [
    ['/ccs "task"', 'Delegate task (auto-selects profile)'],
    ['/ccs --glm "task"', 'Force GLM-5 for simple tasks'],
    ['/ccs --kimi "task"', 'Force Kimi OAuth for long context'],
    ['/ccs --km "task"', 'Force Kimi API key for long context'],
    ['/ccs:continue "follow-up"', 'Continue last delegation session'],
  ]);

  // Delegation CLI Flags (Claude Code passthrough)
  printSubSection('Delegation Flags (Claude Code passthrough)', [
    ['--max-turns <n>', 'Limit agentic turns (prevents loops)'],
    ['--fallback-model <model>', 'Auto-fallback on overload (sonnet)'],
    ['--agents <json>', 'Inject dynamic subagents'],
    ['--betas <features>', 'Enable experimental features'],
    ['--allowedTools <list>', 'Restrict available tools'],
    ['--disallowedTools <list>', 'Block specific tools'],
  ]);

  // Per-Profile Skills
  printSubSection('Per-Profile Skills', [
    ['ccs skills <profile> isolate', 'Enable per-profile skills'],
    ['ccs skills <profile> share', 'Restore shared skills mode'],
    ['ccs skills <profile> add <pkg>', 'Add skill to specific profile'],
    ['ccs skills <profile> remove [skill]', 'Remove skill from profile'],
    ['ccs skills <profile> list', 'List skills for profile'],
    ['ccs skills <profile> find [query]', 'Search for available skills'],
    ['ccs skills <profile> sync', 'Sync shared skills to profile'],
  ]);

  // Diagnostics
  printSubSection('Diagnostics', [
    ['ccs setup', 'First-time setup wizard'],
    ['ccs doctor', 'Run health check and diagnostics'],
    ['ccs cleanup', 'Remove old CLIProxy logs'],
    ['ccs config', 'Open web configuration dashboard'],
    ['ccs config auth setup', 'Configure dashboard login'],
    ['ccs config auth show', 'Show dashboard auth status'],
    ['ccs config image-analysis', 'Show image analysis settings'],
    ['ccs config image-analysis --enable', 'Enable image analysis'],
    ['ccs config thinking', 'Show thinking/reasoning settings'],
    ['ccs config thinking --mode auto', 'Set thinking mode'],
    ['ccs config thinking --clear-provider-override codex', 'Clear provider overrides'],
    ['ccs config --port 3000', 'Use specific port'],
    ['ccs persist <profile>', 'Write profile env to ~/.claude/settings.json'],
    ['ccs persist --list-backups', 'List available settings.json backups'],
    ['ccs persist --restore', 'Restore settings.json from latest backup'],
    ['ccs sync', 'Sync delegation commands and skills'],
    ['ccs update', 'Update CCS to latest version'],
    ['ccs update --force', 'Force reinstall current version'],
    ['ccs update --beta', 'Install from dev channel (unstable)'],
  ]);

  // Environment export
  printSubSection('Environment Export', [
    ['ccs env <profile>', 'Export env vars for third-party tools'],
    ['ccs env <profile> --format openai', 'OpenAI-compatible vars (OpenCode/Cursor)'],
    ['ccs env <profile> --format anthropic', 'Anthropic vars (default)'],
    ['ccs env <profile> --format raw', 'All effective env vars'],
    ['ccs env <profile> --shell fish', 'Fish shell syntax'],
  ]);

  // Flags
  printSubSection('Flags', [
    ['--config-dir <path>', 'Use custom CCS config directory'],
    ['--target <cli>', 'Target CLI: claude (default), droid'],
    ['-h, --help', 'Show this help message'],
    ['-v, --version', 'Show version and installation info'],
    ['-sc, --shell-completion', 'Install shell auto-completion'],
  ]);

  // Aliases
  printSubSection('Aliases', [
    ['ccsd <profile> [args]', 'Shorthand for: ccs <profile> --target droid'],
  ]);

  // Multi-target examples
  printSubSection('Multi-Target', [
    ['ccs glm --target droid', 'Run GLM profile on Droid CLI'],
    ['ccsd glm', 'Same as above (alias)'],
    ['ccsd codex', 'Run built-in CLIProxy Codex profile on Droid'],
    ['ccsd agy', 'Run built-in CLIProxy Antigravity profile on Droid'],
    [
      'ccsd codex exec --skip-permissions-unsafe "fix failing tests"',
      'Pass through Droid exec mode',
    ],
    ['ccsd codex -m custom:gpt-5.3-codex "fix failing tests"', 'Auto-routes short exec flags'],
    [
      'ccsd codex --skip-permissions-unsafe "fix failing tests"',
      'Auto-routes to Droid exec when exec-only flags are detected',
    ],
    [
      'ccs cliproxy create my-codex --provider codex --target droid',
      'Create CLIProxy variant with Droid as default target',
    ],
    ['ccs glm', 'Run GLM profile on Claude Code (default)'],
  ]);

  // Configuration
  printConfigSection('Configuration', [
    ['Config File:', isUnifiedMode() ? `${dirDisplay}/config.yaml` : `${dirDisplay}/config.json`],
    ['Profiles:', `${dirDisplay}/profiles.json`],
    ['Instances:', `${dirDisplay}/instances/`],
    ['Settings:', `${dirDisplay}/*.settings.json`],
  ]);

  // CLI Proxy management
  printSubSection('CLI Proxy Plus Management', [
    ['ccs cliproxy', 'Show CLIProxy Plus status and version'],
    ['ccs cliproxy --help', 'Full CLIProxy Plus management help'],
    ['ccs cliproxy doctor', 'Quota diagnostics (Antigravity)'],
    ['ccs cliproxy --install <ver>', 'Install specific version (e.g., 6.6.6)'],
    ['ccs cliproxy --latest', 'Update to latest version'],
    ['', ''], // Spacer
    ['ccs cliproxy pause <p> <a>', 'Pause account from rotation'],
    ['ccs cliproxy resume <p> <a>', 'Resume paused account'],
    ['ccs cliproxy status', 'Show CLIProxy process status'],
    ['ccs cliproxy quota', 'Show quota/tier/pause status for all providers'],
    ['ccs cliproxy quota --provider <name>', 'Show quota/tier/pause status for one provider'],
  ]);

  // CLI Proxy configuration flags (new)
  printSubSection('CLI Proxy Configuration', [
    ['--proxy-host <host>', 'Remote proxy hostname/IP'],
    ['--proxy-port <port>', `Proxy port (default: ${CLIPROXY_DEFAULT_PORT})`],
    ['--proxy-protocol <proto>', 'Protocol: http or https (default: http)'],
    ['--proxy-auth-token <token>', 'Auth token for remote proxy'],
    ['--proxy-timeout <ms>', 'Connection timeout in ms (default: 2000)'],
    ['--local-proxy', 'Force local mode, ignore remote config'],
    ['--remote-only', 'Fail if remote unreachable (no fallback)'],
    ['--allow-self-signed', 'Allow self-signed certs (for dev proxies)'],
  ]);

  // W3: Thinking Budget explanation
  printSubSection('Extended Thinking / Reasoning', [
    ['--thinking off', 'Disable extended thinking'],
    ['--thinking auto', 'Let model decide dynamically'],
    ['--thinking low', '1K tokens - Quick responses'],
    ['--thinking medium', '8K tokens - Standard analysis'],
    ['--thinking high', '24K tokens - Deep reasoning'],
    ['--thinking xhigh', '32K tokens - Maximum depth'],
    ['--thinking <number>', 'Custom token budget (512-100000)'],
    ['', ''],
    ['--effort <level>', 'Codex alias for reasoning effort (medium/high/xhigh)'],
    ['--effort xhigh', 'Pin Codex effort to xhigh for this run'],
    ['', ''],
    ['Droid exec:', 'Use native Droid flag: --reasoning-effort <level>'],
    ['', 'CCS auto-maps --thinking/--effort to --reasoning-effort in droid exec mode.'],
    ['', 'For interactive droid sessions, CCS applies reasoning via Droid BYOK model config.'],
    ['', 'When multiple reasoning flags are provided, the first flag wins.'],
    ['', ''],
    ['Note:', 'Extended thinking allocates compute for step-by-step reasoning'],
    ['', 'before responding.'],
    ['', 'Providers: agy/gemini use --thinking, codex uses --effort (or --thinking alias).'],
    ['', 'Codex model suffixes also pin effort: -medium / -high / -xhigh.'],
  ]);

  // Extended Context (1M)
  printSubSection('Extended Context (--1m)', [
    ['--1m', 'Enable 1M token context window'],
    ['--no-1m', 'Disable 1M context (use 200K default)'],
    ['', ''],
    ['Auto behavior:', 'Gemini models: auto-enabled by default'],
    ['', 'Claude models: opt-in with --1m flag'],
    ['', ''],
    ['Note:', 'Extended context enables 1M token window via [1m] suffix.'],
    ['', 'Premium pricing: 2x input for >200K tokens.'],
  ]);

  // Image Analysis
  printSubSection('Image Analysis (CLIProxy vision)', [
    ['ccs config image-analysis', 'Show current settings'],
    ['ccs config image-analysis --enable', 'Enable for CLIProxy providers'],
    ['ccs config image-analysis --disable', 'Disable (use native Read)'],
    ['ccs config image-analysis --timeout 120', 'Set analysis timeout'],
    ['ccs config image-analysis --set-model <p> <m>', 'Set provider model'],
    ['', ''],
    ['Note:', 'When enabled, images/PDFs are analyzed via vision models'],
    ['', 'instead of passing raw data to Claude. Works with CLIProxy'],
    ['', 'providers (agy, gemini, codex, kiro, ghcp).'],
  ]);

  // CCS Environment Variables
  printSubSection('Environment Variables', [
    ['CCS_DIR', 'Override CCS config directory (default: ~/.ccs)'],
    ['CCS_HOME', 'Override home directory (legacy, appends .ccs)'],
    ['CCS_DEBUG', 'Enable debug logging'],
    ['CCS_THINKING', 'Override thinking level (flag > env > config)'],
  ]);

  // CLI Proxy env vars
  printSubSection('CLI Proxy Environment Variables', [
    ['CCS_PROXY_HOST', 'Remote proxy hostname'],
    ['CCS_PROXY_PORT', 'Proxy port'],
    ['CCS_PROXY_PROTOCOL', 'Protocol (http/https)'],
    ['CCS_PROXY_AUTH_TOKEN', 'Auth token'],
    ['CCS_PROXY_TIMEOUT', 'Connection timeout in ms'],
    ['CCS_PROXY_FALLBACK_ENABLED', 'Enable local fallback (1/0)'],
    ['CCS_ALLOW_SELF_SIGNED', 'Allow self-signed certs (1/0)'],
  ]);

  // CLI Proxy paths
  console.log(subheader('CLI Proxy:'));
  console.log(`  Binary:      ${color(`${dirDisplay}/cliproxy/bin/cli-proxy-api-plus`, 'path')}`);
  console.log(`  Config:      ${color(`${dirDisplay}/cliproxy/config.yaml`, 'path')}`);
  console.log(`  Auth:        ${color(`${dirDisplay}/cliproxy/auth/`, 'path')}`);
  console.log(`  ${dim(`Port: ${CLIPROXY_DEFAULT_PORT} (default)`)}`);
  console.log('');

  // Shared Data
  console.log(subheader('Shared Data:'));
  console.log(`  Commands:    ${color(`${dirDisplay}/shared/commands/`, 'path')}`);
  console.log(`  Skills:      ${color(`${dirDisplay}/shared/skills/`, 'path')}`);
  console.log(`  Agents:      ${color(`${dirDisplay}/shared/agents/`, 'path')}`);
  console.log(`  ${dim('Note: Symlinked across all profiles')}`);
  console.log('');

  // Examples (aligned with consistent spacing)
  console.log(subheader('Examples:'));
  console.log(`  $ ${color('ccs', 'command')}                     ${dim('# Use default account')}`);
  console.log(
    `  $ ${color('ccs gemini', 'command')}              ${dim('# OAuth (browser opens first time)')}`
  );
  console.log(`  $ ${color('ccs glm "implement API"', 'command')} ${dim('# API key model')}`);
  console.log(`  $ ${color('ccs config', 'command')}              ${dim('# Open web dashboard')}`);
  console.log('');

  // Update examples
  console.log(subheader('Update:'));
  console.log(
    `  $ ${color('ccs update', 'command')}              ${dim('# Update to latest stable')}`
  );
  console.log(
    `  $ ${color('ccs update --force', 'command')}      ${dim('# Force reinstall current')}`
  );
  console.log(`  $ ${color('ccs update --beta', 'command')}       ${dim('# Install dev channel')}`);
  console.log('');

  // Docs link
  console.log(`  ${dim('Docs: https://github.com/kaitranntt/ccs')}`);
  console.log('');

  // Uninstall
  console.log(subheader('Uninstall:'));
  console.log(`  ${color('npm uninstall -g @kaitranntt/ccs', 'command')}`);
  console.log('');

  // License
  console.log(dim('License: MIT'));
  console.log('');

  process.exit(0);
}
