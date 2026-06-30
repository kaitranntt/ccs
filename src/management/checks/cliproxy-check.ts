/**
 * CLIProxy Plus Health Checks - Binary, config, auth, and port status
 */

import * as fs from 'fs';
import { ok, warn, info } from '../../utils/ui';
import {
  isCLIProxyInstalled,
  getCLIProxyPath,
  getAllAuthStatus,
  getCliproxyConfigPath,
  getInstalledCliproxyVersion,
  CLIPROXY_DEFAULT_PORT,
  configNeedsRegeneration,
  regenerateConfig,
  CLIPROXY_CONFIG_VERSION,
} from '../../cliproxy';
import { getPortProcess, isCLIProxyProcess } from '../../utils/port-utils';
import { HealthCheck, IHealthChecker, createSpinner } from './types';

const ora = createSpinner();

/**
 * Check CLIProxy Plus binary installation
 */
export class CLIProxyBinaryChecker implements IHealthChecker {
  name = 'CLIProxy Plus Binary';

  run(results: HealthCheck): void {
    const spinner = ora('Checking CLIProxy Plus binary').start();

    if (isCLIProxyInstalled()) {
      const binaryPath = getCLIProxyPath();
      const installedVersion = getInstalledCliproxyVersion();
      spinner.succeed();
      console.log(`  ${ok('CLIProxy Plus'.padEnd(22))}  v${installedVersion}`);
      results.addCheck('CLIProxy Binary', 'success', undefined, undefined, {
        status: 'OK',
        info: `v${installedVersion} (${binaryPath})`,
      });
    } else {
      spinner.info();
      console.log(`  ${info('CLIProxy Plus'.padEnd(22))}  Not installed (downloads on first use)`);
      results.addCheck(
        'CLIProxy Binary',
        'success',
        'Not installed yet',
        'Run: ccs gemini "test" (will download automatically)',
        { status: 'OK', info: 'Not installed (downloads on first use)' }
      );
    }
  }
}

/**
 * Check CLIProxy config file
 */
export class CLIProxyConfigChecker implements IHealthChecker {
  name = 'CLIProxy Config';

  run(results: HealthCheck): void {
    const spinner = ora('Checking CLIProxy config').start();
    const configPath = getCliproxyConfigPath();

    if (fs.existsSync(configPath)) {
      // Check if config needs regeneration (version mismatch or missing features)
      if (configNeedsRegeneration()) {
        spinner.warn();
        console.log(
          `  ${warn('CLIProxy Config'.padEnd(22))}  Outdated config, upgrading to v${CLIPROXY_CONFIG_VERSION}...`
        );

        // Regenerate config with new features
        regenerateConfig();

        console.log(
          `  ${ok('CLIProxy Config'.padEnd(22))}  Upgraded to v${CLIPROXY_CONFIG_VERSION}`
        );
        results.addCheck('CLIProxy Config', 'success', undefined, undefined, {
          status: 'OK',
          info: `Upgraded to v${CLIPROXY_CONFIG_VERSION}`,
        });
      } else {
        spinner.succeed();
        console.log(
          `  ${ok('CLIProxy Config'.padEnd(22))}  cliproxy/config.yaml (v${CLIPROXY_CONFIG_VERSION})`
        );
        results.addCheck('CLIProxy Config', 'success', undefined, undefined, {
          status: 'OK',
          info: `cliproxy/config.yaml (v${CLIPROXY_CONFIG_VERSION})`,
        });
      }
    } else {
      spinner.info();
      console.log(`  ${info('CLIProxy Config'.padEnd(22))}  Not created (on first use)`);
      results.addCheck('CLIProxy Config', 'success', 'Not created yet', undefined, {
        status: 'OK',
        info: 'Generated on first use',
      });
    }
  }
}

/**
 * Check OAuth status for all providers
 */
export class CLIProxyAuthChecker implements IHealthChecker {
  name = 'CLIProxy Auth';

