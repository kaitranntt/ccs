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

import { ChildProcess } from 'child_process';
import * as fs from 'fs';
import { fail, info, warn } from '../../utils/ui';
import { createLogger } from '../../services/logging';

const logger = createLogger('cliproxy:executor');
import {
  generateConfig,
  getProviderConfig,
  CLIPROXY_DEFAULT_PORT,
} from '../config/config-generator';
import { configureProviderModel } from '../config/model-config';
import { supportsModelConfig } from '../model-catalog';
import { CLIProxyProvider, ExecutorConfig } from '../types';
import { CodexReasoningProxy } from '../ai-providers/codex-reasoning-proxy';
import { ToolSanitizationProxy } from '../proxy/tool-sanitization-proxy';
import { ensureWebSearchMcpOrThrow, displayWebSearchStatus } from '../../utils/websearch-manager';
import {
  ensureImageAnalysisMcpOrThrow,
  syncImageAnalysisMcpToConfigDir,
} from '../../utils/image-analysis';
import { loadOrCreateUnifiedConfig, getThinkingConfig } from '../../config/config-loader-facade';
import { HttpsTunnelProxy } from '../proxy/https-tunnel-proxy';
import { resolveProfileContinuityInheritance } from '../../auth/profile-continuity-inheritance';

// Import modular components
import { resolveBrowserLaunchFlags, resolveBrowserRuntime } from './browser-launch-setup';
import {
  resolveRuntimeQuotaMonitorProviders as _resolveRuntimeQuotaMonitorProviders,
  resolveAccounts,
} from './account-resolution';
import { waitForProxyReadyWithSpinner, spawnProxy } from './lifecycle-manager';
import {
  buildClaudeEnvironment,
  logEnvironment,
  resolveCliproxyImageAnalysisEnv,
} from './env-resolver';
import { checkOrJoinProxy, registerProxySession } from './session-bridge';
import { getWebSearchHookEnv } from '../../utils/websearch-manager';
import {
  handleLogout,
  handleImport,
  resolveSkipLocalAuth,
  runAntigravityGate,
  ensureProviderAuthentication,
  runPreflightQuotaCheck,
  runAccountSafetyGuards,
  ensureModelConfiguration,
  ensureProviderSettingsFile,
} from './auth-coordinator';
import {
  buildThinkingStartupStatus,
  resolveRuntimeThinkingOverride,
} from './thinking-override-resolver';
import { shouldStartHttpsTunnel } from './https-tunnel-policy';
import { filterCcsFlags, parseExecutorFlags, validateFlagCombinations } from './arg-parser';
import { resolveExecutorProxy, resolveExecutorProxyConfig } from './proxy-resolver';
import { buildProxyChain } from './proxy-chain-builder';
import { warnBrokenModels } from './model-warnings';
import { launchClaude } from './claude-launcher';
import { maybeWarnClaudeShadow, maybeShowClaudeRoutingNotice } from '../claude-shadow-warning';

/** Local alias so internal call sites need no change */
const resolveRuntimeQuotaMonitorProviders = _resolveRuntimeQuotaMonitorProviders;

/** Default executor configuration */
const DEFAULT_CONFIG: ExecutorConfig = {
  port: CLIPROXY_DEFAULT_PORT,
  timeout: 5000,
  verbose: false,
  pollInterval: 100,
};

