/**
 * Auth Handler for CLIProxyAPI
 *
 * Manages OAuth authentication for CLIProxy providers (Gemini, Codex, Antigravity).
 * CLIProxyAPI handles OAuth internally - we just need to:
 * 1. Check if auth exists (token files in CCS auth directory)
 * 2. Trigger OAuth flow by spawning binary with auth flag
 * 3. Auto-detect headless environments (SSH, no DISPLAY)
 * 4. Use --no-browser flag for headless, display OAuth URL for manual auth
 *
 * Token storage: ~/.ccs/cliproxy/auth/<provider>/
 * Each provider has its own directory to avoid conflicts.
 */

import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { ProgressIndicator } from '../utils/progress-indicator';
import { ensureCLIProxyBinary } from './binary-manager';
import { generateConfig, getProviderAuthDir } from './config-generator';
import { CLIProxyProvider } from './types';

/**
 * OAuth callback ports used by CLIProxyAPI (hardcoded in binary)
 * See: https://github.com/router-for-me/CLIProxyAPI/tree/main/internal/auth
 *
 * OAuth flow types per provider:
 * - Gemini: Authorization Code Flow with local callback server on port 8085
 * - Codex:  Authorization Code Flow with local callback server on port 1455
 * - Agy:    Authorization Code Flow with local callback server on port 51121
 * - Qwen:   Device Code Flow (polling-based, NO callback port needed)
 *
 * We auto-kill processes on callback ports before OAuth to avoid conflicts.
 */
const OAUTH_CALLBACK_PORTS: Partial<Record<CLIProxyProvider, number>> = {
  gemini: 8085,
  // codex uses 1455
  // agy uses 51121
  // qwen uses Device Code Flow - no callback port needed
};

/**
 * Kill any process using a specific port
 * Used to free OAuth callback port before authentication
 */
function killProcessOnPort(port: number, verbose: boolean): boolean {
  try {
    if (process.platform === 'win32') {
      // Windows: use netstat + taskkill
      const result = execSync(`netstat -ano | findstr :${port}`, {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      const lines = result.trim().split('\n');
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid)) {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'pipe' });
          if (verbose) console.error(`[auth] Killed process ${pid} on port ${port}`);
        }
      }
      return true;
    } else {
      // Unix: use lsof + kill
      const result = execSync(`lsof -ti:${port}`, { encoding: 'utf-8', stdio: 'pipe' });
      const pids = result
        .trim()
        .split('\n')
        .filter((p) => p);
      for (const pid of pids) {
        execSync(`kill -9 ${pid}`, { stdio: 'pipe' });
        if (verbose) console.error(`[auth] Killed process ${pid} on port ${port}`);
      }
      return pids.length > 0;
    }
  } catch {
    // No process on port or command failed - that's fine
    return false;
  }
}

/**
 * Detect if running in a headless environment (no browser available)
 */
function isHeadlessEnvironment(): boolean {
  // SSH session
  if (process.env.SSH_TTY || process.env.SSH_CLIENT || process.env.SSH_CONNECTION) {
    return true;
  }

  // No display (Linux/X11)
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    return true;
  }

  // Non-interactive (piped stdin) - skip on Windows
  // Windows npm wrappers don't set isTTY correctly (returns undefined, not true)
  // Windows desktop environments always have browser capability
  if (process.platform !== 'win32' && !process.stdin.isTTY) {
    return true;
  }

  return false;
}

/**
 * Auth status for a provider
 */
export interface AuthStatus {
  /** Provider name */
  provider: CLIProxyProvider;
  /** Whether authentication exists */
  authenticated: boolean;
  /** Path to token directory */
  tokenDir: string;
  /** Token file paths found */
  tokenFiles: string[];
  /** When last authenticated (if known) */
  lastAuth?: Date;
}

/**
 * OAuth config for each provider
 */
interface ProviderOAuthConfig {
  /** Provider identifier */
  provider: CLIProxyProvider;
  /** Display name */
  displayName: string;
  /** OAuth authorization URL (for manual flow) */
  authUrl: string;
  /** Scopes required */
  scopes: string[];
  /** CLI flag for auth */
  authFlag: string;
}

/**
 * OAuth configurations per provider
 * Note: CLIProxyAPI handles actual OAuth - these are for display/manual flow
 */
