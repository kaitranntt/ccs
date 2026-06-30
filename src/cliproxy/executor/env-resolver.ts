/**
 * Environment Resolver - Build environment variables for Claude CLI
 *
 * Handles:
 * - Remote proxy environment configuration
 * - Local proxy environment configuration
 * - HTTPS tunnel integration
 * - Proxy chain configuration (CodexReasoning, ToolSanitization)
 * - WebSearch and ImageAnalysis hook integration
 */

import * as fs from 'fs';
import {
  getEffectiveEnvVars,
  getRemoteEnvVars,
  getCompositeEnvVars,
  applyThinkingConfig,
} from '../config/config-generator';
import { applyExtendedContextConfig } from '../config/extended-context-config';
import { CLIProxyProvider } from '../types';
import { CompositeTierConfig } from '../../config/unified-config-types';
import { getWebSearchHookEnv } from '../../utils/websearch-manager';
import {
  applyImageAnalysisRuntimeOverrides,
  getImageAnalysisHookEnv,
  resolveImageAnalysisRuntimeConnection,
} from '../../utils/hooks/get-image-analysis-hook-env';
import { resolveImageAnalysisRuntimeStatus } from '../../utils/hooks/image-analysis-runtime-status';
import { hasImageAnalysisProfileHook } from '../../utils/hooks/image-analyzer-profile-hook-injector';
import { hasImageAnalyzerHook } from '../../utils/hooks/image-analyzer-hook-installer';
import { stripBrowserEnv, stripClaudeCodeEnv } from '../../utils/shell-executor';
import { CodexReasoningProxy } from '../ai-providers/codex-reasoning-proxy';
import { ToolSanitizationProxy } from '../proxy/tool-sanitization-proxy';
import { HttpsTunnelProxy } from '../proxy/https-tunnel-proxy';
import {
  MODEL_ENV_VAR_KEYS,
  normalizeModelIdForProvider,
} from '../ai-providers/model-id-normalizer';
import type { ProxyTarget } from '../proxy/proxy-target-resolver';
import { getEffectiveApiKey } from '../auth/auth-token-manager';
import { isSettings, type Settings } from '../../types/config';
import { buildCliproxyProviderPath } from '../config/provider-route';

export interface RemoteProxyConfig {
  host: string;
  port: number;
  protocol: 'http' | 'https';
  authToken?: string;
}

export interface ProxyChainConfig {
  provider: CLIProxyProvider;
  useRemoteProxy: boolean;
  remoteConfig?: RemoteProxyConfig;
  httpsTunnel?: HttpsTunnelProxy;
  tunnelPort?: number;
  codexReasoningProxy?: CodexReasoningProxy;
  codexReasoningPort?: number;
  toolSanitizationProxy?: ToolSanitizationProxy;
  toolSanitizationPort?: number;
  localPort: number;
  customSettingsPath?: string;
  thinkingOverride?: string | number;
  /** Extended context override: true = force on, false = force off, undefined = auto */
  extendedContextOverride?: boolean;
  verbose: boolean;
  /** Composite variant: true when mixing providers per tier */
  isComposite?: boolean;
  /** Composite variant: per-tier provider+model mappings */
  compositeTiers?: {
    opus: CompositeTierConfig;
    sonnet: CompositeTierConfig;
    haiku: CompositeTierConfig;
  };
  /** Composite variant: which tier is the default */
  compositeDefaultTier?: 'opus' | 'sonnet' | 'haiku';
  /** Optional inherited continuity directory from mapped account profile */
  claudeConfigDir?: string;
  /** Execution-aware image analysis env prepared by the caller */
  imageAnalysisEnv?: Record<string, string>;
  /** Optional browser runtime env for Claude browser MCP reuse. */
  browserRuntimeEnv?: Record<string, string>;
}

interface CliproxyImageAnalysisDeps {
  getImageAnalysisHookEnv: typeof getImageAnalysisHookEnv;
  hasImageAnalysisProfileHook: typeof hasImageAnalysisProfileHook;
  hasImageAnalyzerHook: typeof hasImageAnalyzerHook;
  resolveImageAnalysisRuntimeStatus: typeof resolveImageAnalysisRuntimeStatus;
  getLocalRuntimeApiKey: typeof getEffectiveApiKey;
}

interface ResolveCliproxyImageAnalysisEnvOptions {
  profileName: string;
  provider: CLIProxyProvider;
  profileSettingsPath?: string;
  isComposite?: boolean;
  proxyTarget: ProxyTarget;
  tunnelPort?: number | null;
  proxyReachable: boolean;
}

