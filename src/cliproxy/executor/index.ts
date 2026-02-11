/**
 * CLIProxy Executor - Main Orchestrator
 *
 * Coordinates the full execution flow:
 * 1. Configuration resolution and validation
 * 2. Binary management and remote proxy checks
 * 3. Authentication and account management
 * 4. Proxy lifecycle (spawn/detect/join)
 * 5. Environment setup and proxy chains
 * 6. Claude CLI execution with cleanup handlers
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ProgressIndicator } from '../../utils/progress-indicator';
import { ok, fail, info, warn } from '../../utils/ui';
import { getCcsDir } from '../../utils/config-manager';
import { escapeShellArg } from '../../utils/shell-executor';
import { ensureCLIProxyBinary } from '../binary-manager';
import {
  generateConfig,
  getProviderConfig,
  ensureProviderSettings,
  getProviderSettingsPath,
  CLIPROXY_DEFAULT_PORT,
  validatePort,
} from '../config-generator';
import { checkRemoteProxy } from '../remote-proxy-client';
import { isAuthenticated } from '../auth-handler';
import { CLIProxyProvider, CLIProxyBackend, PLUS_ONLY_PROVIDERS, ExecutorConfig } from '../types';
import { DEFAULT_BACKEND } from '../platform-detector';
import { configureProviderModel, getCurrentModel } from '../model-config';
import { resolveProxyConfig, PROXY_CLI_FLAGS } from '../proxy-config-resolver';
import { supportsModelConfig, isModelBroken, getModelIssueUrl, findModel } from '../model-catalog';
import { CodexReasoningProxy } from '../codex-reasoning-proxy';
import { ToolSanitizationProxy } from '../tool-sanitization-proxy';
import {
  findAccountByQuery,
  getProviderAccounts,
  setDefaultAccount,
  touchAccount,
  renameAccount,
  getDefaultAccount,
} from '../account-manager';
import {
  ensureMcpWebSearch,
  installWebSearchHook,
  displayWebSearchStatus,
} from '../../utils/websearch-manager';
import { loadOrCreateUnifiedConfig } from '../../config/unified-config-loader';
import { installImageAnalyzerHook } from '../../utils/hooks';
import { HttpsTunnelProxy } from '../https-tunnel-proxy';

// Import modular components
import { waitForProxyReadyWithSpinner, spawnProxy } from './lifecycle-manager';
import { buildClaudeEnvironment, logEnvironment } from './env-resolver';
import {
  isNetworkError,
  handleNetworkError,
  handleTokenExpiration,
  handleQuotaCheck,
} from './retry-handler';
import { checkOrJoinProxy, registerProxySession, setupCleanupHandlers } from './session-bridge';
import { getWebSearchHookEnv } from '../../utils/websearch-manager';

/** Default executor configuration */
const DEFAULT_CONFIG: ExecutorConfig = {
  port: CLIPROXY_DEFAULT_PORT,
  timeout: 5000,
  verbose: false,
  pollInterval: 100,
};

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
  // Filter out undefined values to prevent overwriting defaults
  const filteredConfig = Object.fromEntries(
    Object.entries(config).filter(([, v]) => v !== undefined)
  ) as Partial<ExecutorConfig>;
  const cfg = { ...DEFAULT_CONFIG, ...filteredConfig };
  const verbose = cfg.verbose || args.includes('--verbose') || args.includes('-v');

  // Validate Claude CLI exists before proceeding
  if (!fs.existsSync(claudeCli)) {
    console.error(fail(`Claude CLI not found at: ${claudeCli}`));
    console.error('    Run "ccs doctor --fix" to reinstall or check your PATH');
    process.exit(1);
  }

  const log = (msg: string) => {
    if (verbose) {
      console.error(`[cliproxy] ${msg}`);
    }
  };

  // 0. Resolve proxy configuration (CLI > ENV > config.yaml > defaults)
  const unifiedConfig = loadOrCreateUnifiedConfig();

  // 0a. Runtime backend/provider validation
  const backend: CLIProxyBackend = unifiedConfig.cliproxy?.backend ?? DEFAULT_BACKEND;
  if (backend === 'original' && PLUS_ONLY_PROVIDERS.includes(provider)) {
    console.error('');
    console.error(fail(`${provider} requires CLIProxyAPIPlus backend`));
    console.error('');
    console.error('To use this provider, either:');
    console.error('  1. Set `cliproxy.backend: plus` in ~/.ccs/config.yaml');
    console.error('  2. Use --backend=plus flag: ccs ' + provider + ' --backend=plus');
    console.error('');
    throw new Error(`Provider ${provider} requires Plus backend`);
  }

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

  // Port resolution and validation
  if (cfg.port && cfg.port !== CLIPROXY_DEFAULT_PORT) {
    if (proxyConfig.port !== CLIPROXY_DEFAULT_PORT) {
      cfg.port = proxyConfig.port;
    }
  } else if (proxyConfig.port !== CLIPROXY_DEFAULT_PORT) {
    cfg.port = proxyConfig.port;
  }
  cfg.port = validatePort(cfg.port);

  log(`Proxy mode: ${proxyConfig.mode}`);
  if (proxyConfig.mode === 'remote') {
    log(`Remote host: ${proxyConfig.host}:${proxyConfig.port} (${proxyConfig.protocol})`);
  }

  // Setup WebSearch hooks
  ensureMcpWebSearch();
  installWebSearchHook();
  displayWebSearchStatus();

  // Sync image analyzer hook from npm package to ~/.ccs/hooks/
  installImageAnalyzerHook();

  const providerConfig = getProviderConfig(provider);
  log(`Provider: ${providerConfig.displayName}`);

  // Check remote proxy if configured
  let useRemoteProxy = false;
  if (proxyConfig.mode === 'remote' && proxyConfig.host) {
    const status = await checkRemoteProxy({
      host: proxyConfig.host,
      port: proxyConfig.port,
      protocol: proxyConfig.protocol,
      authToken: proxyConfig.authToken,
      timeout: proxyConfig.timeout ?? 2000,
      allowSelfSigned: proxyConfig.allowSelfSigned ?? false,
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
      const err = error as Error;

      if (isNetworkError(err)) {
        handleNetworkError(err);
      }

      throw error;
    }
  }

  // 2. Handle special flags (simplified flag parsing - full implementation continues below)
  const forceAuth = argsWithoutProxy.includes('--auth');
  const pasteCallback = argsWithoutProxy.includes('--paste-callback');
  const portForward = argsWithoutProxy.includes('--port-forward');
  const forceHeadless = argsWithoutProxy.includes('--headless');

  if (pasteCallback && portForward) {
    console.error(fail('Cannot use --paste-callback with --port-forward'));
    console.error('    --paste-callback: Manually paste OAuth redirect URL');
    console.error('    --port-forward: Use SSH port forwarding for callback');
    process.exit(1);
  }

  const forceLogout = argsWithoutProxy.includes('--logout');
  const forceConfig = argsWithoutProxy.includes('--config');
  const addAccount = argsWithoutProxy.includes('--add');
  const showAccounts = argsWithoutProxy.includes('--accounts');
  const forceImport = argsWithoutProxy.includes('--import');

  const incognitoFlag = argsWithoutProxy.includes('--incognito');
  const noIncognitoFlag = argsWithoutProxy.includes('--no-incognito');
  const kiroNoIncognitoConfig =
    provider === 'kiro' ? (unifiedConfig.cliproxy?.kiro_no_incognito ?? true) : false;
  const noIncognito = incognitoFlag ? false : noIncognitoFlag || kiroNoIncognitoConfig;

  // Parse --use flag
  let useAccount: string | undefined;
  const useIdx = argsWithoutProxy.indexOf('--use');
  if (
    useIdx !== -1 &&
    argsWithoutProxy[useIdx + 1] &&
    !argsWithoutProxy[useIdx + 1].startsWith('-')
  ) {
    useAccount = argsWithoutProxy[useIdx + 1];
  }

  // Parse --nickname flag
  let setNickname: string | undefined;
  const nicknameIdx = argsWithoutProxy.indexOf('--nickname');
  if (
    nicknameIdx !== -1 &&
    argsWithoutProxy[nicknameIdx + 1] &&
    !argsWithoutProxy[nicknameIdx + 1].startsWith('-')
  ) {
    setNickname = argsWithoutProxy[nicknameIdx + 1];
  }

  // Parse --thinking flag
  let thinkingOverride: string | number | undefined;
  const thinkingEqArg = argsWithoutProxy.find((arg) => arg.startsWith('--thinking='));
  if (thinkingEqArg) {
    const val = thinkingEqArg.substring('--thinking='.length);
    if (!val || val.trim() === '') {
      console.error(fail('--thinking requires a value'));
      console.error('    Examples: --thinking=low, --thinking=8192, --thinking=off');
      console.error('    Levels: minimal, low, medium, high, xhigh, auto');
      process.exit(1);
    }
    const numVal = parseInt(val, 10);
    thinkingOverride = !isNaN(numVal) ? numVal : val;

    const allThinkingFlags = argsWithoutProxy.filter(
      (arg) => arg === '--thinking' || arg.startsWith('--thinking=')
    );
    if (allThinkingFlags.length > 1) {
      console.warn(
        `[!] Multiple --thinking flags detected. Using first occurrence: ${thinkingEqArg}`
      );
    }
  } else {
    const thinkingIdx = argsWithoutProxy.indexOf('--thinking');
    if (thinkingIdx !== -1) {
      const nextArg = argsWithoutProxy[thinkingIdx + 1];
      if (!nextArg || nextArg.startsWith('-')) {
        console.error(fail('--thinking requires a value'));
        console.error('    Examples: --thinking low, --thinking 8192, --thinking off');
        console.error('    Levels: minimal, low, medium, high, xhigh, auto');
        process.exit(1);
      }
      const numVal = parseInt(nextArg, 10);
      thinkingOverride = !isNaN(numVal) ? numVal : nextArg;

      const allThinkingFlags = argsWithoutProxy.filter(
        (arg) => arg === '--thinking' || arg.startsWith('--thinking=')
      );
      if (allThinkingFlags.length > 1) {
        console.warn(
          `[!] Multiple --thinking flags detected. Using first occurrence: --thinking ${nextArg}`
        );
      }
    }
  }

  // Parse --1m / --no-1m flags for extended context (1M token window)
  let extendedContextOverride: boolean | undefined;
  const has1mFlag =
    argsWithoutProxy.includes('--1m') || argsWithoutProxy.some((arg) => arg.startsWith('--1m='));
  const hasNo1mFlag =
    argsWithoutProxy.includes('--no-1m') ||
    argsWithoutProxy.some((arg) => arg.startsWith('--no-1m='));

  if (has1mFlag && hasNo1mFlag) {
    console.error(fail('Cannot use both --1m and --no-1m flags'));
    process.exit(1);
  } else if (has1mFlag) {
    extendedContextOverride = true;
  } else if (hasNo1mFlag) {
    extendedContextOverride = false;
  }
  // undefined = auto behavior (Gemini: on, others: off)

  // Handle --accounts
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

  // Handle --use
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
    setDefaultAccount(provider, account.id);
    touchAccount(provider, account.id);
    console.log(ok(`Switched to account: ${account.nickname || account.email || account.id}`));
  }

  // Handle --nickname (rename account)
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

  // Handle --config
  if (forceConfig && supportsModelConfig(provider)) {
    await configureProviderModel(provider, true, cfg.customSettingsPath);
    process.exit(0);
  }

  // Handle --logout
  if (forceLogout) {
    const { clearAuth } = await import('../auth-handler');
    if (clearAuth(provider)) {
      console.log(ok(`Logged out from ${providerConfig.displayName}`));
    } else {
      console.log(info(`No authentication found for ${providerConfig.displayName}`));
    }
    process.exit(0);
  }

  // Handle --import (Kiro only)
  if (forceImport) {
    if (provider !== 'kiro') {
      console.error(fail('--import is only available for Kiro'));
      console.error(`    Run "ccs ${provider} --auth" to authenticate`);
      process.exit(1);
    }
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
    const { triggerOAuth } = await import('../auth-handler');
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
  const remoteAuthToken = proxyConfig.authToken?.trim();
  const skipLocalAuth = useRemoteProxy && !!remoteAuthToken;
  if (skipLocalAuth) {
    log(`Using remote proxy authentication (skipping local OAuth)`);
  }

  if (providerConfig.requiresOAuth && !skipLocalAuth) {
    log(`Checking authentication for ${provider}`);

    if (forceAuth || !isAuthenticated(provider)) {
      const { triggerOAuth } = await import('../auth-handler');
      const authSuccess = await triggerOAuth(provider, {
        verbose,
        add: addAccount,
        ...(forceHeadless ? { headless: true } : {}),
        ...(setNickname ? { nickname: setNickname } : {}),
        ...(noIncognito ? { noIncognito: true } : {}),
        ...(pasteCallback ? { pasteCallback: true } : {}),
        ...(portForward ? { portForward: true } : {}),
      });
      if (!authSuccess) {
        throw new Error(`Authentication required for ${providerConfig.displayName}`);
      }
      if (forceAuth) {
        process.exit(0);
      }
    } else {
      log(`${provider} already authenticated`);
    }

    // 3a. Proactive token refresh
    await handleTokenExpiration(provider, verbose);

    // 3a-1. Update lastUsedAt
    const usedAccount = getDefaultAccount(provider);
    if (usedAccount) {
      touchAccount(provider, usedAccount.id);
    }
  }

  // 3b. Preflight quota check (Antigravity only)
  if (!skipLocalAuth) {
    await handleQuotaCheck(provider);
  }

  // 4. First-run model configuration
  if (supportsModelConfig(provider) && !skipLocalAuth) {
    await configureProviderModel(provider, false, cfg.customSettingsPath);
  }

  // 5. Check for broken models
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
    if (skipLocalAuth) {
      console.error('    Note: Model may be overridden by remote proxy configuration.');
    } else {
      console.error(`    Run "ccs ${provider} --config" to change model.`);
    }
    console.error('');
  }

  // 6. Ensure user settings file exists
  ensureProviderSettings(provider);

  // Local proxy mode: generate config, spawn/join proxy, track session
  let proxy: ChildProcess | null = null;
  let configPath: string | undefined;

  if (!useRemoteProxy) {
    log(`Generating config for ${provider}`);
    configPath = generateConfig(provider, cfg.port);
    log(`Config written: ${configPath}`);

    // 6a. Check or join existing proxy
    const { sessionId: existingSessionId, shouldSpawn } = await checkOrJoinProxy(
      cfg.port,
      cfg.timeout,
      verbose
    );

    sessionId = existingSessionId;

    // 6b. Spawn new proxy if needed
    if (shouldSpawn && binaryPath) {
      proxy = spawnProxy(binaryPath, configPath, verbose);

      // 7. Wait for proxy readiness
      await waitForProxyReadyWithSpinner(
        cfg.port,
        cfg.timeout,
        cfg.pollInterval,
        backend,
        configPath
      );

      // Register session
      if (proxy.pid) {
        sessionId = registerProxySession(cfg.port, proxy.pid, backend, verbose);
      }
    }
  }

  // 8. Setup HTTPS tunnel if needed
  let httpsTunnel: HttpsTunnelProxy | null = null;
  let tunnelPort: number | null = null;

  if (useRemoteProxy && proxyConfig.protocol === 'https' && proxyConfig.host) {
    try {
      httpsTunnel = new HttpsTunnelProxy({
        remoteHost: proxyConfig.host,
        remotePort: proxyConfig.port,
        authToken: proxyConfig.authToken,
        verbose,
        allowSelfSigned: proxyConfig.allowSelfSigned ?? false,
      });
      tunnelPort = await httpsTunnel.start();
      log(
        `HTTPS tunnel started on port ${tunnelPort} → https://${proxyConfig.host}:${proxyConfig.port}`
      );
    } catch (error) {
      const err = error as Error;
      console.error(warn(`Failed to start HTTPS tunnel: ${err.message}`));
      throw new Error(`HTTPS tunnel startup failed: ${err.message}`);
    }
  }

  // 9. Setup tool sanitization proxy
  let toolSanitizationProxy: ToolSanitizationProxy | null = null;
  let toolSanitizationPort: number | null = null;

  // Build initial env vars to get ANTHROPIC_BASE_URL
  const initialEnvVars = buildClaudeEnvironment({
    provider,
    useRemoteProxy,
    remoteConfig: proxyConfig.host
      ? {
          host: proxyConfig.host,
          port: proxyConfig.port,
          protocol: proxyConfig.protocol,
          authToken: proxyConfig.authToken,
        }
      : undefined,
    httpsTunnel: httpsTunnel ?? undefined,
    tunnelPort: tunnelPort ?? undefined,
    localPort: cfg.port,
    customSettingsPath: cfg.customSettingsPath,
    thinkingOverride,
    extendedContextOverride,
    verbose,
  });

  if (initialEnvVars.ANTHROPIC_BASE_URL) {
    try {
      toolSanitizationProxy = new ToolSanitizationProxy({
        upstreamBaseUrl: initialEnvVars.ANTHROPIC_BASE_URL,
        verbose,
        warnOnSanitize: true,
      });
      toolSanitizationPort = await toolSanitizationProxy.start();
      log(`Tool sanitization proxy active on port ${toolSanitizationPort}`);
    } catch (error) {
      const err = error as Error;
      toolSanitizationProxy = null;
      toolSanitizationPort = null;
      if (verbose) {
        console.error(warn(`Tool sanitization proxy disabled: ${err.message}`));
      }
    }
  }

  const postSanitizationBaseUrl = toolSanitizationPort
    ? `http://127.0.0.1:${toolSanitizationPort}`
    : initialEnvVars.ANTHROPIC_BASE_URL;

  // 10. Setup Codex reasoning proxy (Codex only)
  let codexReasoningProxy: CodexReasoningProxy | null = null;
  let codexReasoningPort: number | null = null;

  if (provider === 'codex') {
    if (!postSanitizationBaseUrl) {
      log('ANTHROPIC_BASE_URL not set for Codex, reasoning proxy disabled');
    } else {
      try {
        const traceEnabled =
          process.env.CCS_CODEX_REASONING_TRACE === '1' ||
          process.env.CCS_CODEX_REASONING_TRACE === 'true';
        const stripPathPrefix = useRemoteProxy ? '/api/provider/codex' : undefined;
        codexReasoningProxy = new CodexReasoningProxy({
          upstreamBaseUrl: postSanitizationBaseUrl,
          verbose,
          defaultEffort: 'medium',
          traceFilePath: traceEnabled ? path.join(getCcsDir(), 'codex-reasoning-proxy.log') : '',
          modelMap: {
            defaultModel: initialEnvVars.ANTHROPIC_MODEL,
            opusModel: initialEnvVars.ANTHROPIC_DEFAULT_OPUS_MODEL,
            sonnetModel: initialEnvVars.ANTHROPIC_DEFAULT_SONNET_MODEL,
            haikuModel: initialEnvVars.ANTHROPIC_DEFAULT_HAIKU_MODEL,
          },
          stripPathPrefix,
        });
        codexReasoningPort = await codexReasoningProxy.start();
        log(
          `Codex reasoning proxy active: http://127.0.0.1:${codexReasoningPort}/api/provider/codex`
        );
      } catch (error) {
        const err = error as Error;
        codexReasoningProxy = null;
        codexReasoningPort = null;
        if (verbose) {
          console.error(warn(`Codex reasoning proxy disabled: ${err.message}`));
        }
      }
    }
  }

  // 11. Build final environment with all proxy chains
  const env = buildClaudeEnvironment({
    provider,
    useRemoteProxy,
    remoteConfig: proxyConfig.host
      ? {
          host: proxyConfig.host,
          port: proxyConfig.port,
          protocol: proxyConfig.protocol,
          authToken: proxyConfig.authToken,
        }
      : undefined,
    httpsTunnel: httpsTunnel ?? undefined,
    tunnelPort: tunnelPort ?? undefined,
    codexReasoningProxy: codexReasoningProxy ?? undefined,
    codexReasoningPort: codexReasoningPort ?? undefined,
    toolSanitizationProxy: toolSanitizationProxy ?? undefined,
    toolSanitizationPort: toolSanitizationPort ?? undefined,
    localPort: cfg.port,
    customSettingsPath: cfg.customSettingsPath,
    thinkingOverride,
    extendedContextOverride,
    verbose,
  });

  const webSearchEnv = getWebSearchHookEnv();
  logEnvironment(env, webSearchEnv, verbose);

  // 12. Filter CCS-specific flags before passing to Claude CLI
  const ccsFlags = [
    '--auth',
    '--paste-callback',
    '--port-forward',
    '--headless',
    '--logout',
    '--config',
    '--add',
    '--accounts',
    '--use',
    '--nickname',
    '--thinking',
    '--1m',
    '--no-1m',
    '--incognito',
    '--no-incognito',
    '--import',
    '--settings',
    ...PROXY_CLI_FLAGS,
  ];
  const claudeArgs = argsWithoutProxy.filter((arg, idx) => {
    if (ccsFlags.includes(arg)) return false;
    if (arg.startsWith('--thinking=')) return false;
    if (arg.startsWith('--1m=') || arg.startsWith('--no-1m=')) return false;
    if (
      argsWithoutProxy[idx - 1] === '--use' ||
      argsWithoutProxy[idx - 1] === '--nickname' ||
      argsWithoutProxy[idx - 1] === '--thinking'
    )
      return false;
    return true;
  });

  const isWindows = process.platform === 'win32';
  const needsShell = isWindows && /\.(cmd|bat|ps1)$/i.test(claudeCli);

  const settingsPath = cfg.customSettingsPath
    ? cfg.customSettingsPath.replace(/^~/, os.homedir())
    : getProviderSettingsPath(provider);

  let claude: ChildProcess;
  if (needsShell) {
    const cmdString = [claudeCli, '--settings', settingsPath, ...claudeArgs]
      .map(escapeShellArg)
      .join(' ');
    claude = spawn(cmdString, {
      stdio: 'inherit',
      windowsHide: true,
      shell: true,
      env,
    });
  } else {
    claude = spawn(claudeCli, ['--settings', settingsPath, ...claudeArgs], {
      stdio: 'inherit',
      windowsHide: true,
      env,
    });
  }

  // 13. Setup cleanup handlers
  setupCleanupHandlers(
    claude,
    sessionId,
    cfg.port,
    codexReasoningProxy,
    toolSanitizationProxy,
    httpsTunnel,
    verbose
  );
}

// Re-export utility functions for backwards compatibility
export { isPortAvailable, findAvailablePort } from './lifecycle-manager';

export default execClaudeWithCLIProxy;