  run(results: HealthCheck): void {
    // Reading auth status touches ~/.ccs; a permission error (EACCES) must not
    // crash doctor before the ERRORS section renders. Surface it as a recoverable
    // check instead of throwing.
    let authStatuses;
    try {
      authStatuses = getAllAuthStatus();
    } catch (err) {
      const spinner = ora('Checking CLIProxy auth').start();
      spinner.fail();
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  ${warn('CLIProxy Auth'.padEnd(22))}  Unable to read auth status`);
      results.addCheck(
        'CLIProxy Auth',
        'error',
        `Unable to read CLIProxy auth status: ${message}`,
        'sudo chown -R $USER ~/.ccs ~/.claude && chmod -R u+rwX ~/.ccs ~/.claude',
        { status: 'ERROR', info: 'Auth status unavailable (permission or read error)' }
      );
      return;
    }
    for (const status of authStatuses) {
      const spinner = ora(`Checking ${status.provider} auth`).start();
      const providerName = status.provider.charAt(0).toUpperCase() + status.provider.slice(1);

      if (status.authenticated) {
        const lastAuth = status.lastAuth ? ` (${status.lastAuth.toLocaleDateString()})` : '';
        spinner.succeed();
        console.log(`  ${ok(`${providerName} Auth`.padEnd(22))}  Authenticated${lastAuth}`);
        results.addCheck(`${providerName} Auth`, 'success', undefined, undefined, {
          status: 'OK',
          info: `Authenticated${lastAuth}`,
        });
      } else {
        spinner.info();
        console.log(`  ${info(`${providerName} Auth`.padEnd(22))}  Not authenticated`);
        results.addCheck(
          `${providerName} Auth`,
          'success',
          'Not authenticated',
          `Run: ccs ${status.provider} --auth`,
          { status: 'OK', info: 'Not authenticated (run ccs <profile> to login)' }
        );
      }
    }
  }
}

/**
 * Check CLIProxy port status
 */
export class CLIProxyPortChecker implements IHealthChecker {
  name = 'CLIProxy Port';

  async run(results: HealthCheck): Promise<void> {
    const spinner = ora(`Checking port ${CLIPROXY_DEFAULT_PORT}`).start();
    const portProcess = await getPortProcess(CLIPROXY_DEFAULT_PORT);

    if (!portProcess) {
      // Port is free
      spinner.info();
      console.log(
        `  ${info('CLIProxy Port'.padEnd(22))}  ${CLIPROXY_DEFAULT_PORT} free (proxy not running)`
      );
      results.addCheck('CLIProxy Port', 'success', undefined, undefined, {
        status: 'OK',
        info: `Port ${CLIPROXY_DEFAULT_PORT} free`,
      });
    } else if (isCLIProxyProcess(portProcess)) {
      // CLIProxy is running (expected)
      spinner.succeed();
      console.log(`  ${ok('CLIProxy Port'.padEnd(22))}  CLIProxy running (PID ${portProcess.pid})`);
      results.addCheck('CLIProxy Port', 'success', undefined, undefined, {
        status: 'OK',
        info: `CLIProxy running (PID ${portProcess.pid})`,
      });
    } else {
      // Port conflict - different process
      spinner.warn();
      console.log(
        `  ${warn('CLIProxy Port'.padEnd(22))}  ${CLIPROXY_DEFAULT_PORT} occupied by ${portProcess.processName}`
      );
      results.addCheck(
        'CLIProxy Port',
        'warning',
        `Port ${CLIPROXY_DEFAULT_PORT} occupied by ${portProcess.processName} (PID ${portProcess.pid})`,
        `Kill process: kill ${portProcess.pid} (or restart conflicting application)`,
        { status: 'WARN', info: `Occupied by ${portProcess.processName}` }
      );
    }
  }
}

/**
 * Run all CLIProxy checks
 */
export async function runCLIProxyChecks(results: HealthCheck): Promise<void> {
  const binaryChecker = new CLIProxyBinaryChecker();
  const configChecker = new CLIProxyConfigChecker();
  const authChecker = new CLIProxyAuthChecker();
  const portChecker = new CLIProxyPortChecker();

  binaryChecker.run(results);
  configChecker.run(results);
  authChecker.run(results);
  await portChecker.run(results);
}