// readOptionValue, hasGitLabTokenLoginFlag, CCS_FLAGS, filterCcsFlags are
// re-exported from ./arg-parser via the export block at the bottom of this file
// for backwards compatibility with external callers.

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
    process.stderr.write(`${fail(`Claude CLI not found at: ${claudeCli}`)}\n`);
    process.stderr.write('    Run "ccs doctor --fix" to reinstall or check your PATH\n');
    process.exit(1);
  }

  const log = (msg: string) => {
    if (verbose) {
      logger.info('verbose', msg);
    }
  };

  // Helper: Extract unique providers from composite tiers
  const compositeProviders =
    cfg.isComposite && cfg.compositeTiers
      ? [...new Set(Object.values(cfg.compositeTiers).map((t) => t.provider))]
      : [];

  // 0. Resolve proxy configuration (CLI > ENV > config.yaml > defaults)
  const unifiedConfig = loadOrCreateUnifiedConfig();

  // Collect all providers to validate (default + composite tiers)
  const allProviders = [provider, ...compositeProviders];

  const proxyResolution = resolveExecutorProxyConfig(args, {
    unifiedConfig,
    allProviders,
    verbose,
    cfg,
    log,
  });

  const {
    browserLaunchOverride,
    argsWithoutBrowserFlags,
    parseFailed: browserLaunchParseFailed,
  } = resolveBrowserLaunchFlags(proxyResolution.argsWithoutProxy);
  if (browserLaunchParseFailed) return;

  const { proxyConfig, useRemoteProxy, localBackend, binaryPath, argsWithoutProxy } =
    await resolveExecutorProxy(proxyResolution, {
      unifiedConfig,
      allProviders,
      verbose,
      cfg,
      log,
    });

  // Setup first-class CCS WebSearch runtime
  ensureWebSearchMcpOrThrow();
  const imageAnalysisMcpReady = ensureImageAnalysisMcpOrThrow();
  displayWebSearchStatus();

  const providerConfig = getProviderConfig(provider);
  log(`Provider: ${providerConfig.displayName}`);

  // claude built-in: warn once if a user profile is being shadowed
  if (provider === 'claude') {
    maybeWarnClaudeShadow();
  }

  // Variables for local proxy mode
  let sessionId: string | undefined;

  // 2. Parse all CCS executor flags (extracted to arg-parser.ts)
  const parsedFlags = parseExecutorFlags(argsWithoutProxy, {
    provider,
    compositeProviders,
    unifiedConfig,
  });
  if (parsedFlags.parseFailed) return;

  // Validate cross-flag combinations (reports failure without relying on ambient exitCode)
  const flagCombinationsValid = validateFlagCombinations(
    parsedFlags,
    { provider, compositeProviders },
    argsWithoutProxy
  );
  if (!flagCombinationsValid) return;

  const {
    forceConfig,
    addAccount,
    showAccounts,
    useAccount,
    setNickname,
    extendedContextOverride,
    thinkingParse,
  } = parsedFlags;

  const { thinkingOverride, thinkingSource } = resolveRuntimeThinkingOverride(
    thinkingParse.value,
    process.env.CCS_THINKING
  );
  const thinkingCfg = getThinkingConfig();

  if (thinkingParse.duplicateDisplays.length > 0) {
    process.stderr.write(
      `[!] Multiple reasoning flags detected. Using first occurrence: ${thinkingParse.sourceDisplay}\n`
    );
  }

  if (thinkingParse.sourceFlag === '--effort' && provider !== 'codex') {
    process.stderr.write(
      `${warn(
        '`--effort` is primarily for codex. Continuing as alias of `--thinking` for compatibility.'
      )}\n`
    );
  }

  // Handle --accounts / --use / --nickname (warnOAuthBanRisk emitted inside)
  await resolveAccounts({ provider, showAccounts, useAccount, setNickname, addAccount });

  // Handle --config
  if (forceConfig && supportsModelConfig(provider)) {
    // Block --config for composite variants (per-tier models in config.yaml)
    if (cfg.isComposite) {
      const variantName = cfg.profileName || provider;
      console.log(
        warn('Composite variants use per-tier config. Edit config.yaml to change tier models.')
      );
      process.stderr.write(
        `    Use "ccs cliproxy edit ${variantName}" to modify composite variants\n`
      );
      process.exit(1);
    } else {
      // Run the one-time stale-pin migration on the pre-existing settings file
      // BEFORE writing the user's chosen pin. ensureProviderSettingsFile sets the
      // migration marker, so the explicit --config pick survives the next launch
      // even when it equals a historical default. Without this, the --config flow
      // exits before the only ensureProviderSettingsFile call site (later in this
      // function), so a later plain launch would strip the just-written pin.
      // Skipped for custom-settings variants: those have no claude.settings
      // migration and are written verbatim.
      if (!cfg.customSettingsPath) {
        ensureProviderSettingsFile(provider);
      }
      await configureProviderModel(provider, true, cfg.customSettingsPath);
      process.exit(0);
    }
  }

  // Build auth coordination context (used for logout/import/antigravity/oauth)
  const authCtx = {
    provider,
    compositeProviders,
    parsedFlags,
    cfg,
    unifiedConfig,
    verbose,
    log,
  };

  // Handle --logout (early exit)
  await handleLogout(authCtx);

  // Handle --import (early exit, Kiro only)
  await handleImport(authCtx);

  // 3. Ensure OAuth completed (if provider requires it)
  const remoteAuthToken = proxyConfig.authToken?.trim();
  const skipLocalAuth = resolveSkipLocalAuth(remoteAuthToken, useRemoteProxy);
  if (skipLocalAuth) {
    log(`Using remote proxy authentication (skipping local OAuth)`);
  }

  // Antigravity gate (runs before OAuth check)
  const { earlyReturn: agyEarlyReturn } = await runAntigravityGate(authCtx, skipLocalAuth);
  if (agyEarlyReturn) return;

  if (providerConfig.requiresOAuth && !skipLocalAuth) {
    await ensureProviderAuthentication(authCtx);
  }

  // 3b. Preflight quota check (providers with quota-based rotation)
  if (!skipLocalAuth) {
    await runPreflightQuotaCheck(provider, compositeProviders);
  }

  // 3c. Account safety: enforce cross-provider isolation
  if (!skipLocalAuth) {
    runAccountSafetyGuards(provider, compositeProviders);
  }

  // 4. First-run model configuration + codex plan reconcile
  if (!skipLocalAuth) {
    await ensureModelConfiguration(provider, cfg, verbose);
  }

  // 5. Check for broken models (multi-tier for composite)
  warnBrokenModels({ provider, cfg, compositeProviders, skipLocalAuth });

  // 5a. claude built-in: one-time routing notice (first launch only)
  if (provider === 'claude') {
    maybeShowClaudeRoutingNotice();
  }

  // 6. Ensure user settings file exists
  ensureProviderSettingsFile(provider);

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
        localBackend,
        configPath
      );

      // Register session
      if (proxy.pid) {
        sessionId = registerProxySession(cfg.port, proxy.pid, localBackend, verbose);
      }
    }
  }

  // 8. Setup HTTPS tunnel if needed (tunnelPort used by imageAnalysisProxyTarget below)
  let httpsTunnel: HttpsTunnelProxy | null = null;
  let tunnelPort: number | null = null;

  const useHttpsTunnel = shouldStartHttpsTunnel({
    provider,
    useRemoteProxy,
    protocol: proxyConfig.protocol,
    host: proxyConfig.host,
    isComposite: cfg.isComposite,
  });

  if (useHttpsTunnel && proxyConfig.host) {
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
        `HTTPS tunnel started on port ${tunnelPort} -> https://${proxyConfig.host}:${proxyConfig.port}`
      );
    } catch (error) {
      const err = error as Error;
      process.stderr.write(`${warn(`Failed to start HTTPS tunnel: ${err.message}`)}\n`);
      throw new Error(`HTTPS tunnel startup failed: ${err.message}`);
    }
  } else if (useRemoteProxy && proxyConfig.protocol === 'https' && provider === 'codex') {
    log('HTTPS tunnel skipped for Codex; local proxy chain will connect to remote HTTPS directly');
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

  // 9. Resolve config dir + browser runtime (needed before proxy chain)
  let toolSanitizationProxy: ToolSanitizationProxy | null = null;
  let toolSanitizationPort: number | null = null;
  let codexReasoningProxy: CodexReasoningProxy | null = null;
  let codexReasoningPort: number | null = null;
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

  // Resolve browser attach runtime and sync browser MCP (needs inheritedClaudeConfigDir)
  const { browserRuntimeEnv } = await resolveBrowserRuntime(
    browserLaunchOverride,
    inheritedClaudeConfigDir
  );

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

  // 9b. Build env-dependent proxy chain (tool-sanitization + codex-reasoning)
  ({ toolSanitizationProxy, toolSanitizationPort, codexReasoningProxy, codexReasoningPort } =
    await buildProxyChain({
      provider,
      useRemoteProxy,
      proxyConfig,
      cfg,
      initialEnvVars,
      thinkingOverride,
      thinkingCfg,
      verbose,
      log,
    }));

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
    logger.info('browser-env-keys', 'CCS_BROWSER_* keys in environment', {
      keys: Object.keys(env)
        .filter((key) => key.startsWith('CCS_BROWSER_'))
        .sort(),
      ws: env.CCS_BROWSER_DEVTOOLS_WS_URL || '',
    });
  }
  logEnvironment(env, webSearchEnv, verbose);
  if (imageAnalysisWarning) {
    process.stderr.write(`${info(imageAnalysisWarning)}\n`);
  }

  // 11b. Print thinking status feedback (TTY only, non-piped sessions)
  if (process.stderr.isTTY) {
    const { thinkingLabel, sourceLabel } = buildThinkingStartupStatus(
      thinkingCfg,
      thinkingOverride,
      thinkingSource,
      thinkingParse.sourceDisplay
    );

    process.stderr.write(`[i] Thinking: ${thinkingLabel} (${sourceLabel})\n`);
  }

  // 12. Filter CCS flags, spawn Claude CLI, start quota monitor, wire cleanup
  const claudeArgs = filterCcsFlags(argsWithoutBrowserFlags);
  await launchClaude({
    claudeCli,
    claudeArgs,
    env,
    cfg,
    provider,
    compositeProviders,
    skipLocalAuth,
    sessionId,
    imageAnalysisMcpReady,
    browserRuntimeEnv,
    inheritedClaudeConfigDir,
    codexReasoningProxy,
    toolSanitizationProxy,
    httpsTunnel,
    verbose,
  });
}

// Re-export utility functions for backwards compatibility
export { isPortAvailable, findAvailablePort } from './lifecycle-manager';

// Re-export arg-parser helpers (previously inlined here; external callers can
// import from index or directly from ./arg-parser)
export { readOptionValue, hasGitLabTokenLoginFlag, CCS_FLAGS, filterCcsFlags } from './arg-parser';

// Re-export account-resolution helpers for backwards compat with __testExports consumers
export { resolveRuntimeQuotaMonitorProviders as _resolveRuntimeQuotaMonitorProviders } from './account-resolution';

export const __testExports = {
  resolveRuntimeQuotaMonitorProviders,
};

export default execClaudeWithCLIProxy;