const OAUTH_CONFIGS: Record<CLIProxyProvider, ProviderOAuthConfig> = {
  gemini: {
    provider: 'gemini',
    displayName: 'Google Gemini',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scopes: ['https://www.googleapis.com/auth/generative-language'],
    authFlag: '--login',
  },
  codex: {
    provider: 'codex',
    displayName: 'Codex',
    authUrl: 'https://auth.openai.com/authorize',
    scopes: ['openid', 'profile'],
    authFlag: '--codex-login',
  },
  agy: {
    provider: 'agy',
    displayName: 'Antigravity',
    authUrl: 'https://antigravity.ai/oauth/authorize',
    scopes: ['api'],
    authFlag: '--antigravity-login',
  },
  qwen: {
    provider: 'qwen',
    displayName: 'Qwen Code',
    authUrl: 'https://chat.qwen.ai/api/v1/oauth2/device/code',
    scopes: ['openid', 'profile', 'email', 'model.completion'],
    authFlag: '--qwen-login',
  },
  iflow: {
    provider: 'iflow',
    displayName: 'iFlow',
    authUrl: 'https://iflow.cn/oauth',
    scopes: ['phone', 'profile', 'email'],
    authFlag: '--iflow-login',
  },
};

/**
 * Get OAuth config for provider
 */
export function getOAuthConfig(provider: CLIProxyProvider): ProviderOAuthConfig {
  const config = OAUTH_CONFIGS[provider];
  if (!config) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  return config;
}

/**
 * Get token directory for provider
 */
export function getProviderTokenDir(provider: CLIProxyProvider): string {
  return getProviderAuthDir(provider);
}

/**
 * Provider-specific auth file prefixes (fallback detection)
 * CLIProxyAPI names auth files with provider prefix (e.g., "antigravity-user@email.json")
 * Note: Gemini tokens may NOT have prefix - CLIProxyAPI uses {email}-{projectID}.json format
 */
const PROVIDER_AUTH_PREFIXES: Record<CLIProxyProvider, string[]> = {
  gemini: ['gemini-', 'google-'],
  codex: ['codex-', 'openai-'],
  agy: ['antigravity-', 'agy-'],
  qwen: ['qwen-'],
  iflow: ['iflow-'],
};

/**
 * Provider type values inside token JSON files
 * CLIProxyAPI sets "type" field in token JSON (e.g., {"type": "gemini"})
 */
const PROVIDER_TYPE_VALUES: Record<CLIProxyProvider, string[]> = {
  gemini: ['gemini'],
  codex: ['codex'],
  agy: ['antigravity'],
  qwen: ['qwen'],
  iflow: ['iflow'],
};

/**
 * Check if a JSON file contains a token for the given provider
 * Reads the file and checks the "type" field
 */
function isTokenFileForProvider(filePath: string, provider: CLIProxyProvider): boolean {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    const typeValue = (data.type || '').toLowerCase();
    const validTypes = PROVIDER_TYPE_VALUES[provider] || [];
    return validTypes.includes(typeValue);
  } catch {
    return false;
  }
}

/**
 * Check if provider has valid authentication
 * CLIProxyAPI stores OAuth tokens as JSON files in the auth directory.
 * Detection strategy:
 * 1. First check by filename prefix (fast path)
 * 2. If no match, check JSON content for "type" field (Gemini uses {email}-{projectID}.json without prefix)
 */
