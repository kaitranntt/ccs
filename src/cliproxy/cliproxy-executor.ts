/**
 * CLIProxy Executor - Spawn/Kill Pattern for CLIProxyAPI
 *
 * Mirrors GLMT architecture:
 * 1. Ensure binary exists (Phase 1)
 * 2. Generate config for provider
 * 3. Spawn CLIProxyAPI binary
 * 4. Poll port for readiness (no stdout signal)
 * 5. Execute Claude CLI with proxied environment
 * 6. Kill proxy on Claude exit
 *
 * Key difference from GLMT: Uses TCP port polling instead of PROXY_READY signal
 */

import { spawn, ChildProcess } from 'child_process';
import * as net from 'net';
import { ProgressIndicator } from '../utils/progress-indicator';
import { ok, fail, info, warn } from '../utils/ui';
import { escapeShellArg } from '../utils/shell-executor';
import { ensureCLIProxyBinary, getInstalledCliproxyVersion } from './binary-manager';
import {
  generateConfig,
  getEffectiveEnvVars,
  getRemoteEnvVars,
  getProviderConfig,
  ensureProviderSettings,
  CLIPROXY_DEFAULT_PORT,
  getCliproxyWritablePath,
} from './config-generator';
import { checkRemoteProxy } from './remote-proxy-client';
import { isAuthenticated } from './auth-handler';
import { CLIProxyProvider, ExecutorConfig } from './types';
import { configureProviderModel, getCurrentModel } from './model-config';
import { resolveProxyConfig, PROXY_CLI_FLAGS } from './proxy-config-resolver';
import { getWebSearchHookEnv } from '../utils/websearch-manager';
import { supportsModelConfig, isModelBroken, getModelIssueUrl, findModel } from './model-catalog';
import {
  findAccountByQuery,
  getProviderAccounts,
  setDefaultAccount,
  touchAccount,
  renameAccount,
  getDefaultAccount,
} from './account-manager';
import { getPortCheckCommand, getCatCommand, killProcessOnPort } from '../utils/platform-commands';
import {
  ensureMcpWebSearch,
  installWebSearchHook,
  displayWebSearchStatus,
} from '../utils/websearch-manager';
import {
  registerSession,
  unregisterSession,
  cleanupOrphanedSessions,
  stopProxy,
} from './session-tracker';
import { detectRunningProxy, waitForProxyHealthy, reclaimOrphanedProxy } from './proxy-detector';
import { withStartupLock } from './startup-lock';
import { loadOrCreateUnifiedConfig } from '../config/unified-config-loader';

/** Default executor configuration */
const DEFAULT_CONFIG: ExecutorConfig = {
  port: CLIPROXY_DEFAULT_PORT,
  timeout: 5000,
  verbose: false,
  pollInterval: 100,
};

/**
 * Wait for TCP port to become available
 * Uses polling since CLIProxyAPI doesn't emit PROXY_READY signal
 */
async function waitForProxyReady(
  port: number,
  timeout: number = 5000,
  pollInterval: number = 100
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = net.createConnection({ port, host: '127.0.0.1' }, () => {
          socket.destroy();
          resolve();
        });

        socket.on('error', (err) => {
          socket.destroy();
          reject(err);
        });

        // Individual connection timeout
        socket.setTimeout(1000, () => {
          socket.destroy();
          reject(new Error('Connection timeout'));
        });
      });

      return; // Connection successful - proxy is ready
    } catch {
      // Connection failed, wait and retry
      await new Promise((r) => setTimeout(r, pollInterval));
    }
  }

  throw new Error(`CLIProxy not ready after ${timeout}ms on port ${port}`);
}

/**
 * Execute Claude CLI with CLIProxy (main entry point)
 *
 * @param claudeCli Path to Claude CLI executable
 * @param provider CLIProxy provider (gemini, codex, agy, qwen)
 * @param args Arguments to pass to Claude CLI
 * @param config Optional executor configuration
 */
