#!/usr/bin/env node
/**
 * CCS (Claude Code Switch) - Entry Point
 *
 * Instant profile switching for Claude CLI.
 * Supports multiple accounts, alternative models (GLM, Kimi),
 * and cost-optimized delegation.
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { detectClaudeCli } from './utils/claude-detector';
import { getSettingsPath } from './utils/config-manager';
import { ErrorManager } from './utils/error-manager';
import { execClaudeWithCLIProxy, CLIProxyProvider } from './cliproxy';

// Import extracted command handlers
import { handleVersionCommand } from './commands/version-command';
import { handleHelpCommand } from './commands/help-command';
import { handleInstallCommand, handleUninstallCommand } from './commands/install-command';
import { handleDoctorCommand } from './commands/doctor-command';
import { handleSyncCommand } from './commands/sync-command';
import { handleShellCompletionCommand } from './commands/shell-completion-command';
import { handleUpdateCommand } from './commands/update-command';

// Import extracted utility functions
import { execClaude, escapeShellArg } from './utils/shell-executor';

// ========== Profile Detection ==========

interface DetectedProfile {
  profile: string;
  remainingArgs: string[];
}

/**
 * Smart profile detection
 */
function detectProfile(args: string[]): DetectedProfile {
  if (args.length === 0 || args[0].startsWith('-')) {
    // No args or first arg is a flag → use default profile
    return { profile: 'default', remainingArgs: args };
  } else {
    // First arg doesn't start with '-' → treat as profile name
    return { profile: args[0], remainingArgs: args.slice(1) };
  }
}

// ========== GLMT Proxy Execution ==========

/**
 * Execute Claude CLI with embedded proxy (for GLMT profile)
 */
async function execClaudeWithProxy(
  claudeCli: string,
  profileName: string,
  args: string[]
): Promise<void> {
  // 1. Read settings to get API key
  const settingsPath = getSettingsPath(profileName);
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const apiKey = settings.env.ANTHROPIC_AUTH_TOKEN;

  if (!apiKey || apiKey === 'YOUR_GLM_API_KEY_HERE') {
    console.error('[X] GLMT profile requires Z.AI API key');
    console.error('    Edit ~/.ccs/glmt.settings.json and set ANTHROPIC_AUTH_TOKEN');
    process.exit(1);
  }

  // Detect verbose flag
  const verbose = args.includes('--verbose') || args.includes('-v');

  // 2. Spawn embedded proxy with verbose flag
  const proxyPath = path.join(__dirname, 'glmt', 'glmt-proxy.js');
  const proxyArgs = verbose ? ['--verbose'] : [];
  // Use process.execPath for Windows compatibility (CVE-2024-27980)
  const proxy = spawn(process.execPath, [proxyPath, ...proxyArgs], {
    stdio: ['ignore', 'pipe', verbose ? 'pipe' : 'inherit'],
  });

  // 3. Wait for proxy ready signal (with timeout)
  const { ProgressIndicator } = await import('./utils/progress-indicator');
  const spinner = new ProgressIndicator('Starting GLMT proxy');
  spinner.start();

  let port: number;
  try {
    port = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Proxy startup timeout (5s)'));
      }, 5000);

      proxy.stdout?.on('data', (data: Buffer) => {
        const match = data.toString().match(/PROXY_READY:(\d+)/);
        if (match) {
          clearTimeout(timeout);
          resolve(parseInt(match[1]));
        }
      });

      proxy.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      proxy.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          clearTimeout(timeout);
          reject(new Error(`Proxy exited with code ${code}`));
        }
      });
    });

    spinner.succeed(`GLMT proxy ready on port ${port}`);
  } catch (error) {
    const err = error as Error;
    spinner.fail('Failed to start GLMT proxy');
    console.error('[X] Error:', err.message);
    console.error('');
    console.error('Possible causes:');
    console.error('  1. Port conflict (unlikely with random port)');
    console.error('  2. Node.js permission issue');
    console.error('  3. Firewall blocking localhost');
    console.error('');
    console.error('Workarounds:');
    console.error('  - Use non-thinking mode: ccs glm "prompt"');
    console.error('  - Enable verbose logging: ccs glmt --verbose "prompt"');
    console.error('  - Check proxy logs in ~/.ccs/logs/ (if debug enabled)');
    console.error('');
    proxy.kill();
    process.exit(1);
  }

  // 4. Spawn Claude CLI with proxy URL
  const envVars: NodeJS.ProcessEnv = {
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
    ANTHROPIC_AUTH_TOKEN: apiKey,
    ANTHROPIC_MODEL: 'glm-4.6',
  };

  const isWindows = process.platform === 'win32';
  const needsShell = isWindows && /\.(cmd|bat|ps1)$/i.test(claudeCli);
  const env = { ...process.env, ...envVars };

  let claude: ChildProcess;
  if (needsShell) {
    const cmdString = [claudeCli, ...args].map(escapeShellArg).join(' ');
    claude = spawn(cmdString, {
      stdio: 'inherit',
      windowsHide: true,
      shell: true,
      env,
    });
  } else {
    claude = spawn(claudeCli, args, {
      stdio: 'inherit',
      windowsHide: true,
      env,
    });
  }

  // 5. Cleanup: kill proxy when Claude exits
  claude.on('exit', (code, signal) => {
    proxy.kill('SIGTERM');
    if (signal) process.kill(process.pid, signal as NodeJS.Signals);
    else process.exit(code || 0);
  });

  claude.on('error', (error) => {
    console.error('[X] Claude CLI error:', error);
    proxy.kill('SIGTERM');
    process.exit(1);
  });

  // Also handle parent process termination
  process.once('SIGTERM', () => {
    proxy.kill('SIGTERM');
    claude.kill('SIGTERM');
  });

  process.once('SIGINT', () => {
    proxy.kill('SIGTERM');
    claude.kill('SIGTERM');
  });
}