export function isAuthenticated(provider: CLIProxyProvider): boolean {
  const tokenDir = getProviderTokenDir(provider);

  if (!fs.existsSync(tokenDir)) {
    return false;
  }

  const validPrefixes = PROVIDER_AUTH_PREFIXES[provider] || [];

  try {
    const files = fs.readdirSync(tokenDir);
    const jsonFiles = files.filter(
      (f) => f.endsWith('.json') || f.endsWith('.token') || f === 'credentials'
    );

    // Strategy 1: Check by filename prefix (fast path for antigravity, codex)
    const prefixMatch = jsonFiles.some((f) => {
      const lowerFile = f.toLowerCase();
      return validPrefixes.some((prefix) => lowerFile.startsWith(prefix));
    });
    if (prefixMatch) return true;

    // Strategy 2: Check JSON content for "type" field (needed for Gemini)
    for (const f of jsonFiles) {
      const filePath = path.join(tokenDir, f);
      if (isTokenFileForProvider(filePath, provider)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Get detailed auth status for provider
 * Uses same detection strategy as isAuthenticated: prefix first, then content
 */
export function getAuthStatus(provider: CLIProxyProvider): AuthStatus {
  const tokenDir = getProviderTokenDir(provider);
  let tokenFiles: string[] = [];
  let lastAuth: Date | undefined;

  const validPrefixes = PROVIDER_AUTH_PREFIXES[provider] || [];

  if (fs.existsSync(tokenDir)) {
    const files = fs.readdirSync(tokenDir);
    const jsonFiles = files.filter(
      (f) => f.endsWith('.json') || f.endsWith('.token') || f === 'credentials'
    );

    // Check each file: by prefix OR by content
    tokenFiles = jsonFiles.filter((f) => {
      const lowerFile = f.toLowerCase();
      // Strategy 1: prefix match
      if (validPrefixes.some((prefix) => lowerFile.startsWith(prefix))) {
        return true;
      }
      // Strategy 2: content match (for Gemini tokens without prefix)
      const filePath = path.join(tokenDir, f);
      return isTokenFileForProvider(filePath, provider);
    });

    // Get most recent modification time
    for (const file of tokenFiles) {
      const filePath = path.join(tokenDir, file);
      try {
        const stats = fs.statSync(filePath);
        if (!lastAuth || stats.mtime > lastAuth) {
          lastAuth = stats.mtime;
        }
      } catch {
        // Skip if can't stat file
      }
    }
  }

  return {
    provider,
    authenticated: tokenFiles.length > 0,
    tokenDir,
    tokenFiles,
    lastAuth,
  };
}

/**
 * Get auth status for all providers
 */
export function getAllAuthStatus(): AuthStatus[] {
  const providers: CLIProxyProvider[] = ['gemini', 'codex', 'agy', 'qwen', 'iflow'];
  return providers.map(getAuthStatus);
}

/**
 * Clear authentication for provider
 */
export function clearAuth(provider: CLIProxyProvider): boolean {
  const tokenDir = getProviderTokenDir(provider);

  if (!fs.existsSync(tokenDir)) {
    return false;
  }

  // Remove all files in token directory
  const files = fs.readdirSync(tokenDir);
  for (const file of files) {
    fs.unlinkSync(path.join(tokenDir, file));
  }

  // Remove directory
  fs.rmdirSync(tokenDir);

  return true;
}

/**
 * Trigger OAuth flow for provider
 * Auto-detects headless environment and uses --no-browser flag accordingly
 */
export async function triggerOAuth(
  provider: CLIProxyProvider,
  options: { verbose?: boolean; headless?: boolean } = {}
): Promise<boolean> {
  const oauthConfig = getOAuthConfig(provider);
  const { verbose = false } = options;

  // Auto-detect headless if not explicitly set
  const headless = options.headless ?? isHeadlessEnvironment();

  const log = (msg: string) => {
    if (verbose) {
      console.error(`[auth] ${msg}`);
    }
  };

  // Ensure binary exists
  let binaryPath: string;
  try {
    binaryPath = await ensureCLIProxyBinary(verbose);
  } catch (error) {
    console.error('[X] Failed to prepare CLIProxy binary');
    throw error;
  }

  // Ensure auth directory exists
  const tokenDir = getProviderTokenDir(provider);
  fs.mkdirSync(tokenDir, { recursive: true, mode: 0o700 });

  // Generate config file (CLIProxyAPI requires it even for auth)
  const configPath = generateConfig(provider);
  log(`Config generated: ${configPath}`);

  // Free OAuth callback port if this provider shares it with another
  // Qwen and Gemini both use port 8085 - kill any existing process to avoid conflict
  const callbackPort = OAUTH_CALLBACK_PORTS[provider];
  if (callbackPort) {
    const killed = killProcessOnPort(callbackPort, verbose);
    if (killed) {
      log(`Freed port ${callbackPort} for OAuth callback`);
    }
  }

  // Build args: config + auth flag + optional --no-browser for headless
  const args = ['--config', configPath, oauthConfig.authFlag];
  if (headless) {
    args.push('--no-browser');
  }

  // Show appropriate message
  console.log('');
  if (headless) {
    console.log(`[i] Headless mode detected - manual authentication required`);
    console.log(`[i] ${oauthConfig.displayName} will display an OAuth URL below`);
    console.log('');
  } else {
    console.log(`[i] Opening browser for ${oauthConfig.displayName} authentication...`);
    console.log('[i] Complete the login in your browser.');
    console.log('');
  }

  const spinner = new ProgressIndicator(`Authenticating with ${oauthConfig.displayName}`);
  if (!headless) {
    spinner.start();
  }

  return new Promise<boolean>((resolve) => {
    // Spawn CLIProxyAPI with auth flag (and --no-browser if headless)
    const authProcess = spawn(binaryPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CLI_PROXY_AUTH_DIR: tokenDir,
      },
    });

    let stderrData = '';
    let urlDisplayed = false;

    authProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      log(`stdout: ${output.trim()}`);

      // In headless mode, display OAuth URLs prominently
      if (headless) {
        const lines = output.split('\n');
        for (const line of lines) {
          // Look for URLs in the output
          const urlMatch = line.match(/https?:\/\/[^\s]+/);
          if (urlMatch && !urlDisplayed) {
            console.log(`    ${urlMatch[0]}`);
            console.log('');
            console.log('[i] Waiting for authentication... (press Ctrl+C to cancel)');
            urlDisplayed = true;
          }
        }
      }
    });

    authProcess.stderr?.on('data', (data: Buffer) => {
      const output = data.toString();
      stderrData += output;
      log(`stderr: ${output.trim()}`);

      // Also check stderr for URLs (some tools output there)
      if (headless && !urlDisplayed) {
        const urlMatch = output.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          console.log(`    ${urlMatch[0]}`);
          console.log('');
          console.log('[i] Waiting for authentication... (press Ctrl+C to cancel)');
          urlDisplayed = true;
        }
      }
    });

    // Timeout after 5 minutes for headless (user needs time to copy URL)
    const timeoutMs = headless ? 300000 : 120000;
    const timeout = setTimeout(() => {
      if (!headless) spinner.fail('Authentication timeout');
      authProcess.kill();
      console.error(`[X] OAuth timed out after ${headless ? 5 : 2} minutes`);
      console.error('');
      if (!headless) {
        console.error('Troubleshooting:');
        console.error('  - Make sure a browser is available');
        console.error('  - Try running with --verbose for details');
      }
      resolve(false);
    }, timeoutMs);

    authProcess.on('exit', (code) => {
      clearTimeout(timeout);

      if (code === 0) {
        // Verify token was created BEFORE showing success
        if (isAuthenticated(provider)) {
          if (!headless) spinner.succeed(`Authenticated with ${oauthConfig.displayName}`);
          console.log('[OK] Authentication successful');
          resolve(true);
        } else {
          if (!headless) spinner.fail('Authentication incomplete');
          console.error('[X] Token not found after authentication');
          // Qwen uses Device Code Flow (polling), others use Authorization Code Flow (callback)
          if (provider === 'qwen') {
            console.error('    Qwen uses Device Code Flow - ensure you completed auth in browser');
            console.error('    The polling may have timed out or been cancelled');
            console.error('    Try: ccs qwen --auth --verbose');
          } else {
            console.error('    The OAuth flow may have been cancelled or callback port was in use');
            console.error(`    Try: pkill -f cli-proxy-api && ccs ${provider} --auth`);
          }
          resolve(false);
        }
      } else {
        if (!headless) spinner.fail('Authentication failed');
        console.error(`[X] CLIProxyAPI auth exited with code ${code}`);
        if (stderrData && !urlDisplayed) {
          console.error(`    ${stderrData.trim().split('\n')[0]}`);
        }
        // Show headless hint if we detected headless environment
        if (headless && !urlDisplayed) {
          console.error('');
          console.error('[i] No OAuth URL was displayed. Try with --verbose for details.');
        }
        resolve(false);
      }
    });

    authProcess.on('error', (error) => {
      clearTimeout(timeout);
      if (!headless) spinner.fail('Authentication error');
      console.error(`[X] Failed to start auth process: ${error.message}`);
      resolve(false);
    });
  });
}

