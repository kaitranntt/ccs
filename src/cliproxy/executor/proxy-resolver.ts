/**
 * Proxy Resolver — Concern D
 *
 * Handles proxy configuration resolution, remote proxy reachability check,
 * local-backend selection, and CLIProxy binary acquisition.
 *
 * Extracted from executor/index.ts to isolate the proxy-resolution concern.
 * All log messages, error messages, and exit semantics are byte-identical to
 * the original implementation.
 */

import { ProgressIndicator } from '../../utils/progress-indicator';
import { ok, fail, info, warn } from '../../utils/ui';
import {
  ensureCLIProxyBinary,
  getConfiguredBackend,
  getPlusBackendUnavailableMessage,
} from '../binary-manager';
import { checkRemoteProxy } from '../services/remote-proxy-client';
import { CLIProxyProvider, CLIProxyBackend, PLUS_ONLY_PROVIDERS, ExecutorConfig } from '../types';
import { resolveProxyConfig } from '../proxy/proxy-config-resolver';
import { CLIPROXY_DEFAULT_PORT, validatePort } from '../config/config-generator';
import type { ResolvedProxyConfig } from '../types';
import type { UnifiedConfig } from '../../config/schemas/unified-config';
import { ProviderError, ProxyError } from '../../errors/error-types';
import { isNetworkError, handleNetworkError } from './retry-handler';

export interface ResolvedExecutorProxyConfig {
  /** Resolved proxy config after merging CLI > ENV > config.yaml > defaults */
  proxyConfig: ResolvedProxyConfig;
  /** Args after proxy-related flags are stripped out */
  argsWithoutProxy: string[];
  /** Mutated executor config (port resolved and validated) */
  cfg: ExecutorConfig;
}

/** Result returned from resolveExecutorProxy */
export interface ResolvedProxy extends ResolvedExecutorProxyConfig {
  /** Whether to use the remote proxy (vs spawning a local one) */
  useRemoteProxy: boolean;
  /** Which local backend binary to use ('original' | 'plus') */
  localBackend: CLIProxyBackend;
  /** Absolute path to CLIProxy binary; undefined when useRemoteProxy=true */
  binaryPath: string | undefined;
}

/** Dependencies injected by the orchestrator */
export interface ResolveExecutorProxyContext {
  unifiedConfig: UnifiedConfig;
  allProviders: CLIProxyProvider[];
  verbose: boolean;
  cfg: ExecutorConfig;
  log: (msg: string) => void;
}

/**
 * Resolves side-effect-free proxy configuration and strips proxy flags.
 *
 * Mutates `context.cfg.port` in-place (same as original orchestrator behaviour).
 */
export function resolveExecutorProxyConfig(
  args: string[],
  context: ResolveExecutorProxyContext
): ResolvedExecutorProxyConfig {
  const { unifiedConfig, cfg, log } = context;

  // Resolve proxy config from CLI flags > ENV > config.yaml > defaults
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

  // Port resolution and validation (mutates cfg in-place)
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

  return { proxyConfig, argsWithoutProxy, cfg };
}

/**
 * Resolves proxy configuration, checks remote reachability, selects the local
 * backend, and ensures the CLIProxy binary is present when running locally.
 */
export async function resolveExecutorProxy(
  resolvedConfig: ResolvedExecutorProxyConfig,
  context: ResolveExecutorProxyContext
): Promise<ResolvedProxy> {
  const { allProviders, verbose: _verbose } = context;
  const { proxyConfig, argsWithoutProxy, cfg } = resolvedConfig;

  // Check remote proxy reachability
  let useRemoteProxy = false;
  let localBackend: CLIProxyBackend = 'original';

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
        throw new ProxyError(
          'Remote proxy unreachable and --remote-only specified',
          proxyConfig.port
        );
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
              throw new ProxyError(
                'Remote proxy unreachable and user declined fallback',
                proxyConfig.port
              );
            }
          }
          console.log(info('Starting local proxy...'));
        }
      } else {
        throw new ProxyError('Remote proxy unreachable and fallback disabled', proxyConfig.port);
      }
    }
  }

  // Local backend selection (only when not using remote proxy)
  if (!useRemoteProxy) {
    localBackend = getConfiguredBackend({ notifyOnPlus: true });

    for (const p of allProviders) {
      if (localBackend === 'original' && PLUS_ONLY_PROVIDERS.includes(p as CLIProxyProvider)) {
        console.error('');
        console.error(fail(getPlusBackendUnavailableMessage(p)));
        console.error('');
        throw new ProviderError(`Provider ${p} requires local CLIProxy Plus backend`, p);
      }
    }
  }

  // Binary acquisition — skipped when using remote proxy
  let binaryPath: string | undefined;

  if (!useRemoteProxy) {
    const spinner = new ProgressIndicator('Preparing CLIProxy');
    spinner.start();

    try {
      binaryPath = await ensureCLIProxyBinary(_verbose, { skipAutoUpdate: true });
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

  return {
    proxyConfig,
    useRemoteProxy,
    localBackend,
    binaryPath,
    argsWithoutProxy,
    cfg,
  };
}
