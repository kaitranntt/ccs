/**
 * Profile Health Checks
 *
 * Check profiles, instances, and delegation.
 * Supports both legacy (config.json) and unified (config.yaml) modes.
 */

import * as fs from 'fs';
import * as path from 'path';

import type { HealthCheck } from './types';
import { isUnifiedMode, loadUnifiedConfig } from '../../config/config-loader-facade';
import { listAccountInstanceNames } from '../../management/instance-directory';

/**
 * Check profiles configuration (API profiles from config.json or config.yaml)
 */
export function checkProfiles(ccsDir: string): HealthCheck {
  // Check unified config first
  if (isUnifiedMode()) {
    const config = loadUnifiedConfig();
    if (!config) {
      return {
        id: 'profiles',
        name: 'Profiles',
        status: 'info',
        message: 'config.yaml not loaded',
      };
    }

    const profileCount = Object.keys(config.profiles || {}).length;
    const profileNames = Object.keys(config.profiles || {}).join(', ');

    if (profileCount === 0) {
      return {
        id: 'profiles',
        name: 'Profiles',
        status: 'ok',
        message: 'No API profiles (unified mode)',
      };
    }

    return {
      id: 'profiles',
      name: 'Profiles',
      status: 'ok',
      message: `${profileCount} configured (unified)`,
      details: profileNames.length > 40 ? profileNames.substring(0, 37) + '...' : profileNames,
    };
  }

  // Legacy mode: check config.json
  const configPath = path.join(ccsDir, 'config.json');

  if (!fs.existsSync(configPath)) {
    return {
      id: 'profiles',
      name: 'Profiles',
      status: 'info',
      message: 'config.json not found',
    };
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    if (!config.profiles || typeof config.profiles !== 'object') {
      return {
        id: 'profiles',
        name: 'Profiles',
        status: 'error',
        message: 'Missing profiles object',
        fix: 'Run: npm install -g @kaitranntt/ccs --force',
      };
    }

    const profileCount = Object.keys(config.profiles).length;
    const profileNames = Object.keys(config.profiles).join(', ');

    return {
      id: 'profiles',
      name: 'Profiles',
      status: 'ok',
      message: `${profileCount} configured`,
      details: profileNames.length > 40 ? profileNames.substring(0, 37) + '...' : profileNames,
    };
  } catch (e) {
    return {
      id: 'profiles',
      name: 'Profiles',
      status: 'error',
      message: (e as Error).message,
    };
  }
}

/**
 * Check instances (account profiles)
 */
export function checkInstances(ccsDir: string): HealthCheck {
  const instancesDir = path.join(ccsDir, 'instances');

  if (!fs.existsSync(instancesDir)) {
    return {
      id: 'instances',
      name: 'Instances',
      status: 'ok',
      message: 'No account profiles',
    };
  }

  const instances = listAccountInstanceNames(instancesDir);

  if (instances.length === 0) {
    return {
      id: 'instances',
      name: 'Instances',
      status: 'ok',
      message: 'No account profiles',
    };
  }

  return {
    id: 'instances',
    name: 'Instances',
    status: 'ok',
    message: `${instances.length} account profile${instances.length !== 1 ? 's' : ''}`,
  };
}

/**
 * Check delegation setup
 */
export function checkDelegation(ccsDir: string): HealthCheck {
  const ccsClaudeCommandsDir = path.join(ccsDir, '.claude', 'commands');
  const hasCcsCommand = fs.existsSync(path.join(ccsClaudeCommandsDir, 'ccs.md'));
  const hasContinueCommand = fs.existsSync(path.join(ccsClaudeCommandsDir, 'ccs', 'continue.md'));

  if (!hasCcsCommand || !hasContinueCommand) {
    return {
      id: 'delegation',
      name: 'Delegation',
      status: 'warning',
      message: 'Not installed',
      fix: 'Run: npm install -g @kaitranntt/ccs --force',
    };
  }

  const { DelegationValidator } = require('../../utils/delegation-validator');
  const readyProfiles: string[] = [];

  for (const profile of ['glm', 'kimi']) {
    const validation = DelegationValidator.validate(profile);
    if (validation.valid) {
      readyProfiles.push(profile);
    }
  }

  if (readyProfiles.length === 0) {
    return {
      id: 'delegation',
      name: 'Delegation',
      status: 'warning',
      message: 'No profiles ready',
      fix: 'Configure profiles with valid API keys',
    };
  }

  return {
    id: 'delegation',
    name: 'Delegation',
    status: 'ok',
    message: `${readyProfiles.length} profiles ready`,
    details: readyProfiles.join(', '),
  };
}