export interface CliproxyImageAnalysisResolution {
  env: Record<string, string>;
  warning: string | null;
}

const defaultCliproxyImageAnalysisDeps: CliproxyImageAnalysisDeps = {
  getImageAnalysisHookEnv,
  hasImageAnalysisProfileHook,
  hasImageAnalyzerHook,
  resolveImageAnalysisRuntimeStatus,
  getLocalRuntimeApiKey: getEffectiveApiKey,
};

const CODEX_EFFORT_SUFFIX_REGEX = /^(.*)-(minimal|low|medium|high|xhigh)$/i;
const EXTENDED_CONTEXT_SUFFIX_REGEX = /\[1m\]$/i;

function normalizeCodexModelForDirectUpstream(model: string): string {
  const withoutExtendedContext = model.trim().replace(EXTENDED_CONTEXT_SUFFIX_REGEX, '').trim();
  if (!withoutExtendedContext) return withoutExtendedContext;

  const effortMatch = withoutExtendedContext.match(CODEX_EFFORT_SUFFIX_REGEX);
  if (!effortMatch?.[1] || !effortMatch[2]) {
    return withoutExtendedContext;
  }

  return `${effortMatch[1].trim()}(${effortMatch[2].toLowerCase()})`;
}

function normalizeCodexEnvForDirectUpstream(envVars: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  let nextEnv: NodeJS.ProcessEnv | null = null;

  for (const key of MODEL_ENV_VAR_KEYS) {
    const value = envVars[key];
    if (typeof value !== 'string' || value.trim().length === 0) continue;

    const normalizedValue = normalizeCodexModelForDirectUpstream(value);
    if (normalizedValue === value) continue;

    if (!nextEnv) nextEnv = { ...envVars };
    nextEnv[key] = normalizedValue;
  }

  return nextEnv ?? envVars;
}

