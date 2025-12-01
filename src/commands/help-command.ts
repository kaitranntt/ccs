import { colored } from '../utils/helpers';

/**
 * Display comprehensive help information for CCS (Claude Code Switch)
 */
export function handleHelpCommand(): void {
  console.log(colored('CCS (Claude Code Switch) - Profile switching for Claude CLI', 'bold'));
  console.log('');

  console.log(colored('Usage:', 'cyan'));
  console.log(`  ${colored('ccs', 'yellow')} [profile] [claude-args...]`);
  console.log(`  ${colored('ccs', 'yellow')} [flags]`);
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1: API KEY MODELS
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(colored('═══ API Key Models ═══', 'cyanBold'));
  console.log('  Configure API keys in ~/.ccs/*.settings.json');
  console.log('');
  console.log(`  ${colored('ccs', 'yellow')}                         Use default Claude account`);
  console.log(`  ${colored('ccs glm', 'yellow')}                      GLM 4.6 (API key required)`);
  console.log(`  ${colored('ccs glmt', 'yellow')}                     GLM with thinking mode`);
  console.log(`  ${colored('ccs kimi', 'yellow')}                     Kimi for Coding (API key)`);
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: ACCOUNT MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(colored('═══ Account Management ═══', 'cyanBold'));
  console.log('  Run multiple Claude accounts concurrently');
  console.log('');
  console.log(
    `  ${colored('ccs auth --help', 'yellow')}             Show account management commands`
  );
  console.log(`  ${colored('ccs auth create <name>', 'yellow')}      Create new account profile`);
  console.log(`  ${colored('ccs auth list', 'yellow')}               List all account profiles`);
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: CLI PROXY (OAUTH PROVIDERS)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(colored('═══ CLI Proxy (OAuth Providers) ═══', 'cyanBold'));
  console.log('  Zero-config OAuth authentication via CLIProxyAPI');
  console.log('  First run: Browser opens for authentication');
  console.log('  Settings: ~/.ccs/{provider}.settings.json (created after auth)');
  console.log('');
  console.log(
    `  ${colored('ccs gemini', 'yellow')}                   Google Gemini (gemini-2.5-pro)`
  );
  console.log(
    `  ${colored('ccs codex', 'yellow')}                    OpenAI Codex (gpt-5.1-codex-max)`
  );
  console.log(
    `  ${colored('ccs agy', 'yellow')}                      Antigravity (gemini-3-pro-preview)`
  );
  console.log(`  ${colored('ccs qwen', 'yellow')}                     Qwen Code (qwen3-coder)`);
  console.log('');
  console.log(`  ${colored('ccs <provider> --auth', 'yellow')}        Authenticate only`);
  console.log(`  ${colored('ccs <provider> --logout', 'yellow')}      Clear authentication`);
  console.log(`  ${colored('ccs <provider> --headless', 'yellow')}    Headless auth (for SSH)`);
  console.log(`  ${colored('ccs codex "explain code"', 'yellow')}     Use with prompt`);
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // DELEGATION
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(colored('Delegation (inside Claude Code CLI):', 'cyan'));
  console.log(
    `  ${colored('/ccs "task"', 'yellow')}                Delegate task (auto-selects profile)`
  );
  console.log(
    `  ${colored('/ccs --glm "task"', 'yellow')}           Force GLM-4.6 for simple tasks`
  );
  console.log(`  ${colored('/ccs --kimi "task"', 'yellow')}          Force Kimi for long context`);
  console.log(
    `  ${colored('/ccs:continue "follow-up"', 'yellow')}    Continue last delegation session`
  );
  console.log('');

  console.log(colored('Diagnostics:', 'cyan'));
  console.log(
    `  ${colored('ccs doctor', 'yellow')}                  Run health check and diagnostics`
  );
  console.log(
    `  ${colored('ccs sync', 'yellow')}                    Sync delegation commands and skills`
  );
  console.log(`  ${colored('ccs update', 'yellow')}                  Update CCS to latest version`);
  console.log('');

  console.log(colored('Flags:', 'cyan'));
  console.log(`  ${colored('-h, --help', 'yellow')}                  Show this help message`);
  console.log(
    `  ${colored('-v, --version', 'yellow')}               Show version and installation info`
  );
  console.log(
    `  ${colored('-sc, --shell-completion', 'yellow')}     Install shell auto-completion`
  );
  console.log('');

  console.log(colored('Configuration:', 'cyan'));
  console.log('  Config File: ~/.ccs/config.json');
  console.log('  Profiles:    ~/.ccs/profiles.json');
  console.log('  Instances:   ~/.ccs/instances/');
  console.log('  Settings:    ~/.ccs/*.settings.json');
  console.log('');

  console.log(colored('CLI Proxy:', 'cyan'));
  console.log('  Binary:      ~/.ccs/cliproxy/bin/cli-proxy-api');
  console.log('  Config:      ~/.ccs/cliproxy/config.yaml');
  console.log('  Auth:        ~/.ccs/cliproxy/auth/');
  console.log('  Port:        8317 (default)');
  console.log('');

  console.log(colored('Shared Data:', 'cyan'));
  console.log('  Commands:    ~/.ccs/shared/commands/');
  console.log('  Skills:      ~/.ccs/shared/skills/');
  console.log('  Agents:      ~/.ccs/shared/agents/');
  console.log('  Note: Symlinked across all profiles');
  console.log('');

  console.log(colored('Examples:', 'cyan'));
  console.log(`  ${colored('$ ccs', 'yellow')}                        # Use default account`);
  console.log(
    `  ${colored('$ ccs gemini', 'yellow')}                  # OAuth (browser opens first time)`
  );
  console.log(`  ${colored('$ ccs glm "implement API"', 'yellow')}    # API key model`);
  console.log('');
  console.log(`  Docs: ${colored('https://github.com/kaitranntt/ccs', 'cyan')}`);
  console.log('');

  console.log(colored('Uninstall:', 'yellow'));
  console.log('  npm uninstall -g @kaitranntt/ccs');
  console.log('');

  console.log(`${colored('License:', 'cyan')} MIT`);

  process.exit(0);
}
