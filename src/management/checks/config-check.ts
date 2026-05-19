/**
 * Configuration Health Checks - Config files and Claude settings
 */

import * as fs from 'fs';
import * as path from 'path';
import { ok, fail, warn, info } from '../../utils/ui';
import { HealthCheck, IHealthChecker, createSpinner } from './types';

import { getClaudeConfigDir } from '../../utils/claude-config-path';
import { getCcsDir } from '../../config/config-loader-facade';

const ora = createSpinner();

/**
 * Check CCS config files exist and are valid
 * - Prefers config.yaml (v2) over config.json (legacy)
 * - Settings files are optional (only checked if profile exists)
 */
export class ConfigFilesChecker implements IHealthChecker {
  name = 'Config Files';
  private readonly ccsDir: string;

  constructor() {
    this.ccsDir = getCcsDir();
  }

  run(results: HealthCheck): void {
    const { DelegationValidator } = require('../../utils/delegation-validator');

    // Check main config file (yaml preferred, json fallback)
    this.checkMainConfig(results);

    // Check optional settings files (only if profile exists in config)
    this.checkOptionalSettingsFiles(results, DelegationValidator);
  }

  /**
   * Check main configuration file (config.yaml preferred, config.json fallback)
   */
  private checkMainConfig(results: HealthCheck): void {
    const configYamlPath = path.join(this.ccsDir, 'config.yaml');
    const configJsonPath = path.join(this.ccsDir, 'config.json');

    const yamlExists = fs.existsSync(configYamlPath);
    const jsonExists = fs.existsSync(configJsonPath);

    // Check config.yaml first (preferred format)
    if (yamlExists) {
      const spinner = ora('Checking config.yaml').start();
      try {
        const yaml = require('js-yaml');
        const content = fs.readFileSync(configYamlPath, 'utf8');
        yaml.load(content);
        spinner.succeed();
        console.log(`  ${ok('config.yaml'.padEnd(22))}  Valid`);
        results.addCheck('config.yaml', 'success', undefined, undefined, {
          status: 'OK',
          info: 'Valid',
        });

        // Inform if legacy config.json also exists (purely informational, not a check)
        if (jsonExists) {
          console.log(`  ${info('config.json'.padEnd(22))}  Legacy (ignored)`);
        }
        return;
      } catch (e) {
        spinner.fail();
        console.log(`  ${fail('config.yaml'.padEnd(22))}  Invalid YAML`);
        results.addCheck(
          'config.yaml',
          'error',
          `Invalid YAML: ${(e as Error).message}`,
          `Backup and recreate: mv ${configYamlPath} ${configYamlPath}.backup && npm install -g @kaitranntt/ccs --force`,
          { status: 'ERROR', info: 'Invalid YAML' }
        );
        return;
      }
    }

    // Fallback to config.json (legacy format)
    if (jsonExists) {
      const spinner = ora('Checking config.json').start();
      try {
        const content = fs.readFileSync(configJsonPath, 'utf8');
        JSON.parse(content);
        spinner.succeed();
        console.log(`  ${ok('config.json'.padEnd(22))}  Valid (legacy)`);
        results.addCheck('config.json', 'success', undefined, undefined, {
          status: 'OK',
          info: 'Valid (legacy)',
        });
      } catch (e) {
        spinner.fail();
        console.log(`  ${fail('config.json'.padEnd(22))}  Invalid JSON`);
        results.addCheck(
          'config.json',
          'error',
          `Invalid JSON: ${(e as Error).message}`,
          `Backup and recreate: mv ${configJsonPath} ${configJsonPath}.backup && npm install -g @kaitranntt/ccs --force`,
          { status: 'ERROR', info: 'Invalid JSON' }
        );
      }
      return;
    }

    // Neither exists - error
    const spinner = ora('Checking config').start();
    spinner.fail();
    console.log(`  ${fail('config.yaml'.padEnd(22))}  Not found`);
    results.addCheck(
      'config.yaml',
      'error',
      'No configuration file found (config.yaml or config.json)',
      'Run: npm install -g @kaitranntt/ccs --force',
      { status: 'ERROR', info: 'Not found' }
    );
  }

