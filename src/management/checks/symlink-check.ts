/**
 * Symlink and Permission Health Checks
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ok, fail, warn } from '../../utils/ui';
import { HealthCheck, IHealthChecker, createSpinner } from './types';
import { getCcsDir } from '../../config/config-loader-facade';
import { listAccountInstanceNames } from '../instance-directory';

const ora = createSpinner();

// Get paths at runtime to respect CCS_HOME for test isolation
function getHomedir(): string {
  return os.homedir();
}

function getCcsDirPath(): string {
  return getCcsDir();
}

function getClaudeDir(): string {
  return path.join(getHomedir(), '.claude');
}

/**
 * Check file permissions on ~/.ccs/
 */
export class PermissionsChecker implements IHealthChecker {
  name = 'Permissions';

  run(results: HealthCheck): void {
    const spinner = ora('Checking permissions').start();
    const testFile = path.join(getCcsDirPath(), '.permission-test');

    try {
      fs.writeFileSync(testFile, 'test', 'utf8');
      fs.unlinkSync(testFile);
      spinner.succeed();
      console.log(`  ${ok('Permissions'.padEnd(22))}  Write access verified`);
      results.addCheck('Permissions', 'success', undefined, undefined, {
        status: 'OK',
        info: 'Write access verified',
      });
    } catch (_e) {
      spinner.fail();
      console.log(`  ${fail('Permissions'.padEnd(22))}  Cannot write to ~/.ccs/`);
      results.addCheck(
        'Permissions',
        'error',
        'Cannot write to ~/.ccs/',
        'Fix: sudo chown -R $USER ~/.ccs ~/.claude && chmod 755 ~/.ccs ~/.claude',
        { status: 'ERROR', info: 'Cannot write to ~/.ccs/' }
      );
    }
  }
}

/**
 * Check CCS symlinks to ~/.claude/
 */
export class CcsSymlinksChecker implements IHealthChecker {
  name = 'CCS Symlinks';

  run(results: HealthCheck): void {
    const spinner = ora('Checking CCS symlinks').start();

    try {
      const { ClaudeSymlinkManager } = require('../../utils/claude-symlink-manager');
      const manager = new ClaudeSymlinkManager();
      const health = manager.checkHealth();

      if (health.healthy) {
        const cnt = manager.ccsItems.length;
        spinner.succeed();
        console.log(`  ${ok('CCS Symlinks'.padEnd(22))}  ${cnt}/${cnt} items linked`);
        results.addCheck('CCS Symlinks', 'success', 'All CCS items properly symlinked', undefined, {
          status: 'OK',
          info: `${cnt}/${cnt} items synced`,
        });
      } else {
        spinner.warn();
        console.log(`  ${warn('CCS Symlinks'.padEnd(22))}  ${health.issues.length} issues found`);
        results.addCheck('CCS Symlinks', 'warning', health.issues.join(', '), 'Run: ccs sync', {
          status: 'WARN',
          info: `${health.issues.length} issues`,
        });
      }
    } catch (e) {
      spinner.warn();
      console.log(`  ${warn('CCS Symlinks'.padEnd(22))}  Could not check`);
      results.addCheck(
        'CCS Symlinks',
        'warning',
        'Could not check CCS symlinks: ' + (e as Error).message,
        'Run: ccs sync',
        { status: 'WARN', info: 'Could not check' }
      );
    }
  }
}

/** Helper: Check if symlink points to expected target */
function isValidSymlink(symlinkPath: string, expectedTarget: string): boolean {
  if (!fs.existsSync(symlinkPath)) return false;
  try {
    const stats = fs.lstatSync(symlinkPath);
    if (!stats.isSymbolicLink()) return false;
    const target = fs.readlinkSync(symlinkPath);
    const resolved = path.resolve(path.dirname(symlinkPath), target);
    return resolved === expectedTarget;
  } catch {
    return false;
  }
}

/**
 * Check settings.json symlinks for instances
 */
export class SettingsSymlinksChecker implements IHealthChecker {
  name = 'Settings Symlinks';

  run(results: HealthCheck): void {
    const spinner = ora('Checking settings.json symlinks').start();
    const label = 'settings.json';
    const ccsDir = getCcsDirPath();
    const claudeDir = getClaudeDir();
    const sharedSettings = path.join(ccsDir, 'shared', 'settings.json');
    const claudeSettings = path.join(claudeDir, 'settings.json');

    try {
      // Check shared settings symlink
      if (!fs.existsSync(sharedSettings)) {
        spinner.warn();
        console.log(`  ${warn(label.padEnd(22))}  Not found (shared)`);
        results.addCheck(
          'Settings Symlinks',
          'warning',
          'Shared settings.json not found',
          'Run: ccs sync'
        );
        return;
      }

      const sharedStats = fs.lstatSync(sharedSettings);
      if (!sharedStats.isSymbolicLink()) {
        spinner.warn();
        console.log(`  ${warn(label.padEnd(22))}  Not a symlink (shared)`);
        results.addCheck(
          'Settings Symlinks',
          'warning',
          'Shared settings.json is not a symlink',
          'Run: ccs sync'
        );
        return;
      }

      if (!isValidSymlink(sharedSettings, claudeSettings)) {
        spinner.warn();
        console.log(`  ${warn(label.padEnd(22))}  Wrong target (shared)`);
        results.addCheck(
          'Settings Symlinks',
          'warning',
          'Shared symlink points to wrong target',
          'Run: ccs sync'
        );
        return;
      }

      // Check instances
      const instancesDir = path.join(ccsDir, 'instances');
      if (!fs.existsSync(instancesDir)) {
        spinner.succeed();
        console.log(`  ${ok(label.padEnd(22))}  Shared symlink valid`);
        results.addCheck('Settings Symlinks', 'success', 'Shared symlink valid', undefined, {
          status: 'OK',
          info: 'Shared symlink valid',
        });
        return;
      }

      const instances = listAccountInstanceNames(instancesDir);

      const broken = instances.filter((inst) => {
        const instSettings = path.join(instancesDir, inst, 'settings.json');
        return !isValidSymlink(instSettings, sharedSettings);
      }).length;

      if (broken > 0) {
        spinner.warn();
        console.log(`  ${warn(label.padEnd(22))}  ${broken} broken instance(s)`);
        results.addCheck(
          'Settings Symlinks',
          'warning',
          `${broken} instance(s) have broken symlinks`,
          'Run: ccs sync',
          { status: 'WARN', info: `${broken} broken instance(s)` }
        );
      } else {
        spinner.succeed();
        console.log(`  ${ok(label.padEnd(22))}  ${instances.length} instance(s) valid`);
        results.addCheck('Settings Symlinks', 'success', 'All instance symlinks valid', undefined, {
          status: 'OK',
          info: `${instances.length} instance(s) valid`,
        });
      }
    } catch (err) {
      spinner.warn();
      console.log(`  ${warn(label.padEnd(22))}  Check failed`);
      results.addCheck(
        'Settings Symlinks',
        'warning',
        `Failed to check: ${(err as Error).message}`,
        'Run: ccs sync',
        { status: 'WARN', info: 'Check failed' }
      );
    }
  }
}

/**
 * Run all symlink checks
 */
export function runSymlinkChecks(results: HealthCheck): void {
  new PermissionsChecker().run(results);
  new CcsSymlinksChecker().run(results);
  new SettingsSymlinksChecker().run(results);
}
