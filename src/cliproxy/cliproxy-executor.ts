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
import { escapeShellArg } from '../utils/shell-executor';
import { ensureCLIProxyBinary } from './binary-manager';
import {
  generateConfig,
  getEffectiveEnvVars,
  getProviderConfig,
  ensureProviderSettings,
  CLIPROXY_DEFAULT_PORT,
} from './config-generator';
import { isAuthenticated } from './auth-handler';
import { CLIProxyProvider, ExecutorConfig } from './types';

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

  // Validate provider
  const providerConfig = getProviderConfig(provider);
  log(`Provider: ${providerConfig.displayName}`);

  // 1. Ensure binary exists (downloads if needed)
  const spinner = new ProgressIndicator('Preparing CLIProxy');
  spinner.start();

  let binaryPath: string;
  try {
    binaryPath = await ensureCLIProxyBinary(verbose);
    spinner.succeed('CLIProxy binary ready');
  } catch (error) {
    spinner.fail('Failed to prepare CLIProxy');
    throw error;
  }

  // 2. Handle authentication flags
  const forceAuth = args.includes('--auth');
  const forceHeadless = args.includes('--headless');
  const forceLogout = args.includes('--logout');

  // Handle --logout: clear auth and exit
  if (forceLogout) {
    const { clearAuth } = await import('./auth-handler');
    if (clearAuth(provider)) {
      console.log(`[OK] Logged out from ${providerConfig.displayName}`);
    } else {
      console.log(`[i] No authentication found for ${providerConfig.displayName}`);
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
        ...(forceHeadless ? { headless: true } : {}),
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

  // 4. Ensure user settings file exists (creates from defaults if not)
  ensureProviderSettings(provider);

  // 5. Generate config file
  log(`Generating config for ${provider}`);
  const configPath = generateConfig(provider, cfg.port);
  log(`Config written: ${configPath}`);

  // 6. Spawn CLIProxyAPI binary
  const proxyArgs = ['--config', configPath];

  log(`Spawning: ${binaryPath} ${proxyArgs.join(' ')}`);

  const proxy = spawn(binaryPath, proxyArgs, {
    stdio: ['ignore', verbose ? 'pipe' : 'ignore', verbose ? 'pipe' : 'ignore'],
    detached: false,
  });

  // Forward proxy output in verbose mode
  if (verbose) {
    proxy.stdout?.on('data', (data: Buffer) => {
      process.stderr.write(`[cliproxy-out] ${data.toString()}`);
    });
    proxy.stderr?.on('data', (data: Buffer) => {
      process.stderr.write(`[cliproxy-err] ${data.toString()}`);
    });
  }

  // Handle proxy errors
  proxy.on('error', (error) => {
    console.error(`[X] CLIProxy spawn error: ${error.message}`);
  });

  // 5. Wait for proxy readiness via TCP polling
  const readySpinner = new ProgressIndicator(`Waiting for CLIProxy on port ${cfg.port}`);
  readySpinner.start();

  try {
    await waitForProxyReady(cfg.port, cfg.timeout, cfg.pollInterval);
    readySpinner.succeed(`CLIProxy ready on port ${cfg.port}`);
  } catch (error) {
    readySpinner.fail('CLIProxy startup failed');
    proxy.kill('SIGTERM');

    const err = error as Error;
    console.error('');
    console.error('[X] CLIProxy failed to start');
    console.error('');
    console.error('Possible causes:');
    console.error(`  1. Port ${cfg.port} already in use`);
    console.error('  2. Binary crashed on startup');
    console.error('  3. Invalid configuration');
    console.error('');
    console.error('Troubleshooting:');
    console.error(`  - Check if port ${cfg.port} is in use: lsof -i :${cfg.port}`);
    console.error('  - Run with --verbose for detailed logs');
    console.error(`  - Check config: cat ${configPath}`);
    console.error('');

    throw new Error(`CLIProxy startup failed: ${err.message}`);
  }

  // 7. Execute Claude CLI with proxied environment
  // Uses custom settings path (for variants), user settings, or bundled defaults
  const envVars = getEffectiveEnvVars(provider, cfg.port, cfg.customSettingsPath);
  const env = { ...process.env, ...envVars };

  log(`Claude env: ANTHROPIC_BASE_URL=${envVars.ANTHROPIC_BASE_URL}`);
  log(`Claude env: ANTHROPIC_MODEL=${envVars.ANTHROPIC_MODEL}`);

  // Filter out CCS-specific flags before passing to Claude CLI
  const ccsFlags = ['--auth', '--headless', '--logout'];
  const claudeArgs = args.filter((arg) => !ccsFlags.includes(arg));

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

  // 8. Cleanup: kill proxy when Claude exits
  claude.on('exit', (code, signal) => {
    log(`Claude exited: code=${code}, signal=${signal}`);
    proxy.kill('SIGTERM');

    if (signal) {
      process.kill(process.pid, signal as NodeJS.Signals);
    } else {
      process.exit(code || 0);
    }
  });

  claude.on('error', (error) => {
    console.error('[X] Claude CLI error:', error);
    proxy.kill('SIGTERM');
    process.exit(1);
  });

  // Handle parent process termination (SIGTERM, SIGINT)
  const cleanup = () => {
    log('Parent signal received, cleaning up');
    proxy.kill('SIGTERM');
    claude.kill('SIGTERM');
  };

  process.once('SIGTERM', cleanup);
  process.once('SIGINT', cleanup);

  // Handle proxy crash
  proxy.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      log(`Proxy exited unexpectedly: code=${code}, signal=${signal}`);
      // Don't kill Claude - it may have already exited
    }
  });
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
