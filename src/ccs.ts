import './utils/fetch-proxy-setup';

import * as fs from 'fs';
import { detectClaudeCli } from './utils/claude-detector';
import {
  getSettingsPath,
  loadSettings,
  setGlobalConfigDir,
  detectCloudSyncPath,
} from './utils/config-manager';
import { expandPath } from './utils/helpers';
import {
  validateGlmKey,
  validateMiniMaxKey,
  validateAnthropicKey,
} from './utils/api-key-validator';
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
  ensureProfileHooksOrThrow,
} from './utils/websearch-manager';
import { getGlobalEnvConfig, getOfficialChannelsConfig } from './config/unified-config-loader';
import { ensureProfileHooks as ensureImageAnalyzerHooks } from './utils/hooks/image-analyzer-profile-hook-injector';
import { getImageAnalysisHookEnv } from './utils/hooks';
import { fail, info, warn } from './utils/ui';
import { isCopilotSubcommandToken } from './copilot/constants';
import {
  buildOfficialChannelsArgs,
  getOfficialChannelsEnvironmentStatus,
  officialChannelRequiresMacOS,
  resolveOfficialChannelsLaunchPlan,
} from './channels/official-channels-runtime';
import { getOfficialChannelReadiness } from './channels/official-channels-store';

// Import centralized error handling
import { handleError, runCleanup } from './errors';
import { tryHandleRootCommand } from './commands/root-command-router';

// Import extracted utility functions
import { execClaude } from './utils/shell-executor';
import { isDeprecatedGlmtProfileName, normalizeDeprecatedGlmtEnv } from './utils/glmt-deprecation';

