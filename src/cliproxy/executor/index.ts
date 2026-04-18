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
import { reconcileCodexModelForActivePlan } from '../codex-plan-compatibility';
import { resolveProxyConfig, PROXY_CLI_FLAGS } from '../proxy-config-resolver';
import {
  supportsModelConfig,
  isModelBroken,
  getModelIssueUrl,
  findModel,
  getSuggestedReplacementModel,
} from '../model-catalog';
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
import { formatAccountDisplayName } from '../accounts/email-account-identity';
import {
  ensureWebSearchMcpOrThrow,
  displayWebSearchStatus,
  appendThirdPartyWebSearchToolArgs,
  createWebSearchTraceContext,
} from '../../utils/websearch-manager';
import {
  ensureImageAnalysisMcpOrThrow,
  syncImageAnalysisMcpToConfigDir,
  appendThirdPartyImageAnalysisToolArgs,
} from '../../utils/image-analysis';
import {
  appendBrowserToolArgs,
  ensureBrowserMcpOrThrow,
  getEffectiveClaudeBrowserAttachConfig,
  resolveOptionalBrowserAttachRuntime,
  syncBrowserMcpToConfigDir,
} from '../../utils/browser';
import {
  getBrowserConfig,
  loadOrCreateUnifiedConfig,
  getThinkingConfig,
} from '../../config/unified-config-loader';
import { HttpsTunnelProxy } from '../https-tunnel-proxy';
import {
  isKiroAuthMethod,
  isKiroIDCFlow,
  KiroAuthMethod,
  KiroIDCFlow,
  normalizeKiroAuthMethod,
  normalizeKiroIDCFlow,
} from '../auth/auth-types';
import { resolveProfileContinuityInheritance } from '../../auth/profile-continuity-inheritance';

// Import modular components
import { waitForProxyReadyWithSpinner, spawnProxy } from './lifecycle-manager';
import {
  buildClaudeEnvironment,
  logEnvironment,
  resolveCliproxyImageAnalysisEnv,
} from './env-resolver';
import {
  isNetworkError,
  handleNetworkError,
  handleTokenExpiration,
  handleQuotaCheck,
} from './retry-handler';
import { checkOrJoinProxy, registerProxySession, setupCleanupHandlers } from './session-bridge';
import { parseThinkingOverride } from './thinking-arg-parser';
import {
  warnCrossProviderDuplicates,
  warnOAuthBanRisk,
  cleanupStaleAutoPauses,
  enforceProviderIsolation,
  restoreAutoPausedAccounts,
} from '../account-safety';
import {
  ensureCliAntigravityResponsibility,
  hasAntigravityRiskAcceptanceFlag,
  ANTIGRAVITY_ACCEPT_RISK_FLAGS,
} from '../antigravity-responsibility';
import { getWebSearchHookEnv } from '../../utils/websearch-manager';
import {
  buildThinkingStartupStatus,
  resolveRuntimeThinkingOverride,
  shouldDisableCodexReasoning,
} from './thinking-override-resolver';

/** Default executor configuration */
const DEFAULT_CONFIG: ExecutorConfig = {
  port: CLIPROXY_DEFAULT_PORT,
  timeout: 5000,
  verbose: false,
  pollInterval: 100,
};

export function readOptionValue(
  args: string[],
  flag: string
): { present: boolean; value?: string; missingValue: boolean } {
  const inlinePrefix = `${flag}=`;
  const inlineArg = args.find((arg) => arg.startsWith(inlinePrefix));
  if (inlineArg !== undefined) {
    const value = inlineArg.slice(inlinePrefix.length).trim();
    return {
      present: true,
      value: value.length > 0 ? value : undefined,
      missingValue: value.length === 0,
    };
  }

  const index = args.indexOf(flag);
  if (index === -1) {
    return { present: false, missingValue: false };
  }

  const next = args[index + 1];
  if (!next || next.startsWith('-')) {
    return { present: true, missingValue: true };
  }

  return { present: true, value: next.trim(), missingValue: false };
}

