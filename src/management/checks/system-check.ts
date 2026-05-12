/**
 * System Health Checks - Claude CLI and CCS Directory
 */

import * as fs from 'fs';
import { spawn } from 'child_process';
import { getClaudeCliInfo } from '../../utils/claude-detector';
import {
  escapeShellArg,
  getWindowsEscapedCommandShell,
  stripClaudeCodeEnv,
} from '../../utils/shell-executor';
import { ok, fail } from '../../utils/ui';
import { HealthCheck, IHealthChecker, createSpinner } from './types';
import { getCcsDir } from '../../config/config-loader-facade';

const ora = createSpinner();

/**
 * Check Claude CLI availability and version
 */
export class ClaudeCliChecker implements IHealthChecker {
  name = 'Claude CLI';

  async run(results: HealthCheck): Promise<void> {
    const spinner = ora('Checking Claude CLI').start();

    const cliInfo = getClaudeCliInfo();

    if (!cliInfo) {
      spinner.fail();
      console.log(`  ${fail('Claude CLI'.padEnd(22))}  Not found in PATH`);
      results.addCheck(
        'Claude CLI',
        'error',
        'Claude CLI not found in PATH',
        'Install from: https://docs.claude.com/en/docs/claude-code/installation',
        { status: 'ERROR', info: 'Not installed' }
      );
      return;
    }

    const { path: claudeCli, needsShell } = cliInfo;

    // Try to execute claude --version
    try {
      const result = await new Promise<string>((resolve, reject) => {
        // When shell is needed (Windows .cmd/.bat files), concatenate into string
        // to avoid DEP0190 warning about passing args with shell: true
        const child = needsShell
          ? spawn([claudeCli, '--version'].map(escapeShellArg).join(' '), {
              stdio: 'pipe',
              timeout: 5000,
              shell: getWindowsEscapedCommandShell(),
              env: stripClaudeCodeEnv(process.env),
            })
          : spawn(claudeCli, ['--version'], {
              stdio: 'pipe',
              timeout: 5000,
              env: stripClaudeCodeEnv(process.env),
            });

        let output = '';
        child.stdout?.on('data', (data: Buffer) => (output += data));
        child.stderr?.on('data', (data: Buffer) => (output += data));

        child.on('close', (code: number | null) => {
          if (code === 0) resolve(output);
          else reject(new Error('Exit code ' + code));
        });

        child.on('error', reject);
      });

      // Extract version from output
      const versionMatch = result.match(/(\d+\.\d+\.\d+)/);
      const version = versionMatch ? versionMatch[1] : 'unknown';

      spinner.succeed();
      console.log(`  ${ok('Claude CLI'.padEnd(22))}  v${version} (${claudeCli})`);
      results.addCheck('Claude CLI', 'success', `Found: ${claudeCli}`, undefined, {
        status: 'OK',
        info: `v${version} (${claudeCli})`,
      });
    } catch (_err) {
      spinner.fail();
      console.log(`  ${fail('Claude CLI'.padEnd(22))}  Not found or not working`);
      results.addCheck(
        'Claude CLI',
        'error',
        'Claude CLI not found or not working',
        'Install from: https://docs.claude.com/en/docs/claude-code/installation',
        { status: 'ERROR', info: 'Not installed' }
      );
    }
  }
}

/**
 * Check ~/.ccs/ directory exists
 */
export class CcsDirectoryChecker implements IHealthChecker {
  name = 'CCS Directory';
  private readonly ccsDir: string;

  constructor() {
    this.ccsDir = getCcsDir();
  }

  run(results: HealthCheck): void {
    const spinner = ora('Checking ~/.ccs/ directory').start();

    if (fs.existsSync(this.ccsDir)) {
      spinner.succeed();
      console.log(`  ${ok('CCS Directory'.padEnd(22))}  ~/.ccs/`);
      results.addCheck('CCS Directory', 'success', undefined, undefined, {
        status: 'OK',
        info: '~/.ccs/',
      });
    } else {
      spinner.fail();
      console.log(`  ${fail('CCS Directory'.padEnd(22))}  Not found`);
      results.addCheck(
        'CCS Directory',
        'error',
        '~/.ccs/ directory not found',
        'Run: npm install -g @kaitranntt/ccs --force',
        { status: 'ERROR', info: 'Not found' }
      );
    }
  }
}

/**
 * Run all system checks
 */
export async function runSystemChecks(results: HealthCheck): Promise<void> {
  const cliChecker = new ClaudeCliChecker();
  const dirChecker = new CcsDirectoryChecker();

  await cliChecker.run(results);
  dirChecker.run(results);
}
