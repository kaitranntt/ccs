/**
 * System Health Checks
 *
 * Checks for Claude CLI, CCS directory, and permissions.
 */

import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getClaudeCliInfo } from '../../utils/claude-detector';
import type { HealthCheck } from './types';

const execFileAsync = promisify(execFile);

/**
 * Check Claude CLI installation and version
 */
export async function checkClaudeCli(): Promise<HealthCheck> {
  const cliInfo = getClaudeCliInfo();

  if (!cliInfo) {
    return {
      id: 'claude-cli',
      name: 'Claude CLI',
      status: 'error',
      message: 'Not found in PATH',
      fix: 'Install: npm install -g @anthropic-ai/claude-code',
    };
  }

  try {
    const { stdout } = await execFileAsync(cliInfo.path, ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
      ...(cliInfo.needsShell ? { shell: true } : {}),
    });
    const version = stdout.trim();

    const versionMatch = version.match(/(\d+\.\d+\.\d+)/);
    const versionStr = versionMatch ? versionMatch[1] : 'unknown';

    return {
      id: 'claude-cli',
      name: 'Claude CLI',
      status: 'ok',
      message: `v${versionStr}`,
      details: cliInfo.path,
    };
  } catch {
    return {
      id: 'claude-cli',
      name: 'Claude CLI',
      status: 'error',
      message: 'Not working',
      details: cliInfo.path,
      fix: 'Reinstall Claude CLI',
    };
  }
}

/**
 * Check CCS directory existence
 */
export function checkCcsDirectory(ccsDir: string): HealthCheck {
  if (fs.existsSync(ccsDir)) {
    return {
      id: 'ccs-dir',
      name: 'CCS Directory',
      status: 'ok',
      message: 'Exists',
      details: '~/.ccs/',
    };
  }

  return {
    id: 'ccs-dir',
    name: 'CCS Directory',
    status: 'error',
    message: 'Not found',
    details: ccsDir,
    fix: 'Run: npm install -g @kaitranntt/ccs --force',
    fixable: true,
  };
}

/**
 * Check permissions on CCS directory
 */
export function checkPermissions(ccsDir: string): HealthCheck {
  const testFile = `${ccsDir}/.permission-test`;

  try {
    fs.writeFileSync(testFile, 'test', 'utf8');
    fs.unlinkSync(testFile);
    return {
      id: 'permissions',
      name: 'Permissions',
      status: 'ok',
      message: 'Write access verified',
    };
  } catch {
    return {
      id: 'permissions',
      name: 'Permissions',
      status: 'error',
      message: 'Cannot write to ~/.ccs/',
      fix: 'sudo chown -R $USER ~/.ccs ~/.claude && chmod 755 ~/.ccs ~/.claude',
    };
  }
}