// ========== Main Execution ==========

interface ProfileError extends Error {
  profileName?: string;
  availableProfiles?: string;
  suggestions?: string[];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Special case: version command (check BEFORE profile detection)
  const firstArg = args[0];
  if (firstArg === 'version' || firstArg === '--version' || firstArg === '-v') {
    handleVersionCommand();
  }

  // Special case: help command
  if (firstArg === '--help' || firstArg === '-h' || firstArg === 'help') {
    handleHelpCommand();
    return;
  }

  // Special case: install command
  if (firstArg === '--install') {
    handleInstallCommand();
    return;
  }

  // Special case: uninstall command
  if (firstArg === '--uninstall') {
    handleUninstallCommand();
    return;
  }

  // Special case: shell completion installer
  if (firstArg === '--shell-completion' || firstArg === '-sc') {
    await handleShellCompletionCommand(args.slice(1));
    return;
  }

  // Special case: doctor command
  if (firstArg === 'doctor' || firstArg === '--doctor') {
    await handleDoctorCommand();
    return;
  }

  // Special case: sync command
  if (firstArg === 'sync' || firstArg === '--sync') {
    await handleSyncCommand();
    return;
  }

  // Special case: update command
  if (firstArg === 'update' || firstArg === '--update') {
    await handleUpdateCommand();
    return;
  }

  // Special case: auth command
  if (firstArg === 'auth') {
    const AuthCommandsModule = await import('./auth/auth-commands');
    const AuthCommands = AuthCommandsModule.default;
    const authCommands = new AuthCommands();
    await authCommands.route(args.slice(1));
    return;
  }

  // Special case: headless delegation (-p flag)
  if (args.includes('-p') || args.includes('--prompt')) {
    const { DelegationHandler } = await import('./delegation/delegation-handler');
    const handler = new DelegationHandler();
    await handler.route(args);
    return;
  }

  // Auto-recovery for missing configuration
  const RecoveryManagerModule = await import('./management/recovery-manager');
  const RecoveryManager = RecoveryManagerModule.default;
  const recovery = new RecoveryManager();
  const recovered = recovery.recoverAll();

  if (recovered) {
    recovery.showRecoveryHints();
  }

  // Detect profile
  const { profile, remainingArgs } = detectProfile(args);

  // Detect Claude CLI first (needed for all paths)
  const claudeCli = detectClaudeCli();
  if (!claudeCli) {
    ErrorManager.showClaudeNotFound();
    process.exit(1);
  }

  // Use ProfileDetector to determine profile type
  const ProfileDetectorModule = await import('./auth/profile-detector');
  const ProfileDetector = ProfileDetectorModule.default;
  const InstanceManagerModule = await import('./management/instance-manager');
  const InstanceManager = InstanceManagerModule.default;
  const ProfileRegistryModule = await import('./auth/profile-registry');
  const ProfileRegistry = ProfileRegistryModule.default;

  const detector = new ProfileDetector();

  try {
    const profileInfo = detector.detectProfileType(profile);

    if (profileInfo.type === 'cliproxy') {
      // CLIPROXY FLOW: OAuth-based profiles (gemini, codex, agy, qwen) or user-defined variants
      const provider = profileInfo.provider || (profileInfo.name as CLIProxyProvider);
      const customSettingsPath = profileInfo.settingsPath; // undefined for hardcoded profiles
      await execClaudeWithCLIProxy(claudeCli, provider, remainingArgs, { customSettingsPath });
    } else if (profileInfo.type === 'settings') {
      // Check if this is GLMT profile (requires proxy)
      if (profileInfo.name === 'glmt') {
        // GLMT FLOW: Settings-based with embedded proxy for thinking support
        await execClaudeWithProxy(claudeCli, profileInfo.name, remainingArgs);
      } else {
        // EXISTING FLOW: Settings-based profile (glm, kimi)
        // Use --settings flag (backward compatible)
        const expandedSettingsPath = getSettingsPath(profileInfo.name);
        execClaude(claudeCli, ['--settings', expandedSettingsPath, ...remainingArgs]);
      }
    } else if (profileInfo.type === 'account') {
      // NEW FLOW: Account-based profile (work, personal)
      // All platforms: Use instance isolation with CLAUDE_CONFIG_DIR
      const registry = new ProfileRegistry();
      const instanceMgr = new InstanceManager();

      // Ensure instance exists (lazy init if needed)
      const instancePath = instanceMgr.ensureInstance(profileInfo.name);

      // Update last_used timestamp
      registry.touchProfile(profileInfo.name);

      // Execute Claude with instance isolation
      const envVars: NodeJS.ProcessEnv = { CLAUDE_CONFIG_DIR: instancePath };
      execClaude(claudeCli, remainingArgs, envVars);
    } else {
      // DEFAULT: No profile configured, use Claude's own defaults
      execClaude(claudeCli, remainingArgs);
    }
  } catch (error) {
    const err = error as ProfileError;
    // Check if this is a profile not found error with suggestions
    if (err.profileName && err.availableProfiles !== undefined) {
      const allProfiles = err.availableProfiles.split('\n');
      ErrorManager.showProfileNotFound(err.profileName, allProfiles, err.suggestions);
    } else {
      console.error(`[X] ${err.message}`);
    }
    process.exit(1);
  }
}

// Run main
main().catch((error) => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
