/**
 * Auto-Repair Module - Fix common issues automatically
 */

import * as fs from 'fs';
import * as path from 'path';
import { ok, warn, fail, info, header, color } from '../../utils/ui';

import { CLIPROXY_DEFAULT_PORT } from '../../cliproxy/config/port-manager';
import {
  configNeedsRegeneration,
  regenerateConfig,
  CLIPROXY_CONFIG_VERSION,
} from '../../cliproxy/config/config-generator';
import { getPortProcess, isCLIProxyProcess } from '../../utils/port-utils';
import { killProcessOnPort, getPlatformName } from '../../utils/platform-commands';
import { createSpinner } from '../checks/types';
import { fixImageAnalysisConfig } from '../checks/image-analysis-check';
import { getCcsDir } from '../../config/config-loader-facade';

const ora = createSpinner();

/**
 * Fix detected issues automatically
 * Fixes:
 * 1. Zombie CLIProxy processes blocking ports
 * 2. Outdated CLIProxy config files
 * 3. Shared symlinks broken by Claude CLI's atomic writes
 * 4. OAuth callback ports blocked by CLIProxy
 */
export async function runAutoRepair(): Promise<void> {
  console.log('');
  console.log(header('AUTO-FIX MODE'));
  console.log('');
  console.log(info(`Platform: ${getPlatformName()}`));
  console.log('');

  let fixed = 0;

  // Fix 1: Kill zombie CLIProxy processes
  const zombieSpinner = ora('Checking for zombie CLIProxy processes').start();
  try {
    // Check main CLIProxy port
    const portProcess = await getPortProcess(CLIPROXY_DEFAULT_PORT);
    if (portProcess && isCLIProxyProcess(portProcess)) {
      zombieSpinner.text = 'Killing zombie CLIProxy process...';
      const killed = killProcessOnPort(CLIPROXY_DEFAULT_PORT, true);
      if (killed) {
        zombieSpinner.succeed(
          `${ok('Fixed')} Killed zombie CLIProxy on port ${CLIPROXY_DEFAULT_PORT}`
        );
        fixed++;
      } else {
        zombieSpinner.warn(`${warn('Partial')} CLIProxy detected but could not kill`);
      }
    } else if (portProcess) {
      zombieSpinner.info(
        `${info('Info')} Port ${CLIPROXY_DEFAULT_PORT} used by ${portProcess.processName} (not CLIProxy)`
      );
    } else {
      zombieSpinner.succeed(`${ok('OK')} No zombie CLIProxy processes found`);
    }
  } catch (err) {
    zombieSpinner.fail(`${fail('Error')} Could not check processes: ${(err as Error).message}`);
  }

  // Fix 2: Kill CLIProxy processes on OAuth callback ports
  const oauthPorts = [8085, 1455, 51121]; // Gemini, Codex, Agy
  for (const port of oauthPorts) {
    const oauthSpinner = ora(`Checking OAuth port ${port}`).start();
    try {
      const portProcess = await getPortProcess(port);
      if (portProcess && isCLIProxyProcess(portProcess)) {
        oauthSpinner.text = `Freeing OAuth port ${port}...`;
        const killed = killProcessOnPort(port, true);
        if (killed) {
          oauthSpinner.succeed(`${ok('Fixed')} Freed OAuth port ${port}`);
          fixed++;
        } else {
          oauthSpinner.warn(`${warn('Partial')} CLIProxy on port ${port} but could not kill`);
        }
      } else if (portProcess) {
        oauthSpinner.info(
          `${info('Info')} Port ${port} used by ${portProcess.processName} - please close manually`
        );
      } else {
        oauthSpinner.succeed(`${ok('OK')} OAuth port ${port} is free`);
      }
    } catch (_err) {
      oauthSpinner.succeed(`${ok('OK')} OAuth port ${port} check passed`);
    }
  }

  // Fix 3: Regenerate outdated CLIProxy config
  const configSpinner = ora('Checking CLIProxy config version').start();
  try {
    if (configNeedsRegeneration()) {
      configSpinner.text = 'Upgrading CLIProxy config...';
      regenerateConfig();
      configSpinner.succeed(
        `${ok('Fixed')} Upgraded CLIProxy config to v${CLIPROXY_CONFIG_VERSION}`
      );
      fixed++;
    } else {
      configSpinner.succeed(`${ok('OK')} CLIProxy config is up to date`);
    }
  } catch (err) {
    configSpinner.fail(`${fail('Error')} Could not upgrade config: ${(err as Error).message}`);
  }

  // Fix 4: Fix shared symlinks (settings.json broken by Claude CLI toggle thinking, etc.)
  const symlinkSpinner = ora('Checking shared settings.json symlink').start();
  const sharedSettings = path.join(getCcsDir(), 'shared', 'settings.json');
  try {
    if (fs.existsSync(sharedSettings)) {
      const stats = fs.lstatSync(sharedSettings);
      if (!stats.isSymbolicLink()) {
        symlinkSpinner.text = 'Restoring shared settings.json symlink...';
        const SharedManagerModule = await import('../shared-manager');
        const SharedManager = SharedManagerModule.default;
        const sharedManager = new SharedManager();
        sharedManager.ensureSharedDirectories();
        symlinkSpinner.succeed(`${ok('Fixed')} Restored shared settings.json symlink`);
        fixed++;
      } else {
        symlinkSpinner.succeed(`${ok('OK')} Shared settings.json symlink is valid`);
      }
    } else {
      symlinkSpinner.succeed(`${ok('OK')} Shared settings.json not yet created`);
    }
  } catch (err) {
    symlinkSpinner.fail(`${fail('Error')} Could not fix symlink: ${(err as Error).message}`);
  }

  // Fix 5: Image analysis config validation
  const imageSpinner = ora('Checking image analysis config').start();
  try {
    const imageFixed = await fixImageAnalysisConfig();
    if (imageFixed) {
      imageSpinner.succeed(`${ok('Fixed')} Repaired image analysis configuration`);
      fixed++;
    } else {
      imageSpinner.succeed(`${ok('OK')} Image analysis config is valid`);
    }
  } catch (err) {
    imageSpinner.fail(`${fail('Error')} Could not fix image config: ${(err as Error).message}`);
  }

  // Summary
  console.log('');
  if (fixed > 0) {
    console.log(ok(`Auto-fix complete: ${fixed} issue(s) resolved`));
    console.log('');
    console.log(info('Try your command again. If issues persist, run:'));
    console.log(`  ${color('ccs doctor', 'command')}  - for full diagnostics`);
  } else {
    console.log(ok('No issues found that needed fixing'));
    console.log('');
    console.log(info('If you still have issues:'));
    console.log(`  1. Run ${color('ccs doctor', 'command')} for diagnostics`);
    console.log(
      `  2. Try ${color('ccs <provider> --auth --verbose', 'command')} for detailed logs`
    );
    console.log(`  3. Restart your terminal/computer`);
  }
  console.log('');
}
