import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { detectClaudeCli } from './utils/claude-detector';
import {
  getSettingsPath,
  loadSettings,
  getCcsDir,
  setGlobalConfigDir,
  detectCloudSyncPath,
} from './utils/config-manager';
import { expandPath } from './utils/helpers';
import { validateGlmKey, validateMiniMaxKey } from './utils/api-key-validator';
import { ErrorManager } from './utils/error-manager';
import {
  execClaudeWithCLIProxy,
  CLIProxyProvider,
  ensureCliproxyService,
  isAuthenticated,
} from './cliproxy';
import { getEffectiveEnvVars, getCompositeEnvVars } from './cliproxy/config/env-builder';
import { CLIPROXY_DEFAULT_PORT } from './cliproxy/config/port-manager';
import {
  ensureMcpWebSearch,
  displayWebSearchStatus,
  getWebSearchHookEnv,
  ensureProfileHooks,
} from './utils/websearch-manager';
import { getGlobalEnvConfig } from './config/unified-config-loader';
import { ensureProfileHooks as ensureImageAnalyzerHooks } from './utils/hooks/image-analyzer-profile-hook-injector';
import { getImageAnalysisHookEnv } from './utils/hooks';
import { fail, info, warn } from './utils/ui';
import { isCopilotSubcommandToken } from './copilot/constants';

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
import {
  execClaude,
  escapeShellArg,
  stripClaudeCodeEnv,
  getClaudeLaunchEnvOverrides,
} from './utils/shell-executor';
import { wireChildProcessSignals } from './utils/signal-forwarder';