export function hasGitLabTokenLoginFlag(args: string[]): boolean {
  return args.includes('--gitlab-token-login') || args.includes('--token-login');
}

function getGitLabTokenLoginFlagName(args: string[]): '--gitlab-token-login' | '--token-login' {
  return args.includes('--gitlab-token-login') ? '--gitlab-token-login' : '--token-login';
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

  // Helper: Extract unique providers from composite tiers
  const compositeProviders =
    cfg.isComposite && cfg.compositeTiers
      ? [...new Set(Object.values(cfg.compositeTiers).map((t) => t.provider))]
      : [];

  // 0. Resolve proxy configuration (CLI > ENV > config.yaml > defaults)
  const unifiedConfig = loadOrCreateUnifiedConfig();

  // 0a. Runtime backend/provider validation
  const backend: CLIProxyBackend = unifiedConfig.cliproxy?.backend ?? DEFAULT_BACKEND;

  // Collect all providers to validate (default + composite tiers)
  const allProviders = [provider, ...compositeProviders];
  for (const p of allProviders) {
    if (backend === 'original' && PLUS_ONLY_PROVIDERS.includes(p as CLIProxyProvider)) {
      console.error('');
      console.error(fail(`${p} requires CLIProxyAPIPlus backend`));
      console.error('');
      console.error('To use this provider, either:');
      console.error('  1. Set `cliproxy.backend: plus` in ~/.ccs/config.yaml');
      console.error('  2. Use --backend=plus flag: ccs ' + p + ' --backend=plus');
      console.error('');
      throw new Error(`Provider ${p} requires Plus backend`);
    }
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
          management_key: cliproxyServerConfig.remote.management_key,
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

  // Setup first-class CCS WebSearch runtime
  ensureWebSearchMcpOrThrow();
  const imageAnalysisMcpReady = ensureImageAnalysisMcpOrThrow();
  const browserAttachConfig = getEffectiveClaudeBrowserAttachConfig(getBrowserConfig());
  const browserAttachRuntime = browserAttachConfig.enabled
    ? await resolveOptionalBrowserAttachRuntime(browserAttachConfig)
    : undefined;
  const browserRuntimeEnv = browserAttachRuntime?.runtimeEnv;
  if (browserAttachRuntime?.warning) {
    console.error(warn(browserAttachRuntime.warning));
  }
  if (browserRuntimeEnv) {
    ensureBrowserMcpOrThrow();
  }
  displayWebSearchStatus();

  const providerConfig = getProviderConfig(provider);
  log(`Provider: ${providerConfig.displayName}`);
  warnOAuthBanRisk(provider);

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
      binaryPath = await ensureCLIProxyBinary(verbose, { skipAutoUpdate: true });
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
  const gitlabTokenLogin = hasGitLabTokenLoginFlag(argsWithoutProxy);
  const acceptAgyRisk = hasAntigravityRiskAcceptanceFlag(argsWithoutProxy);

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

  // Parse --kiro-auth-method flag
  let kiroAuthMethod: KiroAuthMethod | undefined;
  const kiroMethodValue = readOptionValue(argsWithoutProxy, '--kiro-auth-method');
  if (kiroMethodValue.present) {
    const rawMethod = kiroMethodValue.value;
    if (kiroMethodValue.missingValue || !rawMethod) {
      console.error(fail('--kiro-auth-method requires a value'));
      console.error('    Supported values: aws, aws-authcode, google, github, idc');
      process.exitCode = 1;
      return;
    }
    const normalized = rawMethod.trim().toLowerCase();
    if (!isKiroAuthMethod(normalized)) {
      console.error(fail(`Invalid --kiro-auth-method value: ${rawMethod}`));
      console.error('    Supported values: aws, aws-authcode, google, github, idc');
      process.exitCode = 1;
      return;
    }
    kiroAuthMethod = normalizeKiroAuthMethod(normalized);
  }

  let kiroIDCStartUrl: string | undefined;
  const kiroIDCStartUrlValue = readOptionValue(argsWithoutProxy, '--kiro-idc-start-url');
  if (kiroIDCStartUrlValue.present && kiroIDCStartUrlValue.value) {
    kiroIDCStartUrl = kiroIDCStartUrlValue.value;
  } else if (kiroIDCStartUrlValue.present) {
    console.error(fail('--kiro-idc-start-url requires a value'));
    process.exitCode = 1;
    return;
  }

  let kiroIDCRegion: string | undefined;
  const kiroIDCRegionValue = readOptionValue(argsWithoutProxy, '--kiro-idc-region');
  if (kiroIDCRegionValue.present && kiroIDCRegionValue.value) {
    kiroIDCRegion = kiroIDCRegionValue.value;
  } else if (kiroIDCRegionValue.present) {
    console.error(fail('--kiro-idc-region requires a value'));
    process.exitCode = 1;
    return;
  }

  let kiroIDCFlow: KiroIDCFlow | undefined;
  const kiroIDCFlowValue = readOptionValue(argsWithoutProxy, '--kiro-idc-flow');
  if (kiroIDCFlowValue.present) {
    const rawFlow = kiroIDCFlowValue.value;
    if (kiroIDCFlowValue.missingValue || !rawFlow) {
      console.error(fail('--kiro-idc-flow requires a value'));
      console.error('    Supported values: authcode, device');
      process.exitCode = 1;
      return;
    }
    const normalized = rawFlow.trim().toLowerCase();
    if (!isKiroIDCFlow(normalized)) {
      console.error(fail(`Invalid --kiro-idc-flow value: ${rawFlow}`));
      console.error('    Supported values: authcode, device');
      process.exitCode = 1;
      return;
    }
    kiroIDCFlow = normalizeKiroIDCFlow(normalized);
  }

  let gitlabBaseUrl: string | undefined;
  const gitlabBaseUrlValue = readOptionValue(argsWithoutProxy, '--gitlab-url');
  if (gitlabBaseUrlValue.present && gitlabBaseUrlValue.value) {
    gitlabBaseUrl = gitlabBaseUrlValue.value.trim();
  } else if (gitlabBaseUrlValue.present) {
    console.error(fail('--gitlab-url requires a value'));
    process.exitCode = 1;
    return;
  }

  if (kiroAuthMethod && provider !== 'kiro' && !compositeProviders.includes('kiro')) {
    console.error(fail('--kiro-auth-method is only valid for ccs kiro'));
    process.exitCode = 1;
    return;
  }

  if (
    (kiroIDCStartUrl || kiroIDCRegion || kiroIDCFlow) &&
    provider !== 'kiro' &&
    !compositeProviders.includes('kiro')
  ) {
    console.error(
      fail(
        '--kiro-idc-start-url, --kiro-idc-region, and --kiro-idc-flow are only valid for ccs kiro'
      )
    );
    process.exitCode = 1;
    return;
  }

  if (!kiroAuthMethod && (kiroIDCStartUrl || kiroIDCRegion || kiroIDCFlow)) {
    kiroAuthMethod = 'idc';
  }

  if (kiroAuthMethod === 'idc' && !kiroIDCStartUrl) {
    console.error(fail('Kiro IDC login requires --kiro-idc-start-url'));
    console.error(
      '    Example: ccs kiro --auth --kiro-auth-method idc --kiro-idc-start-url https://d-xxx.awsapps.com/start'
    );
    process.exitCode = 1;
    return;
  }

  if (
    kiroAuthMethod &&
    kiroAuthMethod !== 'idc' &&
    (kiroIDCStartUrl || kiroIDCRegion || kiroIDCFlow)
  ) {
    console.error(
      fail(
        '--kiro-idc-start-url, --kiro-idc-region, and --kiro-idc-flow require --kiro-auth-method idc'
      )
    );
    process.exitCode = 1;
    return;
  }

  if ((gitlabTokenLogin || gitlabBaseUrl) && provider !== 'gitlab') {
    const flagName = gitlabTokenLogin
      ? getGitLabTokenLoginFlagName(argsWithoutProxy)
      : '--gitlab-url';
    console.error(fail(`${flagName} is only valid for ccs gitlab`));
    process.exitCode = 1;
    return;
  }

  // Parse --thinking / --effort flags (aliases; first occurrence wins)
  const thinkingParse = parseThinkingOverride(argsWithoutProxy);
  if (thinkingParse.error) {
    const { flag } = thinkingParse.error;
    console.error(fail(`${flag} requires a value`));

    if (provider === 'codex') {
      console.error('    Codex examples: --effort xhigh, --effort high, --effort medium');
      console.error('    Alias: --thinking xhigh (same behavior)');
    } else {
      console.error('    Examples: --thinking low, --thinking 8192, --thinking off');
      console.error('    Levels: minimal, low, medium, high, xhigh, auto');
    }

    process.exit(1);
  }

  const { thinkingOverride, thinkingSource } = resolveRuntimeThinkingOverride(
    thinkingParse.value,
    process.env.CCS_THINKING
  );
  const thinkingCfg = getThinkingConfig();

  if (thinkingParse.duplicateDisplays.length > 0) {
    console.warn(
      `[!] Multiple reasoning flags detected. Using first occurrence: ${thinkingParse.sourceDisplay}`
    );
  }

  if (thinkingParse.sourceFlag === '--effort' && provider !== 'codex') {
    console.warn(
      warn(
        '`--effort` is primarily for codex. Continuing as alias of `--thinking` for compatibility.'
      )
    );
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
        console.log(`  ${nickname.padEnd(12)} ${formatAccountDisplayName(acct)}${defaultMark}`);
      }
      console.log(`\n  Use "ccs ${provider} --use <nickname-or-id>" to switch accounts`);
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
          const displayName = formatAccountDisplayName(acct);
          const label = acct.nickname ? `${acct.nickname} (${displayName})` : displayName;
          console.error(`      - ${label}`);
        }
      }
      process.exit(1);
    }
    setDefaultAccount(provider, account.id);
    touchAccount(provider, account.id);
    const switchedLabel = account.nickname
      ? `${account.nickname} (${formatAccountDisplayName(account)})`
      : formatAccountDisplayName(account);
    console.log(ok(`Switched to account: ${switchedLabel}`));
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
    // Block --config for composite variants (per-tier models in config.yaml)
    if (cfg.isComposite) {
      const variantName = cfg.profileName || provider;
      console.log(
        warn('Composite variants use per-tier config. Edit config.yaml to change tier models.')
      );
      console.error(`    Use "ccs cliproxy edit ${variantName}" to modify composite variants`);
      process.exit(1);
    } else {
      await configureProviderModel(provider, true, cfg.customSettingsPath);
      process.exit(0);
    }
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
      ...(kiroAuthMethod ? { kiroMethod: kiroAuthMethod } : {}),
      ...(kiroIDCStartUrl ? { kiroIDCStartUrl } : {}),
      ...(kiroIDCRegion ? { kiroIDCRegion } : {}),
      ...(kiroIDCFlow ? { kiroIDCFlow } : {}),
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

  if (provider === 'agy' && forceAuth && skipLocalAuth) {
    const acknowledged = await ensureCliAntigravityResponsibility({
      context: 'oauth',
      acceptedByFlag: acceptAgyRisk,
    });
    if (!acknowledged) {
      throw new Error(
        `Antigravity auth blocked. Re-run after completing confirmation or pass ${ANTIGRAVITY_ACCEPT_RISK_FLAGS[0]}.`
      );
    }
    console.error(info('Remote proxy mode is active; local OAuth flow is skipped in --auth mode.'));
    return;
  }

  if (provider === 'agy' && !forceAuth) {
    const requiresAuthNow = providerConfig.requiresOAuth && !isAuthenticated(provider);
    if (skipLocalAuth || !requiresAuthNow) {
      const acknowledged = await ensureCliAntigravityResponsibility({
        context: 'run',
        acceptedByFlag: acceptAgyRisk,
      });
      if (!acknowledged) {
        console.error(
          fail(
            `Antigravity session blocked. Re-run after completing confirmation or pass ${ANTIGRAVITY_ACCEPT_RISK_FLAGS[0]}.`
          )
        );
        process.exit(1);
      }
    }
  }

  if (providerConfig.requiresOAuth && !skipLocalAuth) {
    log(`Checking authentication for ${provider}`);

    // Multi-provider auth check for composite variants
    if (compositeProviders.length > 0) {
      // Handle forceAuth for composite providers
      if (forceAuth) {
        const { triggerOAuth } = await import('../auth-handler');
        const failures: string[] = [];
        for (const p of compositeProviders) {
          const authSuccess = await triggerOAuth(p, {
            verbose,
            add: addAccount,
            ...(acceptAgyRisk ? { acceptAgyRisk: true } : {}),
            ...(kiroAuthMethod && p === 'kiro' ? { kiroMethod: kiroAuthMethod } : {}),
            ...(kiroIDCStartUrl && p === 'kiro' ? { kiroIDCStartUrl } : {}),
            ...(kiroIDCRegion && p === 'kiro' ? { kiroIDCRegion } : {}),
            ...(kiroIDCFlow && p === 'kiro' ? { kiroIDCFlow } : {}),
            ...(gitlabTokenLogin && p === 'gitlab' ? { gitlabAuthMode: 'pat' as const } : {}),
            ...(gitlabBaseUrl && p === 'gitlab' ? { gitlabBaseUrl } : {}),
            ...(forceHeadless ? { headless: true } : {}),
            ...(setNickname ? { nickname: setNickname } : {}),
            ...(noIncognito ? { noIncognito: true } : {}),
            ...(pasteCallback ? { pasteCallback: true } : {}),
            ...(portForward ? { portForward: true } : {}),
          });
          if (!authSuccess) {
            failures.push(p);
          }
        }
        if (failures.length > 0) {
          const succeeded = compositeProviders.filter((p) => !failures.includes(p));
          console.error(fail(`Auth failed for: ${failures.join(', ')}`));
          if (succeeded.length > 0) {
            console.error(info(`Succeeded: ${succeeded.join(', ')}`));
          }
          process.exit(1);
        }
        process.exit(0);
      }

      // Check for unauthenticated providers
      const unauthenticatedProviders: string[] = [];
      for (const p of compositeProviders) {
        if (!isAuthenticated(p)) {
          unauthenticatedProviders.push(p);
        }
      }
      if (unauthenticatedProviders.length > 0) {
        console.error(fail('Composite variant requires authentication for multiple providers:'));
        for (const p of unauthenticatedProviders) {
          console.error(`    - ${p} (run "ccs ${p} --auth")`);
        }
        process.exit(1);
      }
    } else if (forceAuth || !isAuthenticated(provider)) {
      const { triggerOAuth } = await import('../auth-handler');
      const authSuccess = await triggerOAuth(provider, {
        verbose,
        add: addAccount,
        ...(acceptAgyRisk ? { acceptAgyRisk: true } : {}),
        ...(kiroAuthMethod ? { kiroMethod: kiroAuthMethod } : {}),
        ...(kiroIDCStartUrl ? { kiroIDCStartUrl } : {}),
        ...(kiroIDCRegion ? { kiroIDCRegion } : {}),
        ...(kiroIDCFlow ? { kiroIDCFlow } : {}),
        ...(gitlabTokenLogin ? { gitlabAuthMode: 'pat' as const } : {}),
        ...(gitlabBaseUrl ? { gitlabBaseUrl } : {}),
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

    // 3a. Proactive token refresh (multi-provider for composite)
    if (compositeProviders.length > 0) {
      for (const p of compositeProviders) {
        await handleTokenExpiration(p, verbose);
      }
    } else {
      await handleTokenExpiration(provider, verbose);
    }

    // 3a-1. Update lastUsedAt
    const usedAccount = getDefaultAccount(provider);
    if (usedAccount) {
      touchAccount(provider, usedAccount.id);
    }
  }

  // 3b. Preflight quota check (providers with quota-based rotation)
  if (!skipLocalAuth) {
    // Multi-tier quota check for composite variants (check if any tier uses a managed provider)
    if (compositeProviders.length > 0) {
      const managedQuotaProviders = ['agy', 'claude'] as const;
      for (const managedProvider of managedQuotaProviders) {
        if (compositeProviders.includes(managedProvider)) {
          await handleQuotaCheck(managedProvider);
        }
      }
    } else {
      await handleQuotaCheck(provider);
    }
  }

  // 3c. Account safety: enforce cross-provider isolation
  if (!skipLocalAuth) {
    cleanupStaleAutoPauses();
    const isolated = enforceProviderIsolation(provider);
    if (isolated === 0) {
      // No enforcement — still warn about duplicates for awareness
      warnCrossProviderDuplicates(provider);
    } else {
      // 'exit' handlers must be synchronous — restoreAutoPausedAccounts uses sync fs APIs
      process.on('exit', () => {
        restoreAutoPausedAccounts(provider);
      });
    }
  }

  // 4. First-run model configuration
  if (!cfg.isComposite && supportsModelConfig(provider) && !skipLocalAuth) {
    await configureProviderModel(provider, false, cfg.customSettingsPath);
  }

  // 5. Check for broken models (multi-tier for composite)
  if (compositeProviders.length > 0 && cfg.compositeTiers) {
    // Check all tier models in composite variant
    const tiers: Array<'opus' | 'sonnet' | 'haiku'> = ['opus', 'sonnet', 'haiku'];
    for (const tier of tiers) {
      const tierConfig = cfg.compositeTiers[tier];
      if (tierConfig && isModelBroken(tierConfig.provider, tierConfig.model)) {
        const modelEntry = findModel(tierConfig.provider, tierConfig.model);
        const issueUrl = getModelIssueUrl(tierConfig.provider, tierConfig.model);
        console.error('');
        console.error(
          warn(
            `${tier} tier: ${modelEntry?.name || tierConfig.model} has known issues with Claude Code`
          )
        );
        console.error('    Tool calls will fail. Consider changing the model in config.yaml.');
        if (issueUrl) {
          console.error(`    Tracking: ${issueUrl}`);
        }
        console.error('');
      }
    }
  } else {
    const currentModel = getCurrentModel(provider, cfg.customSettingsPath);
    if (currentModel && isModelBroken(provider, currentModel)) {
      const modelEntry = findModel(provider, currentModel);
      const issueUrl = getModelIssueUrl(provider, currentModel);
      const replacementModel = getSuggestedReplacementModel(provider, currentModel);
      console.error('');
      console.error(warn(`${modelEntry?.name || currentModel} has known issues with Claude Code`));
      if (replacementModel) {
        console.error(`    Tool calls will fail. Use "${replacementModel}" instead.`);
      } else {
        console.error('    Tool calls will fail. Consider changing the model in config.yaml.');
      }
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
  }

  // 6. Ensure user settings file exists
  ensureProviderSettings(provider);

  if (provider === 'codex' && !cfg.isComposite && !skipLocalAuth) {
    await reconcileCodexModelForActivePlan({
      currentModel: getCurrentModel(provider, cfg.customSettingsPath),
      verbose,
    });
  }

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

  const imageAnalysisProxyTarget =
    useRemoteProxy && proxyConfig.host
      ? {
          host: proxyConfig.host,
          port: proxyConfig.port,
          protocol: proxyConfig.protocol,
          authToken: proxyConfig.authToken,
          managementKey: proxyConfig.managementKey,
          allowSelfSigned: proxyConfig.allowSelfSigned,
          isRemote: true as const,
        }
      : {
          host: '127.0.0.1',
          port: cfg.port,
          protocol: 'http' as const,
          isRemote: false as const,
        };
  const imageAnalysisResolution = await resolveCliproxyImageAnalysisEnv({
    profileName: cfg.profileName || provider,
    provider,
    profileSettingsPath: cfg.customSettingsPath,
    isComposite: cfg.isComposite,
    proxyTarget: imageAnalysisProxyTarget,
    tunnelPort,
    proxyReachable: true,
  });
  const imageAnalysisProvisioningFailed =
    !imageAnalysisMcpReady && imageAnalysisResolution.env.CCS_IMAGE_ANALYSIS_ENABLED === '1';
  const imageAnalysisEnv = {
    ...imageAnalysisResolution.env,
    CCS_IMAGE_ANALYSIS_SKIP_HOOK: imageAnalysisMcpReady ? '1' : '0',
  };
  const imageAnalysisWarning = imageAnalysisProvisioningFailed
    ? 'ImageAnalysis MCP provisioning failed. This session will use compatibility fallback when available.'
    : imageAnalysisResolution.warning;

  // 9. Setup tool sanitization proxy
  let toolSanitizationProxy: ToolSanitizationProxy | null = null;
  let toolSanitizationPort: number | null = null;
  let inheritedClaudeConfigDir = cfg.claudeConfigDir;

  if (!inheritedClaudeConfigDir && cfg.profileName) {
    const continuityInheritance = await resolveProfileContinuityInheritance({
      profileName: cfg.profileName,
      profileType: 'cliproxy',
      target: 'claude',
    });
    inheritedClaudeConfigDir = continuityInheritance.claudeConfigDir;
    if (continuityInheritance.sourceAccount && process.env.CCS_DEBUG) {
      log(
        `Continuity inheritance active: profile "${cfg.profileName}" -> account "${continuityInheritance.sourceAccount}"`
      );
    }
  }

  syncImageAnalysisMcpToConfigDir(inheritedClaudeConfigDir);
  if (
    browserRuntimeEnv &&
    inheritedClaudeConfigDir &&
    !syncBrowserMcpToConfigDir(inheritedClaudeConfigDir)
  ) {
    throw new Error(
      'Browser MCP is enabled, but CCS could not sync the browser MCP config into the inherited Claude instance.'
    );
  }

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
    isComposite: cfg.isComposite,
    compositeTiers: cfg.compositeTiers,
    compositeDefaultTier: cfg.compositeDefaultTier,
    claudeConfigDir: inheritedClaudeConfigDir,
    imageAnalysisEnv,
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

  // 10. Setup Codex reasoning proxy (single-provider Codex only)
  let codexReasoningProxy: CodexReasoningProxy | null = null;
  let codexReasoningPort: number | null = null;

  // Composite variants require root model-routed endpoints, never provider-pinned codex endpoints.
  if (provider === 'codex' && !cfg.isComposite) {
    if (!postSanitizationBaseUrl) {
      log('ANTHROPIC_BASE_URL not set for Codex, reasoning proxy disabled');
    } else {
      try {
        const traceEnabled =
          process.env.CCS_CODEX_REASONING_TRACE === '1' ||
          process.env.CCS_CODEX_REASONING_TRACE === 'true';
        const stripPathPrefix = useRemoteProxy ? '/api/provider/codex' : undefined;
        const codexThinkingOff = shouldDisableCodexReasoning(thinkingCfg, thinkingOverride);
        codexReasoningProxy = new CodexReasoningProxy({
          upstreamBaseUrl: postSanitizationBaseUrl,
          verbose,
          defaultEffort: 'medium',
          disableEffort: codexThinkingOff,
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
    isComposite: cfg.isComposite,
    compositeTiers: cfg.compositeTiers,
    compositeDefaultTier: cfg.compositeDefaultTier,
    claudeConfigDir: inheritedClaudeConfigDir,
    imageAnalysisEnv,
    browserRuntimeEnv,
  });

  if (cfg.isComposite && cfg.compositeTiers && cfg.compositeDefaultTier) {
    const mode = useRemoteProxy
      ? proxyConfig.protocol === 'https'
        ? 'remote-https'
        : 'remote-http'
      : 'local';
    const defaultTierProvider = cfg.compositeTiers[cfg.compositeDefaultTier]?.provider ?? provider;
    log(
      `Composite self-check: mode=${mode}, baseUrl=${env.ANTHROPIC_BASE_URL || 'unset'}, defaultTier=${cfg.compositeDefaultTier}, defaultProvider=${defaultTierProvider}`
    );
  }

  const webSearchEnv = getWebSearchHookEnv();
  if (process.env.CCS_DEBUG) {
    console.error(
      `[cliproxy-browser-debug] keys=${Object.keys(env)
        .filter((key) => key.startsWith('CCS_BROWSER_'))
        .sort()
        .join(',')} ws=${env.CCS_BROWSER_DEVTOOLS_WS_URL || ''}`
    );
  }
  logEnvironment(env, webSearchEnv, verbose);
  if (imageAnalysisWarning) {
    console.error(info(imageAnalysisWarning));
  }

  // 11b. Print thinking status feedback (TTY only, non-piped sessions)
  if (process.stderr.isTTY) {
    const { thinkingLabel, sourceLabel } = buildThinkingStartupStatus(
      thinkingCfg,
      thinkingOverride,
      thinkingSource,
      thinkingParse.sourceDisplay
    );

    console.error(`[i] Thinking: ${thinkingLabel} (${sourceLabel})`);
  }

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
    '--kiro-auth-method',
    '--kiro-idc-start-url',
    '--kiro-idc-region',
    '--kiro-idc-flow',
    '--thinking',
    '--effort',
    '--1m',
    '--no-1m',
    '--incognito',
    '--no-incognito',
    '--import',
    '--accept-agr-risk',
    '--accept-antigravity-risk',
    '--settings',
    ...PROXY_CLI_FLAGS,
  ];
  const claudeArgs = argsWithoutProxy.filter((arg, idx) => {
    if (ccsFlags.includes(arg)) return false;
    if (arg.startsWith('--kiro-auth-method=')) return false;
    if (arg.startsWith('--kiro-idc-start-url=')) return false;
    if (arg.startsWith('--kiro-idc-region=')) return false;
    if (arg.startsWith('--kiro-idc-flow=')) return false;
    if (arg.startsWith('--thinking=')) return false;
    if (arg.startsWith('--effort=')) return false;
    if (arg.startsWith('--1m=') || arg.startsWith('--no-1m=')) return false;
    if (
      argsWithoutProxy[idx - 1] === '--use' ||
      argsWithoutProxy[idx - 1] === '--nickname' ||
      argsWithoutProxy[idx - 1] === '--kiro-auth-method' ||
      argsWithoutProxy[idx - 1] === '--kiro-idc-start-url' ||
      argsWithoutProxy[idx - 1] === '--kiro-idc-region' ||
      argsWithoutProxy[idx - 1] === '--kiro-idc-flow' ||
      argsWithoutProxy[idx - 1] === '--thinking' ||
      argsWithoutProxy[idx - 1] === '--effort'
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
  const imageAnalysisArgs = imageAnalysisMcpReady
    ? appendThirdPartyImageAnalysisToolArgs(claudeArgs)
    : claudeArgs;
  const browserArgs = browserRuntimeEnv
    ? appendBrowserToolArgs(imageAnalysisArgs)
    : imageAnalysisArgs;
  const launchArgs = [
    '--settings',
    settingsPath,
    ...appendThirdPartyWebSearchToolArgs(browserArgs),
  ];
  const traceEnv = createWebSearchTraceContext({
    launcher: 'cliproxy.executor',
    args: launchArgs,
    profile: cfg.profileName || provider,
    profileType: 'cliproxy',
    settingsPath,
    claudeConfigDir: inheritedClaudeConfigDir,
  });
  const tracedEnv = { ...env, ...traceEnv };
  if (needsShell) {
    const cmdString = [claudeCli, ...launchArgs].map(escapeShellArg).join(' ');
    claude = spawn(cmdString, {
      stdio: 'inherit',
      windowsHide: true,
      shell: true,
      env: tracedEnv,
    });
  } else {
    claude = spawn(claudeCli, launchArgs, {
      stdio: 'inherit',
      windowsHide: true,
      env: tracedEnv,
    });
  }

  // 12b. Start runtime quota monitor (adaptive polling during session)
  if (!skipLocalAuth) {
    const { startQuotaMonitor } = await import('../quota-manager');
    const monitorAccount = getDefaultAccount(provider);
    if (monitorAccount) {
      startQuotaMonitor(provider, monitorAccount.id);
    }
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
