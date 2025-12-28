/**
 * Proxy Config Resolver
 *
 * Resolves proxy configuration from multiple sources with priority:
 * CLI flags > Environment variables > config.yaml > defaults
 *
 * Supports both local (spawn CLIProxyAPI) and remote (connect to external) modes.
 */

import { ResolvedProxyConfig } from './types';
import { CLIPROXY_DEFAULT_PORT } from './config-generator';

/** CLI flags for proxy configuration */
export const PROXY_CLI_FLAGS = [
  '--proxy-host',
  '--proxy-port',
  '--proxy-protocol',
  '--proxy-auth-token',
  '--proxy-timeout',
  '--local-proxy',
  '--remote-only',
] as const;

/** Environment variable names for proxy configuration */
export const PROXY_ENV_VARS = {
  host: 'CCS_PROXY_HOST',
  port: 'CCS_PROXY_PORT',
  protocol: 'CCS_PROXY_PROTOCOL',
  authToken: 'CCS_PROXY_AUTH_TOKEN',
  timeout: 'CCS_PROXY_TIMEOUT',
  fallbackEnabled: 'CCS_PROXY_FALLBACK_ENABLED',
} as const;

/** Parsed CLI proxy flags */
interface ParsedProxyFlags {
  host?: string;
  port?: number;
  protocol?: 'http' | 'https';
  authToken?: string;
  timeout?: number;
  localProxy: boolean;
  remoteOnly: boolean;
}

/** Proxy config from environment variables */
interface EnvProxyConfig {
  host?: string;
  port?: number;
  protocol?: 'http' | 'https';
  authToken?: string;
  timeout?: number;
  fallbackEnabled?: boolean;
}

/**
 * Parse proxy-related CLI flags from argv.
 * Returns parsed flags and remaining args (with proxy flags removed).
 */
export function parseProxyFlags(args: string[]): {
  flags: ParsedProxyFlags;
  remainingArgs: string[];
} {
  const flags: ParsedProxyFlags = {
    localProxy: false,
    remoteOnly: false,
  };
  const remainingArgs: string[] = [];

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--proxy-host' && args[i + 1] && !args[i + 1].startsWith('-')) {
      flags.host = args[i + 1];
      i += 2;
      continue;
    }

    if (arg === '--proxy-port' && args[i + 1] && !args[i + 1].startsWith('-')) {
      const port = parseInt(args[i + 1], 10);
      if (!isNaN(port) && port > 0 && port <= 65535) {
        flags.port = port;
      }
      i += 2;
      continue;
    }

    if (arg === '--proxy-protocol' && args[i + 1] && !args[i + 1].startsWith('-')) {
      const proto = args[i + 1].toLowerCase();
      if (proto === 'http' || proto === 'https') {
        flags.protocol = proto;
      }
      i += 2;
      continue;
    }

    if (arg === '--proxy-auth-token' && args[i + 1] && !args[i + 1].startsWith('-')) {
      flags.authToken = args[i + 1];
      i += 2;
      continue;
    }

    if (arg === '--proxy-timeout' && args[i + 1] && !args[i + 1].startsWith('-')) {
      const timeout = parseInt(args[i + 1], 10);
      if (!isNaN(timeout) && timeout >= 100 && timeout <= 60000) {
        flags.timeout = timeout;
      }
      i += 2;
      continue;
    }

    if (arg === '--local-proxy') {
      flags.localProxy = true;
      i += 1;
      continue;
    }

    if (arg === '--remote-only') {
      flags.remoteOnly = true;
      i += 1;
      continue;
    }

    // Not a proxy flag - keep in remaining args
    remainingArgs.push(arg);
    i += 1;
  }

  return { flags, remainingArgs };
}

/**
 * Get proxy configuration from environment variables.
 */
export function getProxyEnvVars(): EnvProxyConfig {
  const config: EnvProxyConfig = {};

  const host = process.env[PROXY_ENV_VARS.host];
  if (host) {
    config.host = host;
  }

  const port = process.env[PROXY_ENV_VARS.port];
  if (port) {
    const portNum = parseInt(port, 10);
    if (!isNaN(portNum) && portNum > 0 && portNum <= 65535) {
      config.port = portNum;
    }
  }

  const protocol = process.env[PROXY_ENV_VARS.protocol];
  if (protocol) {
    const proto = protocol.toLowerCase();
    if (proto === 'http' || proto === 'https') {
      config.protocol = proto;
    }
  }

  const authToken = process.env[PROXY_ENV_VARS.authToken];
  if (authToken) {
    config.authToken = authToken;
  }

  const timeout = process.env[PROXY_ENV_VARS.timeout];
  if (timeout) {
    const timeoutNum = parseInt(timeout, 10);
    if (!isNaN(timeoutNum) && timeoutNum >= 100 && timeoutNum <= 60000) {
      config.timeout = timeoutNum;
    }
  }

  const fallback = process.env[PROXY_ENV_VARS.fallbackEnabled];
  if (fallback !== undefined) {
    // Accept: '1', 'true', 'yes' as enabled; '0', 'false', 'no' as disabled
    const lower = fallback.toLowerCase();
    if (lower === '1' || lower === 'true' || lower === 'yes') {
      config.fallbackEnabled = true;
    } else if (lower === '0' || lower === 'false' || lower === 'no') {
      config.fallbackEnabled = false;
    }
  }

  return config;
}

