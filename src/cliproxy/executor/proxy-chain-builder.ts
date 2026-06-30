/**
 * Proxy Chain Builder (Concern F — tool-sanitization + codex-reasoning layers)
 *
 * Orchestrates the two env-dependent proxy layers that sit between the
 * Claude CLI process and the upstream CLIProxy / remote endpoint:
 *
 *   1. ToolSanitizationProxy — wraps ANTHROPIC_BASE_URL to sanitize tool names/schemas
 *   2. CodexReasoningProxy   — only for single-provider codex, wraps tool-san URL
 *
 * Placement in the execution sequence
 * ─────────────────────────────────────
 * The HTTPS tunnel (HttpsTunnelProxy) is started BEFORE this function is called,
 * because its tunnelPort is needed by both imageAnalysisResolution and the
 * first-pass buildClaudeEnvironment.  This function receives the result of that
 * first-pass env as `initialEnvVars`, from which it extracts ANTHROPIC_BASE_URL
 * to wire up the tool-sanitization proxy.
 *
 * Lifecycle: proxies are started (spawned) but NOT stopped here.  The caller
 * is responsible for registering cleanup handlers (setupCleanupHandlers).
 */

import * as path from 'path';
import { warn } from '../../utils/ui';
import { getCcsDir } from '../../config/config-loader-facade';
import {
  ToolSanitizationProxy,
  type ToolSanitizationProxyConfig,
} from '../proxy/tool-sanitization-proxy';
import {
  CodexReasoningProxy,
  type CodexReasoningProxyConfig,
} from '../ai-providers/codex-reasoning-proxy';
import { shouldDisableCodexReasoning } from './thinking-override-resolver';
import type { CLIProxyProvider, ExecutorConfig, ResolvedProxyConfig } from '../types';
import type { ThinkingConfig } from '../../config/unified-config-types';
import { buildCliproxyProviderPath } from '../config/provider-route';

// ── Proxy constructor types (for dependency injection in tests) ───────────────

type ToolSanitizationProxyCtor = new (config: ToolSanitizationProxyConfig) => ToolSanitizationProxy;
type CodexReasoningProxyCtor = new (config: CodexReasoningProxyConfig) => CodexReasoningProxy;

// ── Public types ──────────────────────────────────────────────────────────────

export interface ProxyChainContext {
  /** Provider being executed */
  provider: CLIProxyProvider;
  /** True when routing to a remote proxy host */
  useRemoteProxy: boolean;
  /** Resolved proxy configuration (host, port, protocol, auth, …) */
  proxyConfig: ResolvedProxyConfig;
  /** Executor configuration */
  cfg: ExecutorConfig;
  /**
   * Initial environment from first-pass buildClaudeEnvironment.
   * ANTHROPIC_BASE_URL and ANTHROPIC_MODEL* keys are consumed here.
   */
  initialEnvVars: Partial<Record<string, string>>;
  /** Thinking mode override (value or undefined for default) */
  thinkingOverride: string | number | undefined;
  /** Thinking configuration from unified config */
  thinkingCfg: ThinkingConfig;
  verbose: boolean;
  log: (msg: string) => void;
  /**
   * Optional constructor overrides for unit testing.
   * Production code omits these; tests inject stubs to avoid real HTTP servers.
   */
  _ToolSanitizationProxy?: ToolSanitizationProxyCtor;
  _CodexReasoningProxy?: CodexReasoningProxyCtor;
}

export interface ProxyChainResult {
  toolSanitizationProxy: ToolSanitizationProxy | null;
  toolSanitizationPort: number | null;
  codexReasoningProxy: CodexReasoningProxy | null;
  codexReasoningPort: number | null;
}

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Build and start the two env-dependent proxy layers (tool-sanitization and
 * codex-reasoning).  Each layer is started independently; a failed start is
 * swallowed with a verbose warning so the session can continue degraded.
 *
 * Note: HttpsTunnelProxy is started inline in the orchestrator (index.ts)
 * before this function is called, because tunnelPort is required for
 * imageAnalysisResolution and the first-pass buildClaudeEnvironment.
 */
export async function buildProxyChain(context: ProxyChainContext): Promise<ProxyChainResult> {
  const {
    provider,
    useRemoteProxy,
    proxyConfig,
    cfg,
    initialEnvVars,
    thinkingOverride,
    thinkingCfg,
    verbose,
    log,
    // Allow test injection of proxy constructors so tests never spin up real servers
    _ToolSanitizationProxy: ToolSanitizationProxyImpl = ToolSanitizationProxy,
    _CodexReasoningProxy: CodexReasoningProxyImpl = CodexReasoningProxy,
  } = context;

  // ── Step 1: Tool sanitization proxy ────────────────────────────────────────
  let toolSanitizationProxy: ToolSanitizationProxy | null = null;
  let toolSanitizationPort: number | null = null;

  if (initialEnvVars.ANTHROPIC_BASE_URL) {
    try {
      toolSanitizationProxy = new ToolSanitizationProxyImpl({
        upstreamBaseUrl: initialEnvVars.ANTHROPIC_BASE_URL,
        verbose,
        warnOnSanitize: true,
        allowSelfSigned: useRemoteProxy ? (proxyConfig.allowSelfSigned ?? false) : false,
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

  // ── Step 2: Codex reasoning proxy ──────────────────────────────────────────
  let codexReasoningProxy: CodexReasoningProxy | null = null;
  let codexReasoningPort: number | null = null;

  // Composite variants require root model-routed endpoints, never provider-pinned codex endpoints.
  if (provider === 'codex' && !cfg.isComposite) {
    const postSanitizationBaseUrl = toolSanitizationPort
      ? `http://127.0.0.1:${toolSanitizationPort}`
      : initialEnvVars.ANTHROPIC_BASE_URL;

    if (!postSanitizationBaseUrl) {
      log('ANTHROPIC_BASE_URL not set for Codex, reasoning proxy disabled');
    } else {
      try {
        const traceEnabled =
          process.env.CCS_CODEX_REASONING_TRACE === '1' ||
          process.env.CCS_CODEX_REASONING_TRACE === 'true';
        const stripPathPrefix = useRemoteProxy ? '/api/provider/codex' : undefined;
        const codexThinkingOff = shouldDisableCodexReasoning(thinkingCfg, thinkingOverride);
        codexReasoningProxy = new CodexReasoningProxyImpl({
          upstreamBaseUrl: postSanitizationBaseUrl,
          verbose,
          defaultEffort: 'medium',
          disableEffort: codexThinkingOff,
          traceFilePath: traceEnabled ? path.join(getCcsDir(), 'codex-reasoning-proxy.log') : '',
          allowSelfSigned: useRemoteProxy ? (proxyConfig.allowSelfSigned ?? false) : false,
          modelMap: {
            defaultModel: initialEnvVars.ANTHROPIC_MODEL,
            opusModel: initialEnvVars.ANTHROPIC_DEFAULT_OPUS_MODEL,
            sonnetModel: initialEnvVars.ANTHROPIC_DEFAULT_SONNET_MODEL,
            haikuModel: initialEnvVars.ANTHROPIC_DEFAULT_HAIKU_MODEL,
          },
          stripPathPrefix,
        });
        codexReasoningPort = await codexReasoningProxy.start();
        const providerPath = useRemoteProxy
          ? '/api/provider/codex'
          : buildCliproxyProviderPath('codex');
        log(`Codex reasoning proxy active: http://127.0.0.1:${codexReasoningPort}${providerPath}`);
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

  return {
    toolSanitizationProxy,
    toolSanitizationPort,
    codexReasoningProxy,
    codexReasoningPort,
  };
}
