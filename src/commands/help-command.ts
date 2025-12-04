import * as fs from 'fs';
import * as path from 'path';
import { initUI, box, color, dim, sectionHeader, subheader } from '../utils/ui';

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

  // Hero box with ASCII art logo
  // Each letter: C=╔═╗/║ /╚═╝, C=╔═╗/║ /╚═╝, S=╔═╗/╚═╗/╚═╝
  const logo = `
╔═╗ ╔═╗ ╔═╗
║   ║   ╚═╗  v${VERSION}
╚═╝ ╚═╝ ╚═╝

Claude Code Profile & Model Switcher`.trim();

  console.log(
    box(logo, {
      padding: 1,
      borderStyle: 'round',
      titleAlignment: 'center',
    })
  );
  console.log('');

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
    ['Configure in ~/.ccs/*.settings.json'],
    [
      ['ccs', 'Use default Claude account'],
      ['ccs glm', 'GLM 4.6 (API key required)'],
      ['ccs glmt', 'GLM with thinking mode'],
      ['ccs kimi', 'Kimi for Coding (API key)'],
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
      ['ccs auth create <name>', 'Create new account profile'],
      ['ccs auth list', 'List all account profiles'],
    ]
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // MAJOR SECTION 3: CLI Proxy (OAuth Providers)
  // ═══════════════════════════════════════════════════════════════════════════
  printMajorSection(
    'CLI Proxy (OAuth Providers)',
    [
      'Zero-config OAuth authentication via CLIProxyAPI',
      'First run: Browser opens for authentication',
      'Settings: ~/.ccs/{provider}.settings.json (created after auth)',
    ],
    [
      ['ccs gemini', 'Google Gemini (gemini-2.5-pro)'],
      ['ccs codex', 'OpenAI Codex (gpt-5.1-codex-max)'],
      ['ccs agy', 'Antigravity (gemini-3-pro-preview)'],
      ['ccs qwen', 'Qwen Code (qwen3-coder)'],
      ['ccs iflow', 'iFlow (multiple models)'],
      ['', ''], // Spacer
      ['ccs <provider> --auth', 'Authenticate only'],
      ['ccs <provider> --logout', 'Clear authentication'],
      ['ccs <provider> --headless', 'Headless auth (for SSH)'],
      ['ccs codex "explain code"', 'Use with prompt'],
    ]
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // SUB-SECTIONS (simpler styling)
  // ═══════════════════════════════════════════════════════════════════════════

  // Delegation
  printSubSection('Delegation (inside Claude Code CLI)', [
    ['/ccs "task"', 'Delegate task (auto-selects profile)'],
    ['/ccs --glm "task"', 'Force GLM-4.6 for simple tasks'],
    ['/ccs --kimi "task"', 'Force Kimi for long context'],
    ['/ccs:continue "follow-up"', 'Continue last delegation session'],
  ]);

  // Diagnostics
  printSubSection('Diagnostics', [
    ['ccs doctor', 'Run health check and diagnostics'],
    ['ccs sync', 'Sync delegation commands and skills'],
    ['ccs update', 'Update CCS to latest version'],
  ]);

  // Flags
  printSubSection('Flags', [
    ['-h, --help', 'Show this help message'],
    ['-v, --version', 'Show version and installation info'],
    ['-sc, --shell-completion', 'Install shell auto-completion'],
  ]);

  // Configuration
  printConfigSection('Configuration', [
    ['Config File:', '~/.ccs/config.json'],
    ['Profiles:', '~/.ccs/profiles.json'],
    ['Instances:', '~/.ccs/instances/'],
    ['Settings:', '~/.ccs/*.settings.json'],
  ]);

  // CLI Proxy paths
  console.log(subheader('CLI Proxy:'));
  console.log(`  Binary:      ${color('~/.ccs/cliproxy/bin/cli-proxy-api', 'path')}`);
  console.log(`  Config:      ${color('~/.ccs/cliproxy/config.yaml', 'path')}`);
  console.log(`  Auth:        ${color('~/.ccs/cliproxy/auth/', 'path')}`);
  console.log(`  ${dim('Port: 8317 (default)')}`);
  console.log('');

  // Shared Data
  console.log(subheader('Shared Data:'));
  console.log(`  Commands:    ${color('~/.ccs/shared/commands/', 'path')}`);
  console.log(`  Skills:      ${color('~/.ccs/shared/skills/', 'path')}`);
  console.log(`  Agents:      ${color('~/.ccs/shared/agents/', 'path')}`);
  console.log(`  ${dim('Note: Symlinked across all profiles')}`);
  console.log('');

  // Examples (aligned with consistent spacing)
  console.log(subheader('Examples:'));
  console.log(`  $ ${color('ccs', 'command')}                     ${dim('# Use default account')}`);
  console.log(
    `  $ ${color('ccs gemini', 'command')}              ${dim('# OAuth (browser opens first time)')}`
  );
  console.log(`  $ ${color('ccs glm "implement API"', 'command')} ${dim('# API key model')}`);
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
