/**
 * Profile and Delegation Health Checks
 */

import * as fs from 'fs';
import * as path from 'path';
import { ok, fail, warn, info } from '../../utils/ui';
import { HealthCheck, IHealthChecker, createSpinner } from './types';
import { getCcsDir } from '../../config/config-loader-facade';
import { listAccountInstanceNames } from '../instance-directory';

const ora = createSpinner();

/**
 * Check profile configurations in config.yaml (preferred) or config.json (legacy)
 */
export class ProfilesChecker implements IHealthChecker {
  name = 'Profiles';
  private readonly ccsDir: string;

  constructor() {
    this.ccsDir = getCcsDir();
  }

  run(results: HealthCheck): void {
    const spinner = ora('Checking profiles').start();
    const configYamlPath = path.join(this.ccsDir, 'config.yaml');
    const configJsonPath = path.join(this.ccsDir, 'config.json');

    const yamlExists = fs.existsSync(configYamlPath);
    const jsonExists = fs.existsSync(configJsonPath);

    // Check config.yaml first (preferred format)
    if (yamlExists) {
      try {
        const yaml = require('js-yaml');
        const content = fs.readFileSync(configYamlPath, 'utf8');
        const config = yaml.load(content) as Record<string, unknown>;
        this.validateProfiles(config, 'config.yaml', spinner, results);
        return;
      } catch (e) {
        spinner.fail();
        console.log(
          `  ${fail('Profiles'.padEnd(22))}  Invalid config.yaml: ${(e as Error).message}`
        );
        results.addCheck(
          'Profiles',
          'error',
          `Invalid config.yaml: ${(e as Error).message}`,
          undefined,
          {
            status: 'ERROR',
            info: (e as Error).message,
          }
        );
        return;
      }
    }

    // Fallback to config.json (legacy format)
    if (jsonExists) {
      try {
        const config = JSON.parse(fs.readFileSync(configJsonPath, 'utf8'));
        this.validateProfiles(config, 'config.json', spinner, results);
        return;
      } catch (e) {
        spinner.fail();
        console.log(
          `  ${fail('Profiles'.padEnd(22))}  Invalid config.json: ${(e as Error).message}`
        );
        results.addCheck(
          'Profiles',
          'error',
          `Invalid config.json: ${(e as Error).message}`,
          undefined,
          {
            status: 'ERROR',
            info: (e as Error).message,
          }
        );
        return;
      }
    }

    // Neither exists
    spinner.info();
    console.log(
      `  ${info('Profiles'.padEnd(22))}  No config file found (config.yaml or config.json)`
    );
  }

  /**
   * Validate profiles object from parsed config
   */
  private validateProfiles(
    config: Record<string, unknown>,
    configFileName: string,
    spinner: ReturnType<ReturnType<typeof ora>['start']>,
    results: HealthCheck
  ): void {
    if (!config.profiles || typeof config.profiles !== 'object') {
      spinner.fail();
      console.log(`  ${fail('Profiles'.padEnd(22))}  Missing profiles object in ${configFileName}`);
      results.addCheck(
        'Profiles',
        'error',
        `${configFileName} missing profiles object`,
        'Run: npm install -g @kaitranntt/ccs --force',
        { status: 'ERROR', info: 'Missing profiles object' }
      );
      return;
    }

    const profileCount = Object.keys(config.profiles as object).length;
    const profileNames = Object.keys(config.profiles as object).join(', ');

    spinner.succeed();
    console.log(`  ${ok('Profiles'.padEnd(22))}  ${profileCount} configured (${profileNames})`);
    results.addCheck('Profiles', 'success', `${profileCount} profiles configured`, undefined, {
      status: 'OK',
      info: `${profileCount} configured (${profileNames.length > 30 ? profileNames.substring(0, 27) + '...' : profileNames})`,
    });
  }
}

/**
 * Check instance directories (account-based profiles)
 */
export class InstancesChecker implements IHealthChecker {
  name = 'Instances';
  private readonly ccsDir: string;

  constructor() {
    this.ccsDir = getCcsDir();
  }

  run(results: HealthCheck): void {
    const spinner = ora('Checking instances').start();
    const instancesDir = path.join(this.ccsDir, 'instances');

    if (!fs.existsSync(instancesDir)) {
      spinner.info();
      console.log(`  ${info('Instances'.padEnd(22))}  No account profiles`);
      results.addCheck('Instances', 'success', 'No account profiles configured');
      return;
    }

    const instances = listAccountInstanceNames(instancesDir);

    if (instances.length === 0) {
      spinner.info();
      console.log(`  ${info('Instances'.padEnd(22))}  No account profiles`);
      results.addCheck('Instances', 'success', 'No account profiles');
      return;
    }

    spinner.succeed();
    console.log(`  ${ok('Instances'.padEnd(22))}  ${instances.length} account profiles`);
    results.addCheck('Instances', 'success', `${instances.length} account profiles`);
  }
}

/**
 * Check delegation system (commands and ready profiles)
 */
export class DelegationChecker implements IHealthChecker {
  name = 'Delegation';
  private readonly ccsDir: string;

  constructor() {
    this.ccsDir = getCcsDir();
  }

  run(results: HealthCheck): void {
    const spinner = ora('Checking delegation').start();

    // Check if delegation commands exist in ~/.ccs/.claude/commands/
    const ccsClaudeCommandsDir = path.join(this.ccsDir, '.claude', 'commands');
    const hasCcsCommand = fs.existsSync(path.join(ccsClaudeCommandsDir, 'ccs.md'));
    const hasContinueCommand = fs.existsSync(path.join(ccsClaudeCommandsDir, 'ccs', 'continue.md'));

    if (!hasCcsCommand || !hasContinueCommand) {
      spinner.warn();
      console.log(`  ${warn('Delegation'.padEnd(22))}  Not installed`);
      results.addCheck(
        'Delegation',
        'warning',
        'Delegation commands not found',
        'Install with: npm install -g @kaitranntt/ccs --force',
        { status: 'WARN', info: 'Not installed' }
      );
      return;
    }

    // Check profile validity using DelegationValidator (dynamic discovery)
    const { DelegationValidator } = require('../../utils/delegation-validator');
    const readyProfiles = DelegationValidator.getReadyProfiles();

    if (readyProfiles.length === 0) {
      spinner.warn();
      console.log(`  ${warn('Delegation'.padEnd(22))}  No profiles ready`);
      results.addCheck(
        'Delegation',
        'warning',
        'Delegation installed but no profiles configured',
        'Configure profiles with valid API keys (not placeholders)',
        { status: 'WARN', info: 'No profiles ready' }
      );
      return;
    }

    spinner.succeed();
    console.log(
      `  ${ok('Delegation'.padEnd(22))}  ${readyProfiles.length} profiles ready (${readyProfiles.join(', ')})`
    );
    results.addCheck(
      'Delegation',
      'success',
      `${readyProfiles.length} profile(s) ready: ${readyProfiles.join(', ')}`,
      undefined,
      { status: 'OK', info: `${readyProfiles.length} profiles ready` }
    );
  }
}

/**
 * Run all profile checks
 */
export function runProfileChecks(results: HealthCheck): void {
  const profilesChecker = new ProfilesChecker();
  const instancesChecker = new InstancesChecker();
  const delegationChecker = new DelegationChecker();

  profilesChecker.run(results);
  instancesChecker.run(results);
  delegationChecker.run(results);
}