/**
 * Ensure provider is authenticated
 * Triggers OAuth flow if not authenticated
 */
export async function ensureAuth(
  provider: CLIProxyProvider,
  options: { verbose?: boolean; headless?: boolean } = {}
): Promise<boolean> {
  // Check if already authenticated
  if (isAuthenticated(provider)) {
    if (options.verbose) {
      console.error(`[auth] ${provider} already authenticated`);
    }
    return true;
  }

  // Not authenticated - trigger OAuth
  const oauthConfig = getOAuthConfig(provider);
  console.log(`[i] ${oauthConfig.displayName} authentication required`);

  return triggerOAuth(provider, options);
}

/**
 * Display auth status for all providers
 */
export function displayAuthStatus(): void {
  console.log('CLIProxy Authentication Status:');
  console.log('');

  const statuses = getAllAuthStatus();

  for (const status of statuses) {
    const oauthConfig = getOAuthConfig(status.provider);
    const icon = status.authenticated ? '[OK]' : '[!]';
    const authStatus = status.authenticated ? 'Authenticated' : 'Not authenticated';
    const lastAuthStr = status.lastAuth ? ` (last: ${status.lastAuth.toLocaleDateString()})` : '';

    console.log(`${icon} ${oauthConfig.displayName}: ${authStatus}${lastAuthStr}`);
  }

  console.log('');
  console.log('To authenticate: ccs <provider> --auth');
  console.log('To logout:       ccs <provider> --logout');
}