/**
 * Default proxy configuration values.
 */
const DEFAULT_PROXY_CONFIG: ResolvedProxyConfig = {
  mode: 'local',
  port: CLIPROXY_DEFAULT_PORT,
  protocol: 'http',
  fallbackEnabled: true,
  autoStartLocal: true,
  remoteOnly: false,
  forceLocal: false,
};

/**
 * Resolve proxy configuration with priority: CLI > ENV > config.yaml > defaults.
 *
 * @param cliArgs - Raw CLI arguments
 * @param configYamlProxy - Proxy section from config.yaml (optional, Phase 1)
 * @returns Resolved configuration and remaining args (without proxy flags)
 */
export function resolveProxyConfig(
  cliArgs: string[],

  _configYamlProxy?: {
    remote?: {
      enabled?: boolean;
      host?: string;
      port?: number;
      protocol?: 'http' | 'https';
      auth_token?: string;
      timeout?: number;
      fallback_enabled?: boolean;
    };
    local?: {
      port?: number;
      auto_start?: boolean;
    };
  }
): { config: ResolvedProxyConfig; remainingArgs: string[] } {
  // 1. Parse CLI flags (highest priority)
  const { flags: cliFlags, remainingArgs } = parseProxyFlags(cliArgs);

  // 2. Get environment variables
  const envConfig = getProxyEnvVars();

  // 3. config.yaml proxy section (passed as parameter - Phase 1 provides this)
  // For now, we use empty object if not provided; Phase 1 integrates unified config loading
  const yamlConfig = _configYamlProxy || {};

  // 4. Build resolved config with priority merge
  const resolved: ResolvedProxyConfig = {
    ...DEFAULT_PROXY_CONFIG,
  };

  // Determine mode: remote if host is specified AND remote is not explicitly disabled
  // Priority: CLI flags > ENV > YAML config
  // If YAML config has enabled: false, it only blocks YAML-sourced config (CLI/ENV override)
  const yamlRemoteEnabled = yamlConfig.remote?.enabled !== false;
  const hasRemoteHost =
    cliFlags.host || envConfig.host || (yamlRemoteEnabled && yamlConfig.remote?.host);

  // --local-proxy forces local mode regardless of remote config
  if (cliFlags.localProxy) {
    resolved.mode = 'local';
    resolved.forceLocal = true;
  } else if (hasRemoteHost) {
    resolved.mode = 'remote';
  }

  // Merge host: CLI > ENV > config.yaml
  resolved.host = cliFlags.host ?? envConfig.host ?? yamlConfig.remote?.host;

  // Merge port: CLI > ENV > config.yaml (remote or local) > default
  resolved.port =
    cliFlags.port ??
    envConfig.port ??
    (resolved.mode === 'remote' ? yamlConfig.remote?.port : yamlConfig.local?.port) ??
    DEFAULT_PROXY_CONFIG.port;

  // Merge protocol: CLI > ENV > config.yaml > default
  resolved.protocol =
    cliFlags.protocol ?? envConfig.protocol ?? yamlConfig.remote?.protocol ?? 'http';

  // Merge auth token: CLI > ENV > config.yaml
  resolved.authToken = cliFlags.authToken ?? envConfig.authToken ?? yamlConfig.remote?.auth_token;

  // Merge timeout: CLI > ENV > config.yaml > default (2000ms in executor)
  resolved.timeout = cliFlags.timeout ?? envConfig.timeout ?? yamlConfig.remote?.timeout;

  // Merge fallback enabled: ENV > config.yaml > default
  resolved.fallbackEnabled =
    envConfig.fallbackEnabled ?? yamlConfig.remote?.fallback_enabled ?? true;

  // --remote-only from CLI
  resolved.remoteOnly = cliFlags.remoteOnly;

  // If --remote-only, disable fallback
  if (resolved.remoteOnly) {
    resolved.fallbackEnabled = false;
  }

  // Auto-start local from config.yaml > default
  resolved.autoStartLocal = yamlConfig.local?.auto_start ?? true;

  return { config: resolved, remainingArgs };
}

/**
 * Check if args contain any proxy flags.
 * Used for quick filtering before full parse.
 */
export function hasProxyFlags(args: string[]): boolean {
  return args.some(
    (arg) =>
      arg === '--proxy-host' ||
      arg === '--proxy-port' ||
      arg === '--proxy-protocol' ||
      arg === '--proxy-auth-token' ||
      arg === '--proxy-timeout' ||
      arg === '--local-proxy' ||
      arg === '--remote-only'
  );
}