// Import target adapter system
import {
  registerTarget,
  getTarget,
  ClaudeAdapter,
  DroidAdapter,
  CodexAdapter,
  evaluateTargetRuntimeCompatibility,
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
import { resolveCliproxyBridgeMetadata } from './api/services/cliproxy-profile-bridge';

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

interface RuntimeReasoningResolution {
  argsWithoutReasoningFlags: string[];
  reasoningOverride: string | number | undefined;
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

function resolveRuntimeReasoningFlags(
  args: string[],
  envThinkingValue: string | undefined
): RuntimeReasoningResolution {
  const runtime = resolveDroidReasoningRuntime(args, envThinkingValue);

  if (runtime.duplicateDisplays.length > 0) {
    console.error(
      warn(
        `[!] Multiple reasoning flags detected. Using first occurrence: ${runtime.sourceDisplay || '<first-flag>'}`
      )
    );
  }

  return {
    argsWithoutReasoningFlags: runtime.argsWithoutReasoningFlags,
    reasoningOverride: runtime.reasoningOverride,
  };
}

function exitWithRuntimeReasoningFlagError(
  message: string,
  options: {
    codexAliasLevels: string;
    includeDroidExecExample?: boolean;
  }
): never {
  console.error(fail(message));
  console.error('    Examples: --thinking low, --thinking 8192, --thinking off');
  console.error(`    Codex alias: --effort ${options.codexAliasLevels}`);
  if (options.includeDroidExecExample) {
    console.error('    Droid exec: --reasoning-effort high');
  }
  process.exit(1);
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

function resolveNativeClaudeLaunchArgs(
  args: string[],
  profileType: 'default' | 'account',
  targetConfigDir?: string
): string[] {
  const config = getOfficialChannelsConfig();
  const environment = getOfficialChannelsEnvironmentStatus(
    targetConfigDir ? { CLAUDE_CONFIG_DIR: targetConfigDir } : undefined
  );
  const channelReadiness = {
    telegram: getOfficialChannelReadiness('telegram'),
    discord: getOfficialChannelReadiness('discord'),
    imessage: !officialChannelRequiresMacOS('imessage') || process.platform === 'darwin',
  };
  const plan = resolveOfficialChannelsLaunchPlan({
    args,
    config,
    target: 'claude',
    profileType,
    environment,
    channelReadiness,
  });

  for (const message of plan.skippedMessages) {
    console.error(warn(message));
  }

  if (
    config.selected.length > 0 &&
    environment.auth.state === 'eligible' &&
    environment.auth.orgRequirementMessage
  ) {
    console.error(warn(environment.auth.orgRequirementMessage));
  }

  if (!plan.applied) {
    return args;
  }

  return buildOfficialChannelsArgs(args, plan.appliedChannels, plan.wantsPermissionBypass);
}

async function main(): Promise<void> {
  // Register target adapters
  registerTarget(new ClaudeAdapter());
  registerTarget(new DroidAdapter());
  registerTarget(new CodexAdapter());

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

  if (await tryHandleRootCommand(args)) {
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

      if (profileInfo.type !== 'settings') {
        const compatibility = evaluateTargetRuntimeCompatibility({
          target: resolvedTarget,
          profileType: profileInfo.type,
          cliproxyProvider: profileInfo.type === 'cliproxy' ? profileInfo.provider : undefined,
          isComposite:
            profileInfo.type === 'cliproxy' ? Boolean(profileInfo.isComposite) : undefined,
        });
        if (!compatibility.supported) {
          console.error(
            fail(
              compatibility.reason || `${targetAdapter.displayName} does not support this profile.`
            )
          );
          if (compatibility.suggestion) {
            console.error(info(compatibility.suggestion));
          }
          process.exit(1);
        }
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
      } else if (resolvedTarget === 'codex') {
        console.error(info('Install a recent @openai/codex build, then retry.'));
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
    let runtimeReasoningOverride: string | number | undefined;
    if (resolvedTarget === 'droid') {
      try {
        const droidRoute = routeDroidCommandArgs(remainingArgs);
        targetRemainingArgs = droidRoute.argsForDroid;

        if (droidRoute.mode === 'interactive') {
          const runtime = resolveRuntimeReasoningFlags(remainingArgs, process.env.CCS_THINKING);
          targetRemainingArgs = runtime.argsWithoutReasoningFlags;
          runtimeReasoningOverride = runtime.reasoningOverride;
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
          exitWithRuntimeReasoningFlagError(error.message, {
            codexAliasLevels: 'medium|high|xhigh',
            includeDroidExecExample: true,
          });
        }
        throw error;
      }
    } else if (resolvedTarget === 'codex') {
      try {
        const runtime = resolveRuntimeReasoningFlags(remainingArgs, process.env.CCS_THINKING);
        targetRemainingArgs = runtime.argsWithoutReasoningFlags;
        runtimeReasoningOverride = runtime.reasoningOverride;
      } catch (error) {
        if (error instanceof DroidReasoningFlagError) {
          exitWithRuntimeReasoningFlagError(error.message, {
            codexAliasLevels: 'minimal|low|medium|high|xhigh',
          });
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
      ensureProfileHooksOrThrow(profileInfo.name);
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
          reasoningOverride: runtimeReasoningOverride,
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
        const targetArgs = adapter.buildArgs(profileInfo.name, targetRemainingArgs, {
          creds,
          profileType: profileInfo.type,
          binaryInfo: targetBinaryInfo || undefined,
        });
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
      ensureProfileHooksOrThrow(profileInfo.name);
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
      ensureProfileHooksOrThrow(profileInfo.name);
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
      const expandedSettingsPath = profileInfo.settingsPath
        ? expandPath(profileInfo.settingsPath)
        : getSettingsPath(profileInfo.name);
      const settings = loadSettings(expandedSettingsPath);
      const cliproxyBridge = resolveCliproxyBridgeMetadata(settings);
      if (resolvedTarget !== 'claude') {
        const compatibility = evaluateTargetRuntimeCompatibility({
          target: resolvedTarget,
          profileType: profileInfo.type,
          cliproxyBridgeProvider: cliproxyBridge?.provider ?? null,
        });
        if (!compatibility.supported) {
          console.error(
            fail(
              compatibility.reason ||
                `${targetAdapter?.displayName || resolvedTarget} does not support this profile.`
            )
          );
          if (compatibility.suggestion) {
            console.error(info(compatibility.suggestion));
          }
          process.exit(1);
        }
      }
      const rawSettingsEnv = profileInfo.env ?? settings.env ?? {};
      const isDeprecatedGlmtProfile = isDeprecatedGlmtProfileName(profileInfo.name);
      const glmtNormalization = isDeprecatedGlmtProfile
        ? normalizeDeprecatedGlmtEnv(rawSettingsEnv)
        : null;
      const settingsEnv = glmtNormalization?.env ?? rawSettingsEnv;

      if (glmtNormalization) {
        for (const message of glmtNormalization.warnings) {
          console.error(warn(message));
        }
      }

      // Pre-flight validation for Z.AI-compatible profiles.
      if (profileInfo.name === 'glm' || isDeprecatedGlmtProfile) {
        const apiKey = settingsEnv['ANTHROPIC_AUTH_TOKEN'];

        if (apiKey) {
          const validation = await validateGlmKey(apiKey, settingsEnv['ANTHROPIC_BASE_URL']);

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
        const apiKey = settingsEnv['ANTHROPIC_AUTH_TOKEN'];

        if (apiKey) {
          const validation = await validateMiniMaxKey(apiKey, settingsEnv['ANTHROPIC_BASE_URL']);

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

      // Pre-flight validation for Anthropic direct profiles (ANTHROPIC_API_KEY + no BASE_URL)
      {
        const anthropicApiKey = settingsEnv['ANTHROPIC_API_KEY'];
        const hasBaseUrl = !!settingsEnv['ANTHROPIC_BASE_URL'];
        if (anthropicApiKey && !hasBaseUrl) {
          const validation = await validateAnthropicKey(anthropicApiKey);
          if (!validation.valid) {
            console.error('');
            console.error(fail(validation.error || 'API key validation failed'));
            if (validation.suggestion) {
              console.error('');
              console.error(validation.suggestion);
            }
            console.error('');
            console.error(
              info(`To skip validation: CCS_SKIP_PREFLIGHT=1 ccs ${profileInfo.name} "prompt"`)
            );
            process.exit(1);
          }
        }
      }

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

      // Explicitly inject effective settings env vars so stale ANTHROPIC_*
      // values from prior sessions cannot leak into the active profile.
      const envVars: NodeJS.ProcessEnv = {
        ...globalEnv,
        ...settingsEnv,
        ...(inheritedClaudeConfigDir ? { CLAUDE_CONFIG_DIR: inheritedClaudeConfigDir } : {}),
        ...webSearchEnv,
        ...imageAnalysisEnv,
        CCS_PROFILE_TYPE: 'settings',
      };

      // Dispatch through target adapter for non-claude targets
      if (resolvedTarget !== 'claude') {
        const adapter = targetAdapter;
        if (!adapter) {
          console.error(fail(`Target adapter not found for "${resolvedTarget}"`));
          process.exit(1);
        }
        const directAnthropicBaseUrl =
          settingsEnv['ANTHROPIC_BASE_URL'] ||
          (settingsEnv['ANTHROPIC_API_KEY'] ? 'https://api.anthropic.com' : '');
        const creds: TargetCredentials = {
          profile: profileInfo.name,
          baseUrl: directAnthropicBaseUrl,
          apiKey: settingsEnv['ANTHROPIC_AUTH_TOKEN'] || settingsEnv['ANTHROPIC_API_KEY'] || '',
          model: settingsEnv['ANTHROPIC_MODEL'],
          provider: resolveDroidProvider({
            provider: settingsEnv['CCS_DROID_PROVIDER'] || settingsEnv['DROID_PROVIDER'],
            baseUrl: directAnthropicBaseUrl,
            model: settingsEnv['ANTHROPIC_MODEL'],
          }),
          reasoningOverride: runtimeReasoningOverride,
          envVars,
        };
        await adapter.prepareCredentials(creds);
        const targetArgs = adapter.buildArgs(profileInfo.name, targetRemainingArgs, {
          creds,
          profileType: profileInfo.type,
          binaryInfo: targetBinaryInfo || undefined,
        });
        const targetEnv = adapter.buildEnv(creds, profileInfo.type);
        adapter.exec(targetArgs, targetEnv, { binaryInfo: targetBinaryInfo || undefined });
        return;
      }

      execClaude(claudeCli, ['--settings', expandedSettingsPath, ...remainingArgs], envVars);
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
      const launchArgs = resolveNativeClaudeLaunchArgs(remainingArgs, 'account', instancePath);
      execClaude(claudeCli, launchArgs, envVars);
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
          reasoningOverride: runtimeReasoningOverride,
        };
        if (resolvedTarget === 'droid' && (!creds.baseUrl || !creds.apiKey)) {
          console.error(
            fail(
              `${adapter.displayName} default mode requires ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN`
            )
          );
          console.error(info('Use a settings-based profile instead: ccs glm --target droid'));
          process.exit(1);
        }
        await adapter.prepareCredentials(creds);
        const targetArgs = adapter.buildArgs('default', targetRemainingArgs, {
          creds,
          profileType: 'default',
          binaryInfo: targetBinaryInfo || undefined,
        });
        const targetEnv = adapter.buildEnv(creds, 'default');
        adapter.exec(targetArgs, targetEnv, { binaryInfo: targetBinaryInfo || undefined });
        return;
      }

      const launchArgs = resolveNativeClaudeLaunchArgs(
        remainingArgs,
        'default',
        envVars.CLAUDE_CONFIG_DIR
      );
      execClaude(claudeCli, launchArgs, envVars);
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
