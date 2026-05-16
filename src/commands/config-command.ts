/**
 * Config Command Handler
 *
 * Launches web-based configuration dashboard.
 * Ensures CLIProxy service is running for dashboard features.
 * Usage: ccs config [--port PORT] [--host HOST] [--dev]
 */

import getPort from 'get-port';
import open from 'open';
import { startServer } from '../web-server';
import { setupGracefulShutdown } from '../web-server/shutdown';
import { ensureCliproxyService } from '../cliproxy/service-manager';
import { resolveLifecyclePort } from '../cliproxy/config/port-manager';
import { initUI, header, ok, info, warn, fail } from '../utils/ui';
import { resolveNamedCommand, type NamedCommandRoute } from './named-command-router';
import {
  isLoopbackHost,
  isWildcardHost,
  normalizeDashboardHost,
  resolveDashboardUrls,
} from './config-dashboard-host';
import { parseConfigCommandArgs, showConfigCommandHelp } from './config-command-options';
import { createLogger } from '../services/logging';
import { getDashboardAuthConfig } from '../config/config-loader-facade';

const logger = createLogger('command:config');

const CONFIG_SUBCOMMAND_ROUTES: readonly NamedCommandRoute[] = [
  {
    name: 'channels',
    handle: async (args) => {
      const { handleConfigChannelsCommand } = await import('./config-channels-command');
      await handleConfigChannelsCommand(args);
    },
  },
  {
    name: 'auth',
    handle: async (args) => {
      const { handleConfigAuthCommand } = await import('./config-auth');
      await handleConfigAuthCommand(args);
    },
  },
  {
    name: 'image-analysis',
    handle: async (args) => {
      const { handleConfigImageAnalysisCommand } = await import('./config-image-analysis-command');
      await handleConfigImageAnalysisCommand(args);
    },
  },
  {
    name: 'thinking',
    handle: async (args) => {
      const { handleConfigThinkingCommand } = await import('./config-thinking-command');
      await handleConfigThinkingCommand(args);
    },
  },
];

interface ConfigCommandDependencies {
  getPort: typeof getPort;
  openBrowser: typeof open;
  startServer: typeof startServer;
  setupGracefulShutdown: typeof setupGracefulShutdown;
  ensureCliproxyService: typeof ensureCliproxyService;
  getDashboardAuthConfig: typeof getDashboardAuthConfig;
  initUI: typeof initUI;
  header: typeof header;
  ok: typeof ok;
  info: typeof info;
  warn: typeof warn;
  fail: typeof fail;
  resolveNamedCommand: typeof resolveNamedCommand;
  configSubcommandRoutes: readonly NamedCommandRoute[];
}

const defaultConfigCommandDependencies: ConfigCommandDependencies = {
  getPort,
  openBrowser: open,
  startServer,
  setupGracefulShutdown,
  ensureCliproxyService,
  getDashboardAuthConfig,
  initUI,
  header,
  ok,
  info,
  warn,
  fail,
  resolveNamedCommand,
  configSubcommandRoutes: CONFIG_SUBCOMMAND_ROUTES,
};

/**
 * Handle config command
 */