export async function execClaudeWithCLIProxy(
  claudeCli: string,
  provider: CLIProxyProvider,
  args: string[],
  config: Partial<ExecutorConfig> = {}
): Promise<void> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const verbose = cfg.verbose || args.includes('--verbose') || args.includes('-v');

  const log = (msg: string) => {
    if (verbose) {
      console.error(`[cliproxy] ${msg}`);
    }
  };

  // 0. Resolve proxy configuration (CLI > ENV > config.yaml > defaults)
  // This filters proxy flags from args and returns resolved config
  const unifiedConfig = loadOrCreateUnifiedConfig();
  const cliproxyServerConfig = unifiedConfig.cliproxy_server;
  const { config: proxyConfig, remainingArgs: argsWithoutProxy } = resolveProxyConfig(args, {
    remote: cliproxyServerConfig?.remote
      ? {
          enabled: cliproxyServerConfig.remote.enabled,
          host: cliproxyServerConfig.remote.host,
          port: cliproxyServerConfig.remote.port,
          protocol: cliproxyServerConfig.remote.protocol,
          auth_token: cliproxyServerConfig.remote.auth_token,
          timeout: cliproxyServerConfig.remote.timeout,
        }
      : undefined,
    local: cliproxyServerConfig?.local
      ? {
          port: cliproxyServerConfig.local.port,
          auto_start: cliproxyServerConfig.local.auto_start,
        }
      : undefined,
  });

  // Use resolved port from proxy config (overrides ExecutorConfig)
  if (proxyConfig.port !== CLIPROXY_DEFAULT_PORT) {
    cfg.port = proxyConfig.port;
  }

  log(`Proxy mode: ${proxyConfig.mode}`);
  if (proxyConfig.mode === 'remote') {
    log(`Remote host: ${proxyConfig.host}:${proxyConfig.port} (${proxyConfig.protocol})`);
  }

  // Note: proxyConfig is available for Phase 4 (remote mode integration)

  // Ensure MCP web-search is configured for third-party profiles
  // WebSearch is a server-side tool executed by Anthropic's API
  // Third-party providers don't have access, so we use MCP fallback
  ensureMcpWebSearch();

  // Install WebSearch hook for Gemini CLI + MCP fallback
  // Hook intercepts WebSearch, tries Gemini CLI first, falls back to MCP
  installWebSearchHook();

  // Display WebSearch status (single line, equilibrium UX)
  displayWebSearchStatus();

  // Validate provider
  const providerConfig = getProviderConfig(provider);
  log(`Provider: ${providerConfig.displayName}`);

  // Check remote proxy if configured (before binary download)
  let useRemoteProxy = false;
  if (proxyConfig.mode === 'remote' && proxyConfig.host) {
    const status = await checkRemoteProxy({
      host: proxyConfig.host,
      port: proxyConfig.port,
      protocol: proxyConfig.protocol,
      authToken: proxyConfig.authToken,
      timeout: proxyConfig.timeout ?? 2000,
      allowSelfSigned: proxyConfig.protocol === 'https',
    });

    if (status.reachable) {
      useRemoteProxy = true;
      console.log(
        ok(
          `Connected to remote proxy at ${proxyConfig.host}:${proxyConfig.port} (${status.latencyMs}ms)`
        )
      );
    } else {
      console.error(warn(`Remote proxy unreachable: ${status.error}`));

      if (proxyConfig.remoteOnly) {
        throw new Error('Remote proxy unreachable and --remote-only specified');
      }

      if (proxyConfig.fallbackEnabled) {
        if (proxyConfig.autoStartLocal) {
          console.log(info('Falling back to local proxy...'));
        } else {
          // Prompt user for fallback (only in TTY)
          if (process.stdin.isTTY) {
            const readline = await import('readline');
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            const answer = await new Promise<string>((resolve) => {
              rl.question('Start local proxy instead? [Y/n] ', resolve);
            });
            rl.close();
            if (answer.toLowerCase() === 'n') {
              throw new Error('Remote proxy unreachable and user declined fallback');
            }
          }
          console.log(info('Starting local proxy...'));
        }
      } else {
        throw new Error('Remote proxy unreachable and fallback disabled');
      }
    }
  }

  // Variables for local proxy mode
  let binaryPath: string | undefined;
  let sessionId: string | undefined;

  // 1. Ensure binary exists (downloads if needed) - SKIP for remote mode
  if (!useRemoteProxy) {
    const spinner = new ProgressIndicator('Preparing CLIProxy');
    spinner.start();

    try {
      binaryPath = await ensureCLIProxyBinary(verbose);
      spinner.succeed('CLIProxy binary ready');
    } catch (error) {
      spinner.fail('Failed to prepare CLIProxy');
      throw error;
    }
  }

  // 2. Handle special flags (use argsWithoutProxy - proxy flags already stripped)
  const forceAuth = argsWithoutProxy.includes('--auth');
  const forceHeadless = argsWithoutProxy.includes('--headless');
  const forceLogout = argsWithoutProxy.includes('--logout');
  const forceConfig = argsWithoutProxy.includes('--config');
  const addAccount = argsWithoutProxy.includes('--add');
  const showAccounts = argsWithoutProxy.includes('--accounts');
  // Kiro-specific: --import to import token from Kiro IDE directly
  const forceImport = argsWithoutProxy.includes('--import');
  // Kiro-specific: browser mode for OAuth
  // Default to normal browser (noIncognito=true) for reliability - incognito often fails on Linux
  // --incognito flag opts into incognito mode, --no-incognito is legacy (now default)
  const incognitoFlag = argsWithoutProxy.includes('--incognito');
  const noIncognitoFlag = argsWithoutProxy.includes('--no-incognito');
  // Config setting (defaults to true = normal browser)
  const kiroNoIncognitoConfig =
    provider === 'kiro' ? (unifiedConfig.cliproxy?.kiro_no_incognito ?? true) : false;
  // --incognito flag overrides everything to use incognito
  const noIncognito = incognitoFlag ? false : noIncognitoFlag || kiroNoIncognitoConfig;

  // Parse --use <account> flag
  let useAccount: string | undefined;
  const useIdx = argsWithoutProxy.indexOf('--use');
  if (
    useIdx !== -1 &&
    argsWithoutProxy[useIdx + 1] &&
    !argsWithoutProxy[useIdx + 1].startsWith('-')
  ) {
    useAccount = argsWithoutProxy[useIdx + 1];
  }

  // Parse --nickname <name> flag
  let setNickname: string | undefined;
  const nicknameIdx = argsWithoutProxy.indexOf('--nickname');
  if (
    nicknameIdx !== -1 &&
    argsWithoutProxy[nicknameIdx + 1] &&
    !argsWithoutProxy[nicknameIdx + 1].startsWith('-')
  ) {
    setNickname = argsWithoutProxy[nicknameIdx + 1];
  }

  // Handle --accounts: list accounts and exit
  if (showAccounts) {
    const accounts = getProviderAccounts(provider);
    if (accounts.length === 0) {
      console.log(info(`No accounts registered for ${providerConfig.displayName}`));
      console.log(`    Run "ccs ${provider} --auth" to add an account`);
    } else {
      console.log(`\n${providerConfig.displayName} Accounts:\n`);
      for (const acct of accounts) {
        const defaultMark = acct.isDefault ? ' (default)' : '';
        const nickname = acct.nickname ? `[${acct.nickname}]` : '';
        console.log(`  ${nickname.padEnd(12)} ${acct.email || acct.id}${defaultMark}`);
      }
      console.log(`\n  Use "ccs ${provider} --use <nickname>" to switch accounts`);
    }
    process.exit(0);
  }

  // Handle --use: switch to specified account
  if (useAccount) {
    const account = findAccountByQuery(provider, useAccount);
    if (!account) {
      console.error(fail(`Account not found: "${useAccount}"`));
      const accounts = getProviderAccounts(provider);
      if (accounts.length > 0) {
        console.error(`    Available accounts:`);
        for (const acct of accounts) {
          console.error(`      - ${acct.nickname || acct.id} (${acct.email || 'no email'})`);
        }
      }
      process.exit(1);
    }
    // Set as default for this and future sessions
    setDefaultAccount(provider, account.id);
    touchAccount(provider, account.id);
    console.log(ok(`Switched to account: ${account.nickname || account.email || account.id}`));
  }

  // Handle --nickname: rename account and exit (unless used with --auth --add)
  if (setNickname && !addAccount) {
    const defaultAccount = getDefaultAccount(provider);
    if (!defaultAccount) {
      console.error(fail(`No account found for ${providerConfig.displayName}`));
      console.error(`    Run "ccs ${provider} --auth" to add an account first`);
      process.exit(1);
    }
    try {
      const success = renameAccount(provider, defaultAccount.id, setNickname);
      if (success) {
        console.log(ok(`Renamed account to: ${setNickname}`));
      } else {
        console.error(fail('Failed to rename account'));
        process.exit(1);
      }
    } catch (err) {
      console.error(fail(err instanceof Error ? err.message : 'Failed to rename account'));
      process.exit(1);
    }
    process.exit(0);
  }

  // Handle --config: configure model selection and exit
  // Pass customSettingsPath for CLIProxy variants to save to correct file
  if (forceConfig && supportsModelConfig(provider)) {
    await configureProviderModel(provider, true, cfg.customSettingsPath);
    process.exit(0);
  }

  // Handle --logout: clear auth and exit
  if (forceLogout) {
    const { clearAuth } = await import('./auth-handler');
    if (clearAuth(provider)) {
      console.log(ok(`Logged out from ${providerConfig.displayName}`));
    } else {
      console.log(info(`No authentication found for ${providerConfig.displayName}`));
    }
    process.exit(0);
  }

  // Handle --import: import token from Kiro IDE directly (Kiro only)
  if (forceImport) {
    if (provider !== 'kiro') {
      console.error(fail('--import is only available for Kiro'));
      console.error(`    Run "ccs ${provider} --auth" to authenticate`);
      process.exit(1);
    }
    // Validate flag conflicts
    if (forceAuth) {
      console.error(fail('Cannot use --import with --auth'));
      console.error('    --import: Import existing token from Kiro IDE');
      console.error('    --auth: Trigger new OAuth flow in browser');
      process.exit(1);
    }
    if (forceLogout) {
      console.error(fail('Cannot use --import with --logout'));
      process.exit(1);
    }
    const { triggerOAuth } = await import('./auth-handler');
    const authSuccess = await triggerOAuth(provider, {
      verbose,
      import: true,
      ...(setNickname ? { nickname: setNickname } : {}),
    });
    if (!authSuccess) {
      console.error(fail('Failed to import Kiro token from IDE'));
      console.error('    Make sure you are logged into Kiro IDE first');
      process.exit(1);
    }
    process.exit(0);
  }

  // 3. Ensure OAuth completed (if provider requires it)
  if (providerConfig.requiresOAuth) {
    log(`Checking authentication for ${provider}`);

    if (forceAuth || !isAuthenticated(provider)) {
      // Pass headless only if explicitly set; otherwise let auth-handler auto-detect
      const { triggerOAuth } = await import('./auth-handler');
      const authSuccess = await triggerOAuth(provider, {
        verbose,
        add: addAccount,
        ...(forceHeadless ? { headless: true } : {}),
        ...(setNickname ? { nickname: setNickname } : {}),
        ...(noIncognito ? { noIncognito: true } : {}),
      });
      if (!authSuccess) {
        throw new Error(`Authentication required for ${providerConfig.displayName}`);
      }
      // If --auth was explicitly passed, exit after auth (don't start Claude)
      if (forceAuth) {
        process.exit(0);
      }
    } else {
      log(`${provider} already authenticated`);
    }
  }

  // 4. First-run model configuration (interactive)
  // For supported providers, prompt user to select model on first run
  // Pass customSettingsPath for CLIProxy variants
  if (supportsModelConfig(provider)) {
    await configureProviderModel(provider, false, cfg.customSettingsPath); // false = only if not configured
  }

  // 5. Check for known broken models and warn user
  const currentModel = getCurrentModel(provider, cfg.customSettingsPath);
  if (currentModel && isModelBroken(provider, currentModel)) {
    const modelEntry = findModel(provider, currentModel);
    const issueUrl = getModelIssueUrl(provider, currentModel);
    console.error('');
    console.error(warn(`${modelEntry?.name || currentModel} has known issues with Claude Code`));
    console.error('    Tool calls will fail. Use "gemini-3-pro-preview" instead.');
    if (issueUrl) {
      console.error(`    Tracking: ${issueUrl}`);
    }
    console.error(`    Run "ccs ${provider} --config" to change model.`);
    console.error('');
  }

  // 6. Ensure user settings file exists (creates from defaults if not)
  ensureProviderSettings(provider);

  // Local proxy mode: generate config, spawn proxy, track session
  let proxy: ChildProcess | null = null;

  if (!useRemoteProxy) {
    // 6. Generate config file
    log(`Generating config for ${provider}`);
    const configPath = generateConfig(provider, cfg.port);
    log(`Config written: ${configPath}`);

    // 6a. Pre-flight check using unified detection with startup lock
    // This prevents race conditions when multiple CCS processes start simultaneously
    cleanupOrphanedSessions(cfg.port);

    // Use startup lock to coordinate with other CCS processes
    await withStartupLock(async () => {
      // Detect running proxy using multiple methods (HTTP, session-lock, port-process)
      let proxyStatus = await detectRunningProxy(cfg.port);
      log(`Proxy detection: ${JSON.stringify(proxyStatus)}`);

      // Check for version mismatch - restart proxy if installed version differs from running
      if (proxyStatus.running && proxyStatus.verified && proxyStatus.version) {
        const installedVersion = getInstalledCliproxyVersion();
        if (installedVersion !== proxyStatus.version) {
          console.log(
            warn(
              `Version mismatch: running v${proxyStatus.version}, installed v${installedVersion}. Restarting proxy...`
            )
          );
          log(`Stopping outdated proxy (PID: ${proxyStatus.pid ?? 'unknown'})...`);
          const stopResult = await stopProxy(cfg.port);
          if (stopResult.stopped) {
            log(`Stopped outdated proxy successfully`);
          } else {
            log(`Stop proxy result: ${stopResult.error ?? 'unknown error'}`);
          }
          // Wait for port to be released
          await new Promise((r) => setTimeout(r, 500));
          // Re-detect proxy status (should now be not running)
          proxyStatus = await detectRunningProxy(cfg.port);
          log(`Re-detection after version mismatch restart: ${JSON.stringify(proxyStatus)}`);
        }
      }

      if (proxyStatus.running && proxyStatus.verified) {
        // Healthy proxy found - join it
        if (proxyStatus.pid) {
          sessionId = reclaimOrphanedProxy(cfg.port, proxyStatus.pid, verbose) ?? undefined;
        }
        if (sessionId) {
          console.log(info(`Joined existing CLIProxy on port ${cfg.port} (${proxyStatus.method})`));
        } else {
          // Failed to register session - proxy is running but we can't track it
          // This happens when port-process detection fails (permissions, platform issues)
          console.log(
            info(`Using existing CLIProxy on port ${cfg.port} (session tracking unavailable)`)
          );
          log(`PID=${proxyStatus.pid ?? 'unknown'}, session registration skipped`);
        }
        return; // Exit lock early, skip spawning
      }

      if (proxyStatus.running && !proxyStatus.verified) {
        // Proxy detected but not ready yet (another process is starting it)
        log(`Proxy starting up (detected via ${proxyStatus.method}), waiting...`);
        const becameHealthy = await waitForProxyHealthy(cfg.port, cfg.timeout);
        if (becameHealthy) {
          if (proxyStatus.pid) {
            sessionId = reclaimOrphanedProxy(cfg.port, proxyStatus.pid, verbose) ?? undefined;
          }
          console.log(info(`Joined CLIProxy after startup wait`));
          return; // Exit lock early
        }
        // Proxy didn't become healthy - kill and respawn
        if (proxyStatus.pid) {
          log(`Proxy PID ${proxyStatus.pid} not responding, killing...`);
          killProcessOnPort(cfg.port, verbose);
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      if (proxyStatus.blocked && proxyStatus.blocker) {
        // Port blocked by non-CLIProxy process
        // Last resort: try HTTP health check (handles Windows PID-XXXXX case)
        const isActuallyOurs = await waitForProxyHealthy(cfg.port, 1000);
        if (isActuallyOurs) {
          sessionId = reclaimOrphanedProxy(cfg.port, proxyStatus.blocker.pid, verbose) ?? undefined;
          console.log(info(`Reclaimed CLIProxy with unrecognized process name`));
          return;
        }

        // Truly blocked by another application
        console.error('');
        console.error(
          warn(
            `Port ${cfg.port} is blocked by ${proxyStatus.blocker.processName} (PID ${proxyStatus.blocker.pid})`
          )
        );
        console.error('');
        console.error('To fix this, close the blocking application or run:');
        console.error(`  ${getPortCheckCommand(cfg.port)}`);
        console.error('');
        throw new Error(`Port ${cfg.port} is in use by another application`);
      }

      // 6b. Spawn CLIProxyAPI binary
      const proxyArgs = ['--config', configPath];
      log(`Spawning: ${binaryPath} ${proxyArgs.join(' ')}`);

      proxy = spawn(binaryPath as string, proxyArgs, {
        stdio: ['ignore', 'ignore', 'ignore'],
        detached: true,
        env: {
          ...process.env,
          WRITABLE_PATH: getCliproxyWritablePath(),
        },
      });

      proxy.unref();

      proxy.on('error', (error) => {
        console.error(fail(`CLIProxy spawn error: ${error.message}`));
      });

      // 7. Wait for proxy readiness via TCP polling
      const readySpinner = new ProgressIndicator(`Waiting for CLIProxy on port ${cfg.port}`);
      readySpinner.start();

      try {
        await waitForProxyReady(cfg.port, cfg.timeout, cfg.pollInterval);
        readySpinner.succeed(`CLIProxy ready on port ${cfg.port}`);
      } catch (error) {
        readySpinner.fail('CLIProxy Plus startup failed');
        proxy.kill('SIGTERM');

        const err = error as Error;
        console.error('');
        console.error(fail('CLIProxy Plus failed to start'));
        console.error('');
        console.error('Possible causes:');
        console.error(`  1. Port ${cfg.port} already in use`);
        console.error('  2. Binary crashed on startup');
        console.error('  3. Invalid configuration');
        console.error('');
        console.error('Troubleshooting:');
        console.error(`  - Check port: ${getPortCheckCommand(cfg.port)}`);
        console.error('  - Run with --verbose for detailed logs');
        console.error(`  - View config: ${getCatCommand(configPath)}`);
        console.error('  - Try: ccs doctor --fix');
        console.error('');

        throw new Error(`CLIProxy startup failed: ${err.message}`);
      }

      // Register this session with the new proxy, including the installed version
      const installedVersion = getInstalledCliproxyVersion();
      sessionId = registerSession(cfg.port, proxy.pid as number, installedVersion);
      log(
        `Registered session ${sessionId} with new proxy (PID ${proxy.pid}, version ${installedVersion})`
      );
    });
  }

  // 7. Execute Claude CLI with proxied environment
  // Use remote or local env vars based on mode
  // When remote is configured (even if using local), pass config for URL rewriting
  const remoteRewriteConfig =
    proxyConfig.mode === 'remote' && proxyConfig.host
      ? {
          host: proxyConfig.host,
          port: proxyConfig.port,
          protocol: proxyConfig.protocol,
          authToken: proxyConfig.authToken,
        }
      : undefined;

  const envVars = useRemoteProxy
    ? getRemoteEnvVars(
        provider,
        {
          host: proxyConfig.host ?? 'localhost',
          port: proxyConfig.port,
          protocol: proxyConfig.protocol,
          authToken: proxyConfig.authToken,
        },
        cfg.customSettingsPath
      )
    : getEffectiveEnvVars(provider, cfg.port, cfg.customSettingsPath, remoteRewriteConfig);
  const webSearchEnv = getWebSearchHookEnv();
  const env = {
    ...process.env,
    ...envVars,
    ...webSearchEnv,
    CCS_PROFILE_TYPE: 'cliproxy', // Signal to WebSearch hook this is a third-party provider
  };

  log(`Claude env: ANTHROPIC_BASE_URL=${envVars.ANTHROPIC_BASE_URL}`);
  log(`Claude env: ANTHROPIC_MODEL=${envVars.ANTHROPIC_MODEL}`);
  if (Object.keys(webSearchEnv).length > 0) {
    log(`Claude env: WebSearch config=${JSON.stringify(webSearchEnv)}`);
  }
  // Log global env vars for visibility
  if (envVars.DISABLE_TELEMETRY || envVars.DISABLE_ERROR_REPORTING || envVars.DISABLE_BUG_COMMAND) {
    log(`Claude env: Global env applied (telemetry/reporting disabled)`);
  }

  // Filter out CCS-specific flags before passing to Claude CLI
  // Note: Proxy flags (--proxy-host, etc.) already stripped by resolveProxyConfig()
  const ccsFlags = [
    '--auth',
    '--headless',
    '--logout',
    '--config',
    '--add',
    '--accounts',
    '--use',
    '--nickname',
    '--incognito',
    '--no-incognito',
    '--import',
    // Proxy flags are handled by resolveProxyConfig, but list for documentation
    ...PROXY_CLI_FLAGS,
  ];
  const claudeArgs = argsWithoutProxy.filter((arg, idx) => {
    // Filter out CCS flags
    if (ccsFlags.includes(arg)) return false;
    // Filter out value after --use or --nickname
    if (argsWithoutProxy[idx - 1] === '--use' || argsWithoutProxy[idx - 1] === '--nickname')
      return false;
    return true;
  });

  const isWindows = process.platform === 'win32';
  const needsShell = isWindows && /\.(cmd|bat|ps1)$/i.test(claudeCli);

  let claude: ChildProcess;
  if (needsShell) {
    const cmdString = [claudeCli, ...claudeArgs].map(escapeShellArg).join(' ');
    claude = spawn(cmdString, {
      stdio: 'inherit',
      windowsHide: true,
      shell: true,
      env,
    });
  } else {
    claude = spawn(claudeCli, claudeArgs, {
      stdio: 'inherit',
      windowsHide: true,
      env,
    });
  }

  // 8. Cleanup: unregister session when Claude exits (local mode only)
  // Proxy persists by default - use 'ccs cliproxy stop' to kill manually
  // Capture port for cleanup (avoids closure issues)
  const sessionPort = cfg.port;
  claude.on('exit', (code, signal) => {
    log(`Claude exited: code=${code}, signal=${signal}`);

    // Unregister this session (proxy keeps running for persistence) - only for local mode
    if (sessionId) {
      unregisterSession(sessionId, sessionPort);
      log(`Session ${sessionId} unregistered, proxy persists for other sessions or future use`);
    }

    if (signal) {
      process.kill(process.pid, signal as NodeJS.Signals);
    } else {
      process.exit(code || 0);
    }
  });

  claude.on('error', (error) => {
    console.error(fail(`Claude CLI error: ${error}`));

    // Unregister session, proxy keeps running (local mode only)
    if (sessionId) {
      unregisterSession(sessionId, sessionPort);
    }
    process.exit(1);
  });

  // Handle parent process termination (SIGTERM, SIGINT)
  const cleanup = () => {
    log('Parent signal received, cleaning up');

    // Unregister session, proxy keeps running (local mode only)
    if (sessionId) {
      unregisterSession(sessionId, sessionPort);
    }
    claude.kill('SIGTERM');
  };

  process.once('SIGTERM', cleanup);
  process.once('SIGINT', cleanup);
}

/**
 * Check if a port is available
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close();
      resolve(true);
    });

    server.listen(port, '127.0.0.1');
  });
}

/**
 * Find an available port in range
 */
export async function findAvailablePort(
  startPort: number = CLIPROXY_DEFAULT_PORT,
  range: number = 10
): Promise<number> {
  for (let port = startPort; port < startPort + range; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found in range ${startPort}-${startPort + range - 1}`);
}

export default execClaudeWithCLIProxy;
