import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { detectClaudeCli } from './utils/claude-detector';
import { getSettingsPath, loadSettings } from './utils/config-manager';
import { validateGlmKey, validateMiniMaxKey } from './utils/api-key-validator';
import { ErrorManager } from './utils/error-manager';
import { execClaudeWithCLIProxy, CLIProxyProvider } from './cliproxy';
import {
  ensureMcpWebSearch,
  installWebSearchHook,
  displayWebSearchStatus,
  getWebSearchHookEnv,
} from './utils/websearch-manager';
import { getGlobalEnvConfig } from './config/unified-config-loader';
import { fail, info } from './utils/ui';

// Import centralized error handling
import { handleError, runCleanup } from './errors';

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

// Version and Update check utilities
import { getVersion } from './utils/version';
import {
  checkForUpdates,
  showUpdateNotification,
  checkCachedUpdate,
  isCacheStale,
} from './utils/update-checker';
// Note: npm is now the only supported installation method

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
  const envData = settings.env;
  const apiKey = envData['ANTHROPIC_AUTH_TOKEN'];

  if (!apiKey || apiKey === 'YOUR_GLM_API_KEY_HERE') {
    console.error(fail('GLMT profile requires Z.AI API key'));
    console.error('    Edit ~/.ccs/glmt.settings.json and set ANTHROPIC_AUTH_TOKEN');
    process.exit(1);
  }

  // Detect verbose flag
  const verbose = args.includes('--verbose') || args.includes('-v');

  // 2. Spawn embedded proxy with verbose flag
  const proxyPath = path.join(__dirname, 'glmt', 'glmt-proxy.js');
  const proxyArgs = verbose ? ['--verbose'] : [];
  // Use process.execPath for Windows compatibility (CVE-2024-27980)
  // Pass environment variables to proxy subprocess (required for auth)
  const proxy = spawn(process.execPath, [proxyPath, ...proxyArgs], {
    stdio: ['ignore', 'pipe', verbose ? 'pipe' : 'inherit'],
    env: {
      ...process.env,
      ANTHROPIC_AUTH_TOKEN: apiKey,
      ANTHROPIC_BASE_URL: envData['ANTHROPIC_BASE_URL'],
    },
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
    console.error(fail(`Error: ${err.message}`));
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
  const webSearchEnv = getWebSearchHookEnv();
  const env = {
    ...process.env,
    ...envVars,
    ...webSearchEnv,
    CCS_PROFILE_TYPE: 'settings', // Signal to WebSearch hook this is a third-party provider
  };

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
    console.error(fail(`Claude CLI error: ${error}`));
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

/**
 * Perform background update check (refreshes cache, no notification)
 */
async function refreshUpdateCache(): Promise<void> {
  try {
    const currentVersion = getVersion();
    // npm is now the only supported installation method
    await checkForUpdates(currentVersion, true, 'npm');
  } catch (_e) {
    // Silently fail - update check shouldn't crash main CLI
  }
}

/**
 * Show update notification if cached result indicates update available
 * Returns true if notification was shown
 */
async function showCachedUpdateNotification(): Promise<boolean> {
  try {
    const currentVersion = getVersion();
    const updateInfo = checkCachedUpdate(currentVersion);

    if (updateInfo) {
      await showUpdateNotification(updateInfo);
      return true;
    }
  } catch (_e) {
    // Silently fail
  }
  return false;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const firstArg = args[0];

  // Initialize UI colors early to ensure consistent colored output
  // Must happen before any status messages (ok, info, fail, etc.)
  if (process.stdout.isTTY && !process.env['CI']) {
    const { initUI } = await import('./utils/ui');
    await initUI();
  }

  // Trigger update check early for ALL commands except version/help/update
  // Only if TTY and not CI to avoid noise in automated environments
  const skipUpdateCheck = [
    'version',
    '--version',
    '-v',
    'help',
    '--help',
    '-h',
    'update',
    '--update',
  ];
  if (process.stdout.isTTY && !process.env['CI'] && !skipUpdateCheck.includes(firstArg)) {
    // 1. Show cached update notification (async for proper UI)
    await showCachedUpdateNotification();

    // 2. Refresh cache in background if stale (non-blocking)
    if (isCacheStale()) {
      refreshUpdateCache();
    }
  }

  // Auto-migrate to unified config format (silent if already migrated)
  // Skip if user is explicitly running migrate command
  if (firstArg !== 'migrate') {
    const { autoMigrate } = await import('./config/migration-manager');
    await autoMigrate();
  }

  // Auto-recovery for missing configuration (BEFORE any early-exit commands)
  // This ensures ALL commands benefit from auto-recovery, not just profile-switching flow
  // Recovery is safe to run early - it only creates missing files with safe defaults
  // Wrapped in try-catch to prevent blocking --version/--help on permission errors
  try {
    const RecoveryManagerModule = await import('./management/recovery-manager');
    const RecoveryManager = RecoveryManagerModule.default;
    const recovery = new RecoveryManager();
    const recovered = recovery.recoverAll();

    if (recovered) {
      recovery.showRecoveryHints();
    }
  } catch (err) {
    // Recovery is best-effort - don't block basic CLI functionality
    console.warn('[!] Recovery failed:', (err as Error).message);
  }

  // Special case: version command (check BEFORE profile detection)
  if (firstArg === 'version' || firstArg === '--version' || firstArg === '-v') {
    handleVersionCommand();
  }

  // Special case: help command
  if (firstArg === '--help' || firstArg === '-h' || firstArg === 'help') {
    await handleHelpCommand();
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
    const shouldFix = args.includes('--fix') || args.includes('-f');
    await handleDoctorCommand(shouldFix);
    return;
  }

  // Special case: sync command
  if (firstArg === 'sync' || firstArg === '--sync') {
    await handleSyncCommand();
    return;
  }

  // Special case: cleanup command
  if (firstArg === 'cleanup' || firstArg === '--cleanup') {
    const { handleCleanupCommand } = await import('./commands/cleanup-command');
    await handleCleanupCommand(args.slice(1));
    return;
  }

  // Special case: migrate command
  if (firstArg === 'migrate' || firstArg === '--migrate') {
    const { handleMigrateCommand, printMigrateHelp } = await import('./commands/migrate-command');
    const migrateArgs = args.slice(1);

    if (migrateArgs.includes('--help') || migrateArgs.includes('-h')) {
      printMigrateHelp();
      return;
    }

    await handleMigrateCommand(migrateArgs);
    return;
  }

  // Special case: update command
  if (firstArg === 'update' || firstArg === '--update') {
    const updateArgs = args.slice(1);

    // Handle --help for update command
    if (updateArgs.includes('--help') || updateArgs.includes('-h')) {
      console.log('');
      console.log('Usage: ccs update [options]');
      console.log('');
      console.log('Options:');
      console.log('  --force       Force reinstall current version');
      console.log('  --beta, --dev Install from dev channel (unstable)');
      console.log('  --help, -h    Show this help message');
      console.log('');
      console.log('Examples:');
      console.log('  ccs update           Update to latest stable');
      console.log('  ccs update --force   Force reinstall');
      console.log('  ccs update --beta    Install dev channel');
      console.log('');
      return;
    }

    const forceFlag = updateArgs.includes('--force');
    const betaFlag = updateArgs.includes('--beta') || updateArgs.includes('--dev');
    await handleUpdateCommand({ force: forceFlag, beta: betaFlag });
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

  // Special case: api command (manages API profiles)
  if (firstArg === 'api') {
    const { handleApiCommand } = await import('./commands/api-command');
    await handleApiCommand(args.slice(1));
    return;
  }

  // Special case: cliproxy command (manages CLIProxyAPI binary)
  if (firstArg === 'cliproxy') {
    const { handleCliproxyCommand } = await import('./commands/cliproxy-command');
    await handleCliproxyCommand(args.slice(1));
    return;
  }

  // Special case: router command (multi-provider tier routing)
  if (firstArg === 'router') {
    const { handleRouterCommand } = await import('./router/cli');
    await handleRouterCommand(args.slice(1));
    return;
  }

  // Special case: config command (web dashboard)
  if (firstArg === 'config') {
    const { handleConfigCommand } = await import('./commands/config-command');
    await handleConfigCommand(args.slice(1));
    return;
  }

  // Special case: tokens command (auth token management)
  if (firstArg === 'tokens') {
    const { handleTokensCommand } = await import('./commands/tokens-command');
    const exitCode = await handleTokensCommand(args.slice(1));
    process.exit(exitCode);
  }

  // Special case: setup command (first-time wizard)
  if (firstArg === 'setup' || firstArg === '--setup') {
    const { handleSetupCommand } = await import('./commands/setup-command');
    await handleSetupCommand(args.slice(1));
    return;
  }

  // Special case: copilot command (GitHub Copilot integration)
  // Only route to command handler for known subcommands, otherwise treat as profile
  const COPILOT_SUBCOMMANDS = [
    'auth',
    'status',
    'models',
    'start',
    'stop',
    'enable',
    'disable',
    'help',
    '--help',
    '-h',
  ];
  if (firstArg === 'copilot' && args.length > 1 && COPILOT_SUBCOMMANDS.includes(args[1])) {
    // `ccs copilot <subcommand>` - route to copilot command handler
    const { handleCopilotCommand } = await import('./commands/copilot-command');
    const exitCode = await handleCopilotCommand(args.slice(1));
    process.exit(exitCode);
  }

  // Special case: headless delegation (-p flag)
  if (args.includes('-p') || args.includes('--prompt')) {
    const { DelegationHandler } = await import('./delegation/delegation-handler');
    const handler = new DelegationHandler();
    await handler.route(args);
    return;
  }

  // First-time install: offer setup wizard for interactive users
  // Check independently of recovery status (user may have empty config.yaml)
  // Skip if headless, CI, or non-TTY environment
  const { isFirstTimeInstall } = await import('./commands/setup-command');
  if (process.stdout.isTTY && !process.env['CI'] && isFirstTimeInstall()) {
    console.log('');
    console.log(info('First-time install detected. Run `ccs setup` for guided configuration.'));
    console.log('    Or use `ccs config` for the web dashboard.');
    console.log('');
  }

  // Detect profile
  const { profile, remainingArgs } = detectProfile(args);

  // Detect Claude CLI first (needed for all paths)
  const claudeCli = detectClaudeCli();
  if (!claudeCli) {
    await ErrorManager.showClaudeNotFound();
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
      const variantPort = profileInfo.port; // variant-specific port for isolation
      await execClaudeWithCLIProxy(claudeCli, provider, remainingArgs, {
        customSettingsPath,
        port: variantPort,
      });
    } else if (profileInfo.type === 'router') {
      // ROUTER FLOW: Multi-provider tier routing
      const { runRouterSession } = await import('./router/lifecycle');
      const routerProfile = profileInfo.routerProfile;
      if (!routerProfile) {
        console.error(fail('Router profile configuration not found'));
        process.exit(1);
      }
      const exitCode = await runRouterSession(profileInfo.name, remainingArgs);
      process.exit(exitCode);
    } else if (profileInfo.type === 'copilot') {
      // COPILOT FLOW: GitHub Copilot subscription via copilot-api proxy
      const { executeCopilotProfile } = await import('./copilot');
      const copilotConfig = profileInfo.copilotConfig;
      if (!copilotConfig) {
        console.error(fail('Copilot configuration not found'));
        process.exit(1);
      }
      const exitCode = await executeCopilotProfile(copilotConfig, remainingArgs);
      process.exit(exitCode);
    } else if (profileInfo.type === 'settings') {
      // Settings-based profiles (glm, glmt, kimi) are third-party providers
      // WebSearch is server-side tool - third-party providers have no access
      ensureMcpWebSearch();
      installWebSearchHook();

      // Display WebSearch status (single line, equilibrium UX)
      displayWebSearchStatus();

      // Pre-flight validation for GLM/GLMT/MiniMax profiles
      if (profileInfo.name === 'glm' || profileInfo.name === 'glmt') {
        const preflightSettingsPath = getSettingsPath(profileInfo.name);
        const preflightSettings = loadSettings(preflightSettingsPath);
        const apiKey = preflightSettings.env?.['ANTHROPIC_AUTH_TOKEN'];

        if (apiKey) {
          const validation = await validateGlmKey(
            apiKey,
            preflightSettings.env?.['ANTHROPIC_BASE_URL']
          );

          if (!validation.valid) {
            console.error('');
            console.error(fail(validation.error || 'API key validation failed'));
            if (validation.suggestion) {
              console.error('');
              console.error(validation.suggestion);
            }
            console.error('');
            console.error(info('To skip validation: CCS_SKIP_PREFLIGHT=1 ccs glm "prompt"'));
            process.exit(1);
          }
        }
      }

      if (profileInfo.name === 'mm') {
        const preflightSettingsPath = getSettingsPath(profileInfo.name);
        const preflightSettings = loadSettings(preflightSettingsPath);
        const apiKey = preflightSettings.env?.['ANTHROPIC_AUTH_TOKEN'];

        if (apiKey) {
          const validation = await validateMiniMaxKey(
            apiKey,
            preflightSettings.env?.['ANTHROPIC_BASE_URL']
          );

          if (!validation.valid) {
            console.error('');
            console.error(fail(validation.error || 'API key validation failed'));
            if (validation.suggestion) {
              console.error('');
              console.error(validation.suggestion);
            }
            console.error('');
            console.error(info('To skip validation: CCS_SKIP_PREFLIGHT=1 ccs mm "prompt"'));
            process.exit(1);
          }
        }
      }

      // Check if this is GLMT profile (requires proxy)
      if (profileInfo.name === 'glmt') {
        // GLMT FLOW: Settings-based with embedded proxy for thinking support
        await execClaudeWithProxy(claudeCli, profileInfo.name, remainingArgs);
      } else {
        // EXISTING FLOW: Settings-based profile (glm, kimi)
        // Use --settings flag (backward compatible)
        const expandedSettingsPath = getSettingsPath(profileInfo.name);
        const webSearchEnv = getWebSearchHookEnv();
        // Get global env vars (DISABLE_TELEMETRY, etc.) for third-party profiles
        const globalEnvConfig = getGlobalEnvConfig();
        const globalEnv = globalEnvConfig.enabled ? globalEnvConfig.env : {};

        // Log global env injection for visibility (debug mode only)
        if (globalEnvConfig.enabled && Object.keys(globalEnv).length > 0 && process.env.CCS_DEBUG) {
          const envNames = Object.keys(globalEnv).join(', ');
          console.error(info(`Global env: ${envNames}`));
        }

        // CRITICAL: Load settings and explicitly set ANTHROPIC_* env vars
        // to prevent inheriting stale values from previous CLIProxy sessions.
        // Environment variables take precedence over --settings file values,
        // so we must explicitly set them here to ensure correct routing.
        const settings = loadSettings(expandedSettingsPath);
        const settingsEnv = settings.env || {};

        const envVars: NodeJS.ProcessEnv = {
          ...globalEnv,
          ...settingsEnv, // Explicitly inject all settings env vars
          ...webSearchEnv,
          CCS_PROFILE_TYPE: 'settings', // Signal to WebSearch hook this is a third-party provider
        };
        execClaude(claudeCli, ['--settings', expandedSettingsPath, ...remainingArgs], envVars);
      }
    } else if (profileInfo.type === 'account') {
      // NEW FLOW: Account-based profile (work, personal)
      // All platforms: Use instance isolation with CLAUDE_CONFIG_DIR
      const registry = new ProfileRegistry();
      const instanceMgr = new InstanceManager();

      // Ensure instance exists (lazy init if needed)
      const instancePath = instanceMgr.ensureInstance(profileInfo.name);

      // Update last_used timestamp (check unified config first, fallback to legacy)
      if (registry.hasAccountUnified(profileInfo.name)) {
        registry.touchAccountUnified(profileInfo.name);
      } else {
        registry.touchProfile(profileInfo.name);
      }

      // Execute Claude with instance isolation
      // Skip WebSearch hook - account profiles use native server-side WebSearch
      const envVars: NodeJS.ProcessEnv = {
        CLAUDE_CONFIG_DIR: instancePath,
        CCS_PROFILE_TYPE: 'account',
        CCS_WEBSEARCH_SKIP: '1',
      };
      execClaude(claudeCli, remainingArgs, envVars);
    } else {
      // DEFAULT: No profile configured, use Claude's own defaults
      // Skip WebSearch hook - native Claude has server-side WebSearch
      const envVars: NodeJS.ProcessEnv = {
        CCS_PROFILE_TYPE: 'default',
        CCS_WEBSEARCH_SKIP: '1',
      };
      execClaude(claudeCli, remainingArgs, envVars);
    }
  } catch (error) {
    const err = error as ProfileError;
    // Check if this is a profile not found error with suggestions
    if (err.profileName && err.availableProfiles !== undefined) {
      const allProfiles = err.availableProfiles.split('\n');
      await ErrorManager.showProfileNotFound(err.profileName, allProfiles, err.suggestions);
    } else {
      console.error(fail(err.message));
    }
    process.exit(1);
  }
}

// ========== Global Error Handlers ==========

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  handleError(error);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: unknown) => {
  handleError(reason);
});

// Handle process termination signals for cleanup
process.on('SIGTERM', () => {
  runCleanup();
  process.exit(0);
});

process.on('SIGINT', () => {
  runCleanup();
  process.exit(130); // 128 + SIGINT(2)
});

// Run main
main().catch(handleError);