  /**
   * Check optional settings files (only if corresponding profile is configured)
   * These files are NOT required - they're only created when user configures a profile
   */
  private checkOptionalSettingsFiles(
    results: HealthCheck,
    DelegationValidator: { validate: (profile: string) => { valid: boolean; error?: string } }
  ): void {
    // Settings files to check (only if profile exists)
    const settingsFiles = [
      { name: 'glm.settings.json', profile: 'glm', displayName: 'GLM Settings' },
      { name: 'kimi.settings.json', profile: 'kimi', displayName: 'Kimi Settings' },
    ];

    for (const file of settingsFiles) {
      const filePath = path.join(this.ccsDir, file.name);
      const exists = fs.existsSync(filePath);

      if (!exists) {
        // Not an error - these are optional files
        // Only show info if user might expect them
        continue;
      }

      // File exists - validate it
      const spinner = ora(`Checking ${file.name}`).start();
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        JSON.parse(content);

        // Check if API key is properly configured
        const validation = DelegationValidator.validate(file.profile);

        let fileInfo = 'Valid JSON';
        let status: 'OK' | 'WARN' = 'OK';

        if (validation.valid) {
          fileInfo = 'Key configured';
          status = 'OK';
        } else if (validation.error && validation.error.includes('placeholder')) {
          fileInfo = 'Placeholder key';
          status = 'WARN';
        }

        if (status === 'WARN') {
          spinner.warn();
          console.log(`  ${warn(file.name.padEnd(22))}  ${fileInfo}`);
        } else {
          spinner.succeed();
          console.log(`  ${ok(file.name.padEnd(22))}  ${fileInfo}`);
        }

        results.addCheck(file.name, status === 'OK' ? 'success' : 'warning', undefined, undefined, {
          status: status,
          info: fileInfo,
        });
      } catch (e) {
        spinner.fail();
        console.log(`  ${fail(file.name.padEnd(22))}  Invalid JSON`);
        results.addCheck(
          file.name,
          'error',
          `Invalid JSON: ${(e as Error).message}`,
          `Backup and recreate: mv ${filePath} ${filePath}.backup`,
          { status: 'ERROR', info: 'Invalid JSON' }
        );
      }
    }
  }
}

/**
 * Check Claude settings.json
 */
export class ClaudeSettingsChecker implements IHealthChecker {
  name = 'Claude Settings';
  private readonly claudeDir: string;

  constructor() {
    this.claudeDir = getClaudeConfigDir();
  }

  run(results: HealthCheck): void {
    const spinner = ora('Checking ~/.claude/settings.json').start();
    const settingsPath = path.join(this.claudeDir, 'settings.json');
    const settingsName = '~/.claude/settings.json';

    if (!fs.existsSync(settingsPath)) {
      spinner.warn();
      console.log(`  ${warn(settingsName.padEnd(22))}  Not found`);
      results.addCheck(
        'Claude Settings',
        'warning',
        '~/.claude/settings.json not found',
        'Run: claude /login'
      );
      return;
    }

    // Validate JSON
    try {
      const content = fs.readFileSync(settingsPath, 'utf8');
      const settings = JSON.parse(content) as {
        env?: Record<string, unknown>;
      };
      const baseUrl =
        settings.env && typeof settings.env.ANTHROPIC_BASE_URL === 'string'
          ? settings.env.ANTHROPIC_BASE_URL
          : '';
      if (baseUrl.includes('/api/provider/codex')) {
        spinner.warn();
        console.log(`  ${warn(settingsName.padEnd(22))}  Codex CLIProxy bridge persisted`);
        results.addCheck(
          'Claude Settings',
          'warning',
          'Claude settings route Claude Code through the Codex CLIProxy translator',
          'Run: ccs persist default --yes; use ccsxp or ccs codex --target codex for Codex'
        );
        return;
      }
      spinner.succeed();
      console.log(`  ${ok(settingsName.padEnd(22))}  Valid`);
      results.addCheck('Claude Settings', 'success');
    } catch (e) {
      spinner.warn();
      console.log(`  ${warn(settingsName.padEnd(22))}  Invalid JSON`);
      results.addCheck(
        'Claude Settings',
        'warning',
        `Invalid JSON: ${(e as Error).message}`,
        'Run: claude /login'
      );
    }
  }
}

/**
 * Run all config checks
 */
export function runConfigChecks(results: HealthCheck): void {
  const configChecker = new ConfigFilesChecker();
  const claudeChecker = new ClaudeSettingsChecker();

  configChecker.run(results);
  claudeChecker.run(results);
}