export async function handleConfigCommand(
  args: string[],
  deps: ConfigCommandDependencies = defaultConfigCommandDependencies
): Promise<void> {
  if (args.length === 1 && args[0] === 'help') {
    await deps.initUI();
    showConfigCommandHelp();
    process.exit(0);
  }

  const subcommand = args[0]?.startsWith('-')
    ? undefined
    : deps.resolveNamedCommand(args[0], deps.configSubcommandRoutes);
  if (subcommand) {
    await subcommand.handle(args.slice(1));
    return;
  }

  await deps.initUI();

  const parsed = parseConfigCommandArgs(args);
  if (parsed.help) {
    showConfigCommandHelp();
    process.exit(0);
  }
  if (parsed.error) {
    console.error(deps.fail(parsed.error));
    process.exit(1);
  }

  const options = parsed.options;
  const verbose = options.dev;
  logger.info('dashboard.launch_requested', 'Config dashboard launch requested', {
    dev: Boolean(options.dev),
    host: options.host || null,
    port: options.port || null,
  });

  console.log(deps.header('CCS Config Dashboard'));
  console.log('');

  // Ensure CLIProxy service is running for dashboard features
  console.log(deps.info('Starting CLIProxy service...'));
  const cliproxyResult = await deps.ensureCliproxyService(resolveLifecyclePort(), verbose);
  logger.info('cliproxy.ensure_result', 'Config command checked CLIProxy availability', {
    started: cliproxyResult.started,
    alreadyRunning: cliproxyResult.alreadyRunning,
    configRegenerated: cliproxyResult.configRegenerated,
    port: cliproxyResult.port || null,
    error: cliproxyResult.error || null,
  });

  if (cliproxyResult.started) {
    if (cliproxyResult.alreadyRunning) {
      console.log(deps.ok(`CLIProxy already running on port ${cliproxyResult.port}`));
      if (cliproxyResult.configRegenerated) {
        console.log(deps.warn('Config updated - restart CLIProxy to apply changes'));
      }
    } else {
      console.log(deps.ok(`CLIProxy started on port ${cliproxyResult.port}`));
    }
  } else {
    console.log(deps.warn(`CLIProxy not available: ${cliproxyResult.error}`));
    console.log(deps.info('Dashboard will work but Control Panel/Stats may be limited'));
  }
  console.log('');

  console.log(deps.info('Starting dashboard server...'));

  // Find available port
  const port =
    options.port ??
    (await deps.getPort({
      port: [3000, 3001, 3002, 8000, 8080],
    }));

  try {
    // Start server
    const serverOptions: Parameters<typeof startServer>[0] = {
      port,
      dev: options.dev,
    };
    if (options.host) {
      serverOptions.host = normalizeDashboardHost(options.host);
    }

    const { server, wss, cleanup } = await deps.startServer(serverOptions);

    // Setup graceful shutdown
    deps.setupGracefulShutdown(server, wss, cleanup);

    const urls = resolveDashboardUrls(resolveServerBindHost(server) ?? options.host, port);
    const shouldWarnAboutExposure = urls.bindHost ? !isLoopbackHost(urls.bindHost) : false;

    if (options.dev) {
      console.log(deps.ok(`Dev Server: ${urls.browserUrl}`));
      console.log('');
      console.log(deps.info('HMR enabled - UI changes will hot-reload'));
    } else {
      console.log(deps.ok(`Dashboard: ${urls.browserUrl}`));
    }

    if (shouldWarnAboutExposure && urls.bindHost) {
      console.log(deps.info(`Bind host: ${urls.bindHost}`));
      if (urls.networkUrls?.length === 1) {
        console.log(deps.info(`Network URL: ${urls.networkUrls[0]}`));
      } else if (urls.networkUrls && urls.networkUrls.length > 1) {
        console.log(deps.info('Network URLs:'));
        for (const networkUrl of urls.networkUrls) {
          console.log(deps.info(`  ${networkUrl}`));
        }
      }
    }

    if (shouldWarnAboutExposure && urls.bindHost) {
      const authConfig = deps.getDashboardAuthConfig();
      console.log(
        deps.warn('Dashboard may be reachable from other devices that can connect to this machine.')
      );
      if (!authConfig.enabled) {
        console.log(deps.info('Protect it before sharing: ccs config auth setup'));
      }
      if (isWildcardHost(urls.bindHost) && !urls.networkUrls?.length) {
        console.log(deps.info('Use your machine IP or hostname from the other device.'));
      }
    }
    console.log('');

    // Open browser
    try {
      await deps.openBrowser(urls.browserUrl, { wait: false });
      logger.info('dashboard.browser_opened', 'Config dashboard browser launch attempted', {
        browserUrl: urls.browserUrl,
      });
      console.log(deps.info('Browser opened automatically'));
    } catch {
      logger.warn('dashboard.browser_open_failed', 'Automatic browser launch failed', {
        browserUrl: urls.browserUrl,
      });
      console.log(deps.info(`Open manually: ${urls.browserUrl}`));
    }

    console.log('');
    console.log(deps.info('Press Ctrl+C to stop'));
  } catch (error) {
    logger.error('dashboard.launch_failed', 'Config dashboard failed to launch', {
      message: (error as Error).message,
    });
    console.error(deps.fail(`Failed to start server: ${(error as Error).message}`));
    process.exit(1);
  }
}

function resolveServerBindHost(server: {
  address(): string | { address: string } | null;
}): string | undefined {
  const address = server.address();
  if (!address || typeof address === 'string') {
    return undefined;
  }

  return address.address;
}