// Import target adapter system
import {
  registerTarget,
  getTarget,
  ClaudeAdapter,
  DroidAdapter,
  pruneOrphanedModels,
  resolveDroidProvider,
  type TargetCredentials,
} from './targets';
import { resolveTargetType, stripTargetFlag } from './targets/target-resolver';
import {
  DroidReasoningFlagError,
  resolveDroidReasoningRuntime,
} from './targets/droid-reasoning-runtime';
import { DroidCommandRouterError, routeDroidCommandArgs } from './targets/droid-command-router';

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
  args: string[],
  claudeConfigDir?: string
): Promise<void> {
  // 1. Read settings to get API key
  const settingsPath = getSettingsPath(profileName);
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const envData = settings.env;
  const apiKey = envData['ANTHROPIC_AUTH_TOKEN'];

  if (!apiKey || apiKey === 'YOUR_GLM_API_KEY_HERE') {
    console.error(fail('GLMT profile requires Z.AI API key'));
    console.error(`    Edit ${getCcsDir()}/glmt.settings.json and set ANTHROPIC_AUTH_TOKEN`);
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
  const stopProxy = (): void => {
    try {
      if (!proxy.killed) {
        proxy.kill('SIGTERM');
      }
    } catch {
      // Best-effort cleanup on process teardown.
    }
  };

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
    console.error(`  - Check proxy logs in ${getCcsDir()}/logs/ (if debug enabled)`);
    console.error('');
    stopProxy();
    runCleanup();
    process.exit(1);
  }

  // 4. Spawn Claude CLI with proxy URL
  // Use model from user's settings (not hardcoded) - fixes issue #358
  const configuredModel = envData['ANTHROPIC_MODEL'] || 'glm-5';
  const envVars: NodeJS.ProcessEnv = {
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
    ANTHROPIC_AUTH_TOKEN: apiKey,
    ANTHROPIC_MODEL: configuredModel,
    ...(claudeConfigDir ? { CLAUDE_CONFIG_DIR: claudeConfigDir } : {}),
  };

  const isWindows = process.platform === 'win32';
  const isPowerShellScript = isWindows && /\.ps1$/i.test(claudeCli);
  const needsShell = isWindows && /\.(cmd|bat)$/i.test(claudeCli);
  const webSearchEnv = getWebSearchHookEnv();
  const imageAnalysisEnv = getImageAnalysisHookEnv(profileName);
  const claudeLaunchEnv = getClaudeLaunchEnvOverrides();
  const env = stripClaudeCodeEnv({
    ...process.env,
    ...claudeLaunchEnv,
    ...envVars,
    ...webSearchEnv,
    ...imageAnalysisEnv,
    CCS_PROFILE_TYPE: 'settings', // Signal to WebSearch hook this is a third-party provider
  });

  let claude: ChildProcess;
  if (isPowerShellScript) {
    claude = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', claudeCli, ...args],
      {
        stdio: 'inherit',
        windowsHide: true,
        env,
      }
    );
  } else if (needsShell) {
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

  // 5. Shared signal forwarding + proxy cleanup lifecycle
  wireChildProcessSignals(
    claude,
    (err: NodeJS.ErrnoException) => {
      if (err.code === 'EACCES') {
        console.error(fail(`Claude CLI is not executable: ${claudeCli}`));
        console.error('    Check file permissions and executable bit.');
      } else if (err.code === 'ENOENT') {
        if (isPowerShellScript) {
          console.error(
            fail('PowerShell executable not found (required for .ps1 wrapper launch).')
          );
          console.error('    Ensure powershell.exe is available in PATH.');
        } else if (needsShell) {
          console.error(fail('Windows command shell not found for Claude wrapper launch.'));
          console.error('    Ensure cmd.exe is available and accessible.');
        } else {
          console.error(fail(`Claude CLI not found: ${claudeCli}`));
        }
      } else {
        console.error(fail(`Claude CLI error: ${err.message}`));
      }
      stopProxy();
      runCleanup();
      process.exit(1);
    },
    (code: number | null, signal: NodeJS.Signals | null) => {
      stopProxy();
      if (signal) {
        process.kill(process.pid, signal);
      } else {
        process.exit(code || 0);
      }
    }
  );
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
  // Register target adapters
  registerTarget(new ClaudeAdapter());
  registerTarget(new DroidAdapter());

  const args = process.argv.slice(2);

  // Initialize UI colors early to ensure consistent colored output
  // Must happen before any status messages (ok, info, fail, etc.)
  if (process.stdout.isTTY && !process.env['CI']) {
    const { initUI } = await import('./utils/ui');
    await initUI();
  }

  // Parse --config-dir flag (must happen before any config loading)
  const configDirIdx = args.findIndex((a) => a === '--config-dir' || a.startsWith('--config-dir='));
  if (configDirIdx !== -1) {
    const arg = args[configDirIdx];
    let configDirValue: string | undefined;
    let spliceCount = 1;

    if (arg.startsWith('--config-dir=')) {
      configDirValue = arg.split('=').slice(1).join('=');
    } else {
      configDirValue = args[configDirIdx + 1];
      spliceCount = 2;
    }

    if (!configDirValue || configDirValue.startsWith('-')) {
      console.error(fail('--config-dir requires a path argument'));
      process.exit(1);
    }

    try {
      const stat = fs.statSync(configDirValue);
      if (!stat.isDirectory()) {
        console.error(fail(`Not a directory: ${configDirValue}`));
        process.exit(1);
      }
    } catch {
      console.error(fail(`Config directory not found: ${configDirValue}`));
      console.error(info('Create the directory first, then copy your config files into it.'));
      process.exit(1);
    }

    setGlobalConfigDir(configDirValue);

    // Security warning: cloud sync paths expose OAuth tokens
    const cloudService = detectCloudSyncPath(configDirValue);
    if (cloudService) {
      console.error(warn(`CCS directory is under ${cloudService}.`));
      console.error('    OAuth tokens in cliproxy/auth/ will be synced to cloud.');
      console.error('    Consider: CCS_DIR=/path/outside/cloud ccs ...');
    }

    // Remove consumed args so they don't leak to Claude CLI
    args.splice(configDirIdx, spliceCount);
  } else if (process.env.CCS_DIR) {
    // Also warn for CCS_DIR env var pointing to cloud sync
    const cloudService = detectCloudSyncPath(process.env.CCS_DIR);
    if (cloudService) {
      console.error(warn(`CCS directory is under ${cloudService}.`));
      console.error('    OAuth tokens in cliproxy/auth/ will be synced to cloud.');
      console.error('    Consider: CCS_DIR=/path/outside/cloud ccs ...');
    }
  } else if (process.env.CCS_HOME) {
    // Also warn for CCS_HOME env var pointing to cloud sync
    const cloudService = detectCloudSyncPath(process.env.CCS_HOME);
    if (cloudService) {
      console.error(warn(`CCS directory is under ${cloudService}.`));
      console.error('    OAuth tokens in cliproxy/auth/ will be synced to cloud.');
      console.error('    Consider: CCS_DIR=/path/outside/cloud ccs ...');
    }
  }

  const firstArg = args[0];

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

  const commandAliases: Record<string, string> = {
    '--version': 'version',
    '-v': 'version',
    '--help': 'help',
    '-h': 'help',
    '--doctor': 'doctor',
    '--sync': 'sync',
    '--cleanup': 'cleanup',
    '--setup': 'setup',
  };

  const normalizedFirstArg = commandAliases[firstArg] || firstArg;

  const earlyCommandHandlers: Record<string, () => Promise<void>> = {
    version: async () => handleVersionCommand(),
    help: async () => handleHelpCommand(),
    '--install': async () => handleInstallCommand(),
    '--uninstall': async () => handleUninstallCommand(),
    '--shell-completion': async () => handleShellCompletionCommand(args.slice(1)),
    '-sc': async () => handleShellCompletionCommand(args.slice(1)),
    doctor: async () => handleDoctorCommand(args.slice(1)),
    sync: async () => handleSyncCommand(),
    cleanup: async () => {
      const { handleCleanupCommand } = await import('./commands/cleanup-command');
      await handleCleanupCommand(args.slice(1));
    },
    auth: async () => {
      const AuthCommandsModule = await import('./auth/auth-commands');
      const AuthCommands = AuthCommandsModule.default;
      const authCommands = new AuthCommands();
      await authCommands.route(args.slice(1));
    },
    api: async () => {
      const { handleApiCommand } = await import('./commands/api-command');
      await handleApiCommand(args.slice(1));
    },
    cliproxy: async () => {
      const { handleCliproxyCommand } = await import('./commands/cliproxy-command');
      await handleCliproxyCommand(args.slice(1));
    },
    config: async () => {
      const { handleConfigCommand } = await import('./commands/config-command');
      await handleConfigCommand(args.slice(1));
    },
    tokens: async () => {
      const { handleTokensCommand } = await import('./commands/tokens-command');
      const exitCode = await handleTokensCommand(args.slice(1));
      process.exit(exitCode);
    },
    persist: async () => {
      const { handlePersistCommand } = await import('./commands/persist-command');
      await handlePersistCommand(args.slice(1));
    },
    env: async () => {
      const { handleEnvCommand } = await import('./commands/env-command');
      await handleEnvCommand(args.slice(1));
    },
    setup: async () => {
      const { handleSetupCommand } = await import('./commands/setup-command');
      await handleSetupCommand(args.slice(1));
    },
    cursor: async () => {
      const { handleCursorCommand } = await import('./commands/cursor-command');
      const exitCode = await handleCursorCommand(args.slice(1));
      process.exit(exitCode);
    },
    skills: async () => {
      const { handleSkillsCommand } = await import('./commands/skills-command');
      await handleSkillsCommand(args.slice(1));
    },
  };

  const earlyCommandHandler = earlyCommandHandlers[normalizedFirstArg];
  if (earlyCommandHandler) {
    await earlyCommandHandler();
    return;
  }

  // Special case: copilot command (GitHub Copilot integration)
  // Route known subcommands to command handler, keep all other args as profile passthrough.
  if (firstArg === 'copilot' && args.length > 1) {
    const copilotToken = args[1];
    const shouldRouteToCopilotCommand = isCopilotSubcommandToken(copilotToken);

    if (shouldRouteToCopilotCommand) {
      const { handleCopilotCommand } = await import('./commands/copilot-command');
      const exitCode = await handleCopilotCommand(args.slice(1));
      process.exit(exitCode);
    }
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

  // Use ProfileDetector to determine profile type
  const ProfileDetectorModule = await import('./auth/profile-detector');
  const ProfileDetector = ProfileDetectorModule.default;
  const InstanceManagerModule = await import('./management/instance-manager');
  const InstanceManager = InstanceManagerModule.default;
  const ProfileRegistryModule = await import('./auth/profile-registry');
  const ProfileRegistry = ProfileRegistryModule.default;
  const AccountContextModule = await import('./auth/account-context');
  const { resolveAccountContextPolicy, isAccountContextMetadata } = AccountContextModule;
  const ProfileContinuityModule = await import('./auth/profile-continuity-inheritance');
  const { resolveProfileContinuityInheritance } = ProfileContinuityModule;

  const detector = new ProfileDetector();

  try {
    // Detect profile (strip --target flags before profile detection)
    const cleanArgs = stripTargetFlag(args);
    const { profile, remainingArgs } = detectProfile(cleanArgs);
    const profileInfo = detector.detectProfileType(profile);
    let resolvedTarget: ReturnType<typeof resolveTargetType>;
    try {
      resolvedTarget = resolveTargetType(
        args,
        profileInfo.target ? { target: profileInfo.target } : undefined
      );
    } catch (error) {
      console.error(fail((error as Error).message));
      process.exit(1);
      return;
    }

    // Detect Claude CLI (needed for claude target and all CLIProxy-derived flows)
    const claudeCliRaw = detectClaudeCli();
    if (resolvedTarget === 'claude' && !claudeCliRaw) {
      await ErrorManager.showClaudeNotFound();
      process.exit(1);
    }
    const claudeCli = claudeCliRaw || '';

    // Resolve non-claude target adapter once.
    const targetAdapter = resolvedTarget !== 'claude' ? getTarget(resolvedTarget) : null;

    // Preflight unsupported profile/target combinations BEFORE binary detection,
    // so users get the most actionable error even when the target CLI is not installed.
    if (resolvedTarget !== 'claude') {
      if (!targetAdapter) {
        console.error(fail(`Target adapter not found for "${resolvedTarget}"`));
        process.exit(1);
      }

      if (profileInfo.type === 'cliproxy' && !targetAdapter.supportsProfileType('cliproxy')) {
        console.error(fail(`${targetAdapter.displayName} does not support CLIProxy profiles`));
        console.error(info('Use a settings-based profile with --target instead'));
        process.exit(1);
      }

      if (profileInfo.type === 'copilot' && !targetAdapter.supportsProfileType('copilot')) {
        console.error(fail(`${targetAdapter.displayName} does not support Copilot profiles`));
        process.exit(1);
      }

      if (profileInfo.type === 'account' && !targetAdapter.supportsProfileType('account')) {
        console.error(fail(`${targetAdapter.displayName} does not support account-based profiles`));
        console.error(info('Use a settings-based profile with --target instead'));
        process.exit(1);
      }

      // GLMT always requires Claude target because it depends on embedded proxy flow.
      if (profileInfo.type === 'settings' && profileInfo.name === 'glmt') {
        console.error(fail(`${targetAdapter.displayName} does not support GLMT proxy profiles`));
        console.error(
          info('Use --target claude for glmt, or switch to a direct API profile (glm/km)')
        );
        process.exit(1);
      }

      if (profileInfo.type === 'default') {
        if (!targetAdapter.supportsProfileType('default')) {
          console.error(fail(`${targetAdapter.displayName} does not support default profile mode`));
          process.exit(1);
        }

        // For default mode, Droid requires explicit credentials from environment.
        if (resolvedTarget === 'droid') {
          const baseUrl = process.env['ANTHROPIC_BASE_URL'] || '';
          const apiKey = process.env['ANTHROPIC_AUTH_TOKEN'] || '';
          if (!baseUrl.trim() || !apiKey.trim()) {
            console.error(
              fail(
                `${targetAdapter.displayName} default mode requires ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN`
              )
            );
            console.error(info('Use a settings-based profile instead: ccs glm --target droid'));
            process.exit(1);
          }
        }
      }
    }

    // For non-claude targets, verify target binary exists once and pass it through.
    const targetBinaryInfo = targetAdapter?.detectBinary() ?? null;
    if (resolvedTarget !== 'claude' && !targetBinaryInfo) {
      const displayName = targetAdapter?.displayName || resolvedTarget;
      console.error(fail(`${displayName} CLI not found.`));
      if (resolvedTarget === 'droid') {
        console.error(info('Install: npm i -g @factory/cli'));
      }
      process.exit(1);
    }

    // Best-effort: prune stale Droid model entries at runtime so settings.json stays clean.
    if (resolvedTarget === 'droid') {
      try {
        const allProfiles = detector.getAllProfiles();
        const activeProfiles = allProfiles.settings.filter((name) =>
          /^[a-zA-Z0-9._-]+$/.test(name)
        );
        await pruneOrphanedModels(activeProfiles);
      } catch (error) {
        console.error(warn(`[!] Droid prune skipped: ${(error as Error).message}`));
      }
    }

    let targetRemainingArgs = remainingArgs;
    let droidReasoningOverride: string | number | undefined;
    if (resolvedTarget === 'droid') {
      try {
        const droidRoute = routeDroidCommandArgs(remainingArgs);
        targetRemainingArgs = droidRoute.argsForDroid;

        if (droidRoute.mode === 'interactive') {
          const runtime = resolveDroidReasoningRuntime(remainingArgs, process.env.CCS_THINKING);
          targetRemainingArgs = runtime.argsWithoutReasoningFlags;
          droidReasoningOverride = runtime.reasoningOverride;

          if (runtime.duplicateDisplays.length > 0) {
            console.error(
              warn(
                `[!] Multiple reasoning flags detected. Using first occurrence: ${runtime.sourceDisplay || '<first-flag>'}`
              )
            );
          }
        } else {
          if (droidRoute.duplicateReasoningDisplays.length > 0) {
            console.error(
              warn(
                `[!] Multiple reasoning flags detected. Using first occurrence: ${droidRoute.reasoningSourceDisplay || '<first-flag>'}`
              )
            );
          }
          if (droidRoute.autoPrependedExec && process.stdout.isTTY) {
            console.error(
              info('Detected Droid exec-only flags. Routing as: droid exec <flags> [prompt]')
            );
          }
        }
      } catch (error) {
        if (error instanceof DroidReasoningFlagError || error instanceof DroidCommandRouterError) {
          console.error(fail(error.message));
          console.error('    Examples: --thinking low, --thinking 8192, --thinking off');
          console.error('    Codex alias: --effort medium|high|xhigh');
          console.error('    Droid exec: --reasoning-effort high');
          process.exit(1);
        }
        throw error;
      }
    }

    // Special case: headless delegation (-p/--prompt)
    // Keep existing behavior for Claude targets only; non-claude targets must continue
    // through normal adapter dispatch logic.
    if (args.includes('-p') || args.includes('--prompt')) {
      const shouldUseDelegation = resolvedTarget === 'claude' && profileInfo.type !== 'cliproxy';
      if (shouldUseDelegation) {
        const { DelegationHandler } = await import('./delegation/delegation-handler');
        const handler = new DelegationHandler();
        await handler.route(cleanArgs);
        return;
      }
    }

    if (profileInfo.type === 'cliproxy') {
      // CLIPROXY FLOW: OAuth-based profiles (gemini, codex, agy, qwen) or user-defined variants
      // Inject WebSearch hook into profile settings before launch
      ensureProfileHooks(profileInfo.name);
      // Inject Image Analyzer hook into profile settings before launch
      ensureImageAnalyzerHooks(profileInfo.name);

      const provider = profileInfo.provider || (profileInfo.name as CLIProxyProvider);
      const customSettingsPath = profileInfo.settingsPath; // undefined for hardcoded profiles
      const variantPort = profileInfo.port; // variant-specific port for isolation
      const cliproxyPort = variantPort || CLIPROXY_DEFAULT_PORT;

      if (resolvedTarget !== 'claude') {
        const adapter = targetAdapter;
        if (!adapter) {
          console.error(fail(`Target adapter not found for "${resolvedTarget}"`));
          process.exitCode = 1;
          return;
        }
        if (!adapter.supportsProfileType('cliproxy')) {
          console.error(fail(`${adapter.displayName} does not support CLIProxy profiles`));
          process.exitCode = 1;
          return;
        }

        // Keep CLIProxy management/auth flags on Claude flow only.
        const unsupportedCliproxyFlags = [
          '--auth',
          '--logout',
          '--accounts',
          '--add',
          '--use',
          '--config',
          '--headless',
          '--paste-callback',
          '--port-forward',
          '--nickname',
          '--kiro-auth-method',
          '--backend',
          '--proxy-host',
          '--proxy-port',
          '--proxy-protocol',
          '--proxy-auth-token',
          '--proxy-timeout',
          '--local-proxy',
          '--remote-only',
          '--no-fallback',
          '--allow-self-signed',
          '--1m',
          '--no-1m',
        ];
        const providedUnsupportedFlag = unsupportedCliproxyFlags.find(
          (flag) =>
            targetRemainingArgs.includes(flag) ||
            targetRemainingArgs.some((arg) => arg.startsWith(`${flag}=`))
        );
        if (providedUnsupportedFlag) {
          console.error(
            fail(
              `${providedUnsupportedFlag} is only supported when running CLIProxy profiles on Claude target`
            )
          );
          console.error(
            info(`Run with Claude target: ccs ${profileInfo.name} --target claude ...`)
          );
          process.exitCode = 1;
          return;
        }

        // For Droid execution path, require existing OAuth auth and running local proxy.
        if (profileInfo.isComposite && profileInfo.compositeTiers) {
          const compositeProviders = [
            ...new Set(Object.values(profileInfo.compositeTiers).map((tier) => tier.provider)),
          ] as CLIProxyProvider[];
          const missingProvider = compositeProviders.find((p) => !isAuthenticated(p));
          if (missingProvider) {
            console.error(
              fail(`Missing OAuth auth for composite tier provider: ${missingProvider}`)
            );
            console.error(info(`Authenticate first: ccs ${missingProvider} --auth`));
            process.exitCode = 1;
            return;
          }
        } else if (!isAuthenticated(provider)) {
          console.error(fail(`No OAuth authentication found for provider: ${provider}`));
          console.error(info(`Authenticate first: ccs ${provider} --auth`));
          process.exitCode = 1;
          return;
        }

        const ensureServiceResult = await ensureCliproxyService(
          cliproxyPort,
          targetRemainingArgs.includes('--verbose') || targetRemainingArgs.includes('-v')
        );
        if (!ensureServiceResult.started) {
          console.error(
            fail(ensureServiceResult.error || 'Failed to start local CLIProxy service')
          );
          process.exitCode = 1;
          return;
        }

        const envVars =
          profileInfo.isComposite && profileInfo.compositeTiers && profileInfo.compositeDefaultTier
            ? getCompositeEnvVars(
                profileInfo.compositeTiers,
                profileInfo.compositeDefaultTier,
                cliproxyPort,
                customSettingsPath
              )
            : getEffectiveEnvVars(provider, cliproxyPort, customSettingsPath);

        const creds: TargetCredentials = {
          profile: profileInfo.name,
          baseUrl: envVars['ANTHROPIC_BASE_URL'] || '',
          apiKey: envVars['ANTHROPIC_AUTH_TOKEN'] || '',
          model: envVars['ANTHROPIC_MODEL'] || undefined,
          provider: resolveDroidProvider({
            provider: envVars['CCS_DROID_PROVIDER'] || envVars['DROID_PROVIDER'],
            baseUrl: envVars['ANTHROPIC_BASE_URL'],
            model: envVars['ANTHROPIC_MODEL'],
          }),
          reasoningOverride: droidReasoningOverride,
          envVars,
        };

        if (!creds.baseUrl || !creds.apiKey) {
          console.error(
            fail(
              `Missing CLIProxy runtime credentials for ${profileInfo.name} (ANTHROPIC_BASE_URL/AUTH_TOKEN)`
            )
          );
          console.error(
            info('Reconfigure with: ccs config > CLIProxy, or run ccs <provider> --config')
          );
          process.exitCode = 1;
          return;
        }

        await adapter.prepareCredentials(creds);
        const targetArgs = adapter.buildArgs(profileInfo.name, targetRemainingArgs);
        const targetEnv = adapter.buildEnv(creds, profileInfo.type);
        adapter.exec(targetArgs, targetEnv, { binaryInfo: targetBinaryInfo || undefined });
        return;
      }

      await execClaudeWithCLIProxy(claudeCli, provider, remainingArgs, {
        customSettingsPath,
        port: cliproxyPort,
        isComposite: profileInfo.isComposite,
        compositeTiers: profileInfo.compositeTiers,
        compositeDefaultTier: profileInfo.compositeDefaultTier,
        profileName: profileInfo.name,
      });
    } else if (profileInfo.type === 'copilot') {
      // COPILOT FLOW: GitHub Copilot subscription via copilot-api proxy
      // Inject WebSearch hook into profile settings before launch
      ensureProfileHooks(profileInfo.name);
      // Inject Image Analyzer hook into profile settings before launch
      ensureImageAnalyzerHooks(profileInfo.name);

      const { executeCopilotProfile } = await import('./copilot');
      const copilotConfig = profileInfo.copilotConfig;
      if (!copilotConfig) {
        console.error(fail('Copilot configuration not found'));
        process.exit(1);
      }
      const continuityInheritance = await resolveProfileContinuityInheritance({
        profileName: profileInfo.name,
        profileType: profileInfo.type,
        target: resolvedTarget,
      });
      if (continuityInheritance.sourceAccount && process.env.CCS_DEBUG) {
        console.error(
          info(
            `Continuity inheritance active: profile "${profileInfo.name}" -> account "${continuityInheritance.sourceAccount}"`
          )
        );
      }
      const exitCode = await executeCopilotProfile(
        copilotConfig,
        remainingArgs,
        continuityInheritance.claudeConfigDir,
        claudeCli
      );
      process.exit(exitCode);
    } else if (profileInfo.type === 'settings') {
      // Settings-based profiles (glm, glmt) are third-party providers
      // WebSearch is server-side tool - third-party providers have no access
      // Inject WebSearch hook into profile settings before launch
      ensureProfileHooks(profileInfo.name);
      // Inject Image Analyzer hook into profile settings before launch
      ensureImageAnalyzerHooks(profileInfo.name);

      ensureMcpWebSearch();

      // Display WebSearch status (single line, equilibrium UX)
      displayWebSearchStatus();

      const continuityInheritance =
        resolvedTarget === 'claude'
          ? await resolveProfileContinuityInheritance({
              profileName: profileInfo.name,
              profileType: profileInfo.type,
              target: resolvedTarget,
            })
          : {};
      if (continuityInheritance.sourceAccount && process.env.CCS_DEBUG) {
        console.error(
          info(
            `Continuity inheritance active: profile "${profileInfo.name}" -> account "${continuityInheritance.sourceAccount}"`
          )
        );
      }
      const inheritedClaudeConfigDir = continuityInheritance.claudeConfigDir;

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
        if (resolvedTarget !== 'claude') {
          console.error(
            fail(`${targetAdapter?.displayName || 'Target'} does not support GLMT proxy profiles`)
          );
          console.error(
            info('Use --target claude for glmt, or switch to a direct API profile (glm/km)')
          );
          process.exit(1);
        }
        // GLMT FLOW: Settings-based with embedded proxy for thinking support
        await execClaudeWithProxy(
          claudeCli,
          profileInfo.name,
          remainingArgs,
          inheritedClaudeConfigDir
        );
      } else {
        // EXISTING FLOW: Settings-based profile (glm)
        // Use --settings flag (backward compatible)
        const expandedSettingsPath = profileInfo.settingsPath
          ? expandPath(profileInfo.settingsPath)
          : getSettingsPath(profileInfo.name);
        const webSearchEnv = getWebSearchHookEnv();
        const imageAnalysisEnv = getImageAnalysisHookEnv(profileInfo.name);
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
          ...(inheritedClaudeConfigDir ? { CLAUDE_CONFIG_DIR: inheritedClaudeConfigDir } : {}),
          ...webSearchEnv,
          ...imageAnalysisEnv,
          CCS_PROFILE_TYPE: 'settings', // Signal to WebSearch hook this is a third-party provider
        };

        // Dispatch through target adapter for non-claude targets
        if (resolvedTarget !== 'claude') {
          const adapter = targetAdapter;
          if (!adapter) {
            console.error(fail(`Target adapter not found for "${resolvedTarget}"`));
            process.exit(1);
          }
          const creds: TargetCredentials = {
            profile: profileInfo.name,
            baseUrl: settingsEnv['ANTHROPIC_BASE_URL'] || '',
            apiKey: settingsEnv['ANTHROPIC_AUTH_TOKEN'] || '',
            model: settingsEnv['ANTHROPIC_MODEL'],
            provider: resolveDroidProvider({
              provider: settingsEnv['CCS_DROID_PROVIDER'] || settingsEnv['DROID_PROVIDER'],
              baseUrl: settingsEnv['ANTHROPIC_BASE_URL'],
              model: settingsEnv['ANTHROPIC_MODEL'],
            }),
            reasoningOverride: droidReasoningOverride,
          };
          await adapter.prepareCredentials(creds);
          const targetArgs = adapter.buildArgs(profileInfo.name, targetRemainingArgs);
          const targetEnv = adapter.buildEnv(creds, profileInfo.type);
          adapter.exec(targetArgs, targetEnv, { binaryInfo: targetBinaryInfo || undefined });
          return;
        }

        execClaude(claudeCli, ['--settings', expandedSettingsPath, ...remainingArgs], envVars);
      }
    } else if (profileInfo.type === 'account') {
      // NEW FLOW: Account-based profile (work, personal)
      // All platforms: Use instance isolation with CLAUDE_CONFIG_DIR
      const registry = new ProfileRegistry();
      const instanceMgr = new InstanceManager();
      const accountMetadata = isAccountContextMetadata(profileInfo.profile)
        ? profileInfo.profile
        : undefined;
      const isBareProfile =
        typeof profileInfo.profile === 'object' &&
        profileInfo.profile !== null &&
        (profileInfo.profile as { bare?: unknown }).bare === true;
      const contextPolicy = resolveAccountContextPolicy(accountMetadata);

      // Ensure instance exists (lazy init if needed)
      const instancePath = await instanceMgr.ensureInstance(profileInfo.name, contextPolicy, {
        bare: isBareProfile,
      });

      // Update last_used timestamp (check unified config first, fallback to legacy)
      if (registry.hasAccountUnified(profileInfo.name)) {
        registry.touchAccountUnified(profileInfo.name);
      } else {
        registry.touchProfile(profileInfo.name);
      }

      // Execute Claude with instance isolation
      // Skip WebSearch hook - account profiles use native server-side WebSearch
      // Skip Image Analyzer hook - account profiles have native vision support
      const envVars: NodeJS.ProcessEnv = {
        CLAUDE_CONFIG_DIR: instancePath,
        CCS_PROFILE_TYPE: 'account',
        CCS_WEBSEARCH_SKIP: '1',
        CCS_IMAGE_ANALYSIS_SKIP: '1',
      };
      execClaude(claudeCli, remainingArgs, envVars);
    } else {
      // DEFAULT: No profile configured, use Claude's own defaults
      // Skip WebSearch hook - native Claude has server-side WebSearch
      // Skip Image Analyzer hook - native Claude has native vision support
      const envVars: NodeJS.ProcessEnv = {
        CCS_PROFILE_TYPE: 'default',
        CCS_WEBSEARCH_SKIP: '1',
        CCS_IMAGE_ANALYSIS_SKIP: '1',
      };

      if (resolvedTarget === 'claude') {
        const defaultContinuityInheritance = await resolveProfileContinuityInheritance({
          profileName: profileInfo.name,
          profileType: profileInfo.type,
          target: resolvedTarget,
        });
        if (defaultContinuityInheritance.sourceAccount && process.env.CCS_DEBUG) {
          console.error(
            info(
              `Continuity inheritance active: profile "${profileInfo.name}" -> account "${defaultContinuityInheritance.sourceAccount}"`
            )
          );
        }
        if (defaultContinuityInheritance.claudeConfigDir) {
          envVars.CLAUDE_CONFIG_DIR = defaultContinuityInheritance.claudeConfigDir;
        }
      }

      // Dispatch through target adapter for non-claude targets
      if (resolvedTarget !== 'claude') {
        const adapter = targetAdapter;
        if (!adapter) {
          console.error(fail(`Target adapter not found for "${resolvedTarget}"`));
          process.exit(1);
        }
        if (!adapter.supportsProfileType('default')) {
          console.error(fail(`${adapter.displayName} does not support default profile mode`));
          process.exit(1);
        }
        const creds: TargetCredentials = {
          profile: 'default',
          baseUrl: process.env['ANTHROPIC_BASE_URL'] || '',
          apiKey: process.env['ANTHROPIC_AUTH_TOKEN'] || '',
          model: process.env['ANTHROPIC_MODEL'],
          provider: resolveDroidProvider({
            provider: process.env['CCS_DROID_PROVIDER'] || process.env['DROID_PROVIDER'],
            baseUrl: process.env['ANTHROPIC_BASE_URL'],
            model: process.env['ANTHROPIC_MODEL'],
          }),
          reasoningOverride: droidReasoningOverride,
        };
        if (!creds.baseUrl || !creds.apiKey) {
          console.error(
            fail(
              `${adapter.displayName} default mode requires ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN`
            )
          );
          console.error(info('Use a settings-based profile instead: ccs glm --target droid'));
          process.exit(1);
        }
        await adapter.prepareCredentials(creds);
        const targetArgs = adapter.buildArgs('default', targetRemainingArgs);
        const targetEnv = adapter.buildEnv(creds, 'default');
        adapter.exec(targetArgs, targetEnv, { binaryInfo: targetBinaryInfo || undefined });
        return;
      }

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
  try {
    runCleanup();
  } catch {
    // Cleanup failure should not block termination.
  }
  // If a target exec path registered additional signal listeners, let those
  // listeners forward/coordinate child shutdown and final exit codes.
  if (process.listenerCount('SIGTERM') <= 1) {
    process.exit(143); // 128 + SIGTERM(15)
  }
});

process.on('SIGINT', () => {
  try {
    runCleanup();
  } catch {
    // Cleanup failure should not block termination.
  }
  // Same coordination rule as SIGTERM.
  if (process.listenerCount('SIGINT') <= 1) {
    process.exit(130); // 128 + SIGINT(2)
  }
});

// Run main
main().catch(handleError);