function loadImageAnalysisSettings(settingsPath?: string): Settings | undefined {
  if (!settingsPath) {
    return undefined;
  }

  try {
    if (!fs.existsSync(settingsPath)) {
      return undefined;
    }

    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as unknown;
    return isSettings(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export async function resolveCliproxyImageAnalysisEnv(
  options: ResolveCliproxyImageAnalysisEnvOptions,
  deps: Partial<CliproxyImageAnalysisDeps> = {}
): Promise<CliproxyImageAnalysisResolution> {
  const resolvedDeps = { ...defaultCliproxyImageAnalysisDeps, ...deps };
  const settings = loadImageAnalysisSettings(options.profileSettingsPath);
  const context = {
    profileName: options.profileName,
    profileType: 'cliproxy' as const,
    cliproxyProvider: options.provider,
    isComposite: options.isComposite,
    settingsPath: options.profileSettingsPath,
    settings,
    hookInstalled: resolvedDeps.hasImageAnalysisProfileHook(
      options.profileName,
      options.profileSettingsPath
    ),
    sharedHookInstalled: resolvedDeps.hasImageAnalyzerHook(),
  };

  const env = resolvedDeps.getImageAnalysisHookEnv(context);
  const currentProvider = env['CCS_CURRENT_PROVIDER'];
  if (env['CCS_IMAGE_ANALYSIS_SKIP'] === '1' || !currentProvider) {
    return { env, warning: null };
  }

  const status = await resolvedDeps.resolveImageAnalysisRuntimeStatus(context, undefined, {
    getProxyTarget: () => options.proxyTarget,
    isCliproxyRunning: async () => options.proxyReachable,
  });

  if (status.effectiveRuntimeMode === 'native-read') {
    return {
      env: {
        ...env,
        CCS_CURRENT_PROVIDER: '',
        CCS_IMAGE_ANALYSIS_SKIP: '1',
      },
      warning: `${status.effectiveRuntimeReason || `Image analysis via ${currentProvider} is unavailable.`} This session will use native Read.`,
    };
  }

  const runtimeConnection = resolveImageAnalysisRuntimeConnection({
    proxyTarget: options.proxyTarget,
    tunnelPort: options.tunnelPort,
  });

  return {
    env: applyImageAnalysisRuntimeOverrides(env, {
      backendId: status.backendId,
      model: status.model,
      runtimePath: status.runtimePath,
      baseUrl: runtimeConnection.baseUrl,
      apiKey: options.proxyTarget.isRemote
        ? runtimeConnection.apiKey
        : resolvedDeps.getLocalRuntimeApiKey(),
      allowSelfSigned: runtimeConnection.allowSelfSigned,
    }),
    warning: null,
  };
}

/**
 * Build final environment variables for Claude CLI execution
 * Handles proxy chain ordering and integration with hooks
 */
export function buildClaudeEnvironment(config: ProxyChainConfig): Record<string, string> {
  const {
    provider,
    useRemoteProxy,
    remoteConfig,
    httpsTunnel,
    tunnelPort,
    localPort,
    customSettingsPath,
    thinkingOverride,
    extendedContextOverride,
    codexReasoningPort,
    toolSanitizationPort,
    isComposite,
    compositeTiers,
    compositeDefaultTier,
    claudeConfigDir,
    imageAnalysisEnv: resolvedImageAnalysisEnv,
    browserRuntimeEnv,
  } = config;

  // Build base env vars - check remote mode first
  let envVars: NodeJS.ProcessEnv;

  if (useRemoteProxy && remoteConfig) {
    if (httpsTunnel && tunnelPort) {
      // HTTPS remote via local tunnel
      if (isComposite && compositeTiers && compositeDefaultTier) {
        envVars = getCompositeEnvVars(
          compositeTiers,
          compositeDefaultTier,
          tunnelPort,
          customSettingsPath,
          {
            host: '127.0.0.1',
            port: tunnelPort,
            protocol: 'http',
            authToken: remoteConfig.authToken,
          }
        );
      } else {
        envVars = getRemoteEnvVars(
          provider,
          {
            host: '127.0.0.1',
            port: tunnelPort,
            protocol: 'http', // Tunnel speaks HTTP locally
            authToken: remoteConfig.authToken,
          },
          customSettingsPath
        );
      }
    } else {
      // HTTP remote - direct connection
      if (isComposite && compositeTiers && compositeDefaultTier) {
        envVars = getCompositeEnvVars(
          compositeTiers,
          compositeDefaultTier,
          remoteConfig.port,
          customSettingsPath,
          {
            host: remoteConfig.host,
            port: remoteConfig.port,
            protocol: remoteConfig.protocol,
            authToken: remoteConfig.authToken,
          }
        );
      } else {
        envVars = getRemoteEnvVars(
          provider,
          {
            host: remoteConfig.host,
            port: remoteConfig.port,
            protocol: remoteConfig.protocol,
            authToken: remoteConfig.authToken,
          },
          customSettingsPath
        );
      }
    }
  } else {
    // Local proxy mode
    if (isComposite && compositeTiers && compositeDefaultTier) {
      envVars = getCompositeEnvVars(
        compositeTiers,
        compositeDefaultTier,
        localPort,
        customSettingsPath
      );
    } else {
      const remoteRewriteConfig = remoteConfig
        ? {
            host: remoteConfig.host,
            port: remoteConfig.port,
            protocol: remoteConfig.protocol,
            authToken: remoteConfig.authToken,
          }
        : undefined;

      envVars = getEffectiveEnvVars(provider, localPort, customSettingsPath, remoteRewriteConfig);
    }
  }

  // Extract per-tier thinking from composite config
  let compositeTierThinking: { opus?: string; sonnet?: string; haiku?: string } | undefined;
  if (isComposite && compositeTiers) {
    const tierThinking: { opus?: string; sonnet?: string; haiku?: string } = {};
    if (compositeTiers.opus?.thinking) tierThinking.opus = compositeTiers.opus.thinking;
    if (compositeTiers.sonnet?.thinking) tierThinking.sonnet = compositeTiers.sonnet.thinking;
    if (compositeTiers.haiku?.thinking) tierThinking.haiku = compositeTiers.haiku.thinking;
    if (Object.keys(tierThinking).length > 0) {
      compositeTierThinking = tierThinking;
    }
  }

  // Apply thinking configuration to model (auto tier-based or manual override)
  envVars = applyThinkingConfig(
    envVars,
    provider,
    thinkingOverride,
    compositeTierThinking,
    compositeTiers
  );

  // Apply extended context suffix for 1M token context window
  // Auto-enabled for Gemini, opt-in for Claude (--1m flag)
  applyExtendedContextConfig(envVars, provider, extendedContextOverride);

  // Fallback compatibility for Codex:
  // CLIProxyAPI provider lookup recognizes model(level) suffix form, while CCS stores codex
  // effort aliases as model-level (e.g., gpt-5.3-codex-high). If codex reasoning proxy is
  // unavailable, normalize to model(level) to avoid "unknown provider for model ..." failures.
  if (provider === 'codex' && !isComposite && !codexReasoningPort) {
    envVars = normalizeCodexEnvForDirectUpstream(envVars);
  }

  // Determine the final ANTHROPIC_BASE_URL based on active proxies
  // Chain order: Claude CLI → [CodexReasoningProxy] → [ToolSanitizationProxy] → CLIProxy
  let finalBaseUrl = envVars.ANTHROPIC_BASE_URL;

  if (toolSanitizationPort) {
    finalBaseUrl = `http://127.0.0.1:${toolSanitizationPort}`;
  }

  if (codexReasoningPort) {
    // Codex reasoning proxy is the outermost layer for codex provider
    const providerPath = useRemoteProxy
      ? '/api/provider/codex'
      : buildCliproxyProviderPath('codex');
    finalBaseUrl = `http://127.0.0.1:${codexReasoningPort}${providerPath}`;
  }

  const effectiveEnvVars = {
    ...envVars,
    ANTHROPIC_BASE_URL: finalBaseUrl,
  };

  // Add hook environment variables
  const webSearchEnv = getWebSearchHookEnv();
  const imageAnalysisEnv = resolvedImageAnalysisEnv ?? getImageAnalysisHookEnv(provider);

  // Merge all environment variables (filter undefined values)
  const baseEnv = stripBrowserEnv(
    Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined)) as Record<
      string,
      string
    >
  ) as Record<string, string>;

  const effectiveEnvVarsFiltered = stripBrowserEnv(
    Object.fromEntries(
      Object.entries(effectiveEnvVars).filter(([, v]) => v !== undefined)
    ) as Record<string, string>
  ) as Record<string, string>;

  const mergedEnv = {
    ...baseEnv,
    ...effectiveEnvVarsFiltered,
    ...(claudeConfigDir ? { CLAUDE_CONFIG_DIR: claudeConfigDir } : {}),
    ...webSearchEnv,
    ...imageAnalysisEnv,
    ...(browserRuntimeEnv || {}),
    CCS_PROFILE_TYPE: 'cliproxy', // Signal to WebSearch hook this is a third-party provider
  };

  return Object.fromEntries(
    Object.entries(stripClaudeCodeEnv(mergedEnv)).filter(([, v]) => v !== undefined)
  ) as Record<string, string>;
}

/**
 * Log environment configuration for debugging
 */
export function logEnvironment(
  env: Record<string, string>,
  webSearchEnv: Record<string, string>,
  verbose: boolean
): void {
  if (!verbose) return;

  const log = (msg: string) => console.error(`[cliproxy] ${msg}`);

  log(`Claude env: ANTHROPIC_BASE_URL=${env.ANTHROPIC_BASE_URL}`);
  log(`Claude env: ANTHROPIC_MODEL=${env.ANTHROPIC_MODEL}`);

  if (Object.keys(webSearchEnv).length > 0) {
    log(`Claude env: WebSearch config=${JSON.stringify(webSearchEnv)}`);
  }

  // Log global env vars for visibility
  if (env.DISABLE_TELEMETRY || env.DISABLE_ERROR_REPORTING || env.DISABLE_BUG_COMMAND) {
    log(`Claude env: Global env applied (telemetry/reporting disabled)`);
  }
}

/** Apply fallback provider config to env vars for a failed tier */
export function applyFallback(
  env: Record<string, string>,
  failedTier: 'opus' | 'sonnet' | 'haiku',
  fallback: { provider: string; model: string }
): Record<string, string> {
  const tierEnvMap = {
    opus: 'ANTHROPIC_DEFAULT_OPUS_MODEL',
    sonnet: 'ANTHROPIC_DEFAULT_SONNET_MODEL',
    haiku: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  } as const;
  const result = { ...env };
  const originalModel = result[tierEnvMap[failedTier]];
  const normalizedFallbackModel = normalizeModelIdForProvider(fallback.model, fallback.provider);
  result[tierEnvMap[failedTier]] = normalizedFallbackModel;
  // If failed tier is default tier, also update ANTHROPIC_MODEL
  if (result.ANTHROPIC_MODEL === originalModel) {
    result.ANTHROPIC_MODEL = normalizedFallbackModel;
  }
  return result;
}
