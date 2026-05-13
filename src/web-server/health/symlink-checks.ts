/**
 * Symlink Health Checks
 *
 * Check CCS symlinks and settings symlinks.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { HealthCheck } from './types';
import { listAccountInstanceNames } from '../../management/instance-directory';

/**
 * Check CCS symlinks health
 */
export function checkCcsSymlinks(): HealthCheck {
  try {
    const { ClaudeSymlinkManager } = require('../../utils/claude-symlink-manager');
    const manager = new ClaudeSymlinkManager();
    const health = manager.checkHealth();

    if (health.healthy) {
      const itemCount = manager.ccsItems.length;
      return {
        id: 'ccs-symlinks',
        name: 'CCS Symlinks',
        status: 'ok',
        message: `${itemCount}/${itemCount} items linked`,
      };
    }

    return {
      id: 'ccs-symlinks',
      name: 'CCS Symlinks',
      status: 'warning',
      message: `${health.issues.length} issues found`,
      fix: 'Run: ccs sync',
    };
  } catch (e) {
    return {
      id: 'ccs-symlinks',
      name: 'CCS Symlinks',
      status: 'warning',
      message: 'Could not check',
      details: (e as Error).message,
      fix: 'Run: ccs sync',
    };
  }
}

/**
 * Check settings symlinks
 */
export function checkSettingsSymlinks(ccsDir: string, claudeDir: string): HealthCheck {
  try {
    const sharedDir = `${ccsDir}/shared`;
    const sharedSettings = `${sharedDir}/settings.json`;
    const claudeSettings = `${claudeDir}/settings.json`;

    if (!fs.existsSync(sharedSettings)) {
      return {
        id: 'settings-symlinks',
        name: 'settings.json',
        status: 'warning',
        message: 'Shared not found',
        fix: 'Run: ccs sync',
      };
    }

    const sharedStats = fs.lstatSync(sharedSettings);
    if (!sharedStats.isSymbolicLink()) {
      return {
        id: 'settings-symlinks',
        name: 'settings.json',
        status: 'warning',
        message: 'Not a symlink',
        fix: 'Run: ccs sync',
      };
    }

    const sharedTarget = fs.readlinkSync(sharedSettings);
    const resolvedShared = path.resolve(path.dirname(sharedSettings), sharedTarget);

    if (resolvedShared !== claudeSettings) {
      return {
        id: 'settings-symlinks',
        name: 'settings.json',
        status: 'warning',
        message: 'Wrong target',
        fix: 'Run: ccs sync',
      };
    }

    // Check instances
    const instancesDir = `${ccsDir}/instances`;
    if (!fs.existsSync(instancesDir)) {
      return {
        id: 'settings-symlinks',
        name: 'settings.json',
        status: 'ok',
        message: 'Shared symlink valid',
      };
    }

    const instances = listAccountInstanceNames(instancesDir);

    let broken = 0;
    for (const instance of instances) {
      const instanceSettings = `${instancesDir}/${instance}/settings.json`;
      if (!fs.existsSync(instanceSettings)) {
        broken++;
        continue;
      }
      try {
        const stats = fs.lstatSync(instanceSettings);
        if (!stats.isSymbolicLink()) {
          broken++;
          continue;
        }
        const target = fs.readlinkSync(instanceSettings);
        const resolved = path.resolve(path.dirname(instanceSettings), target);
        if (resolved !== sharedSettings) {
          broken++;
        }
      } catch {
        broken++;
      }
    }

    if (broken > 0) {
      return {
        id: 'settings-symlinks',
        name: 'settings.json',
        status: 'warning',
        message: `${broken} broken instance(s)`,
        fix: 'Run: ccs sync',
      };
    }

    return {
      id: 'settings-symlinks',
      name: 'settings.json',
      status: 'ok',
      message: `${instances.length} instance(s) valid`,
    };
  } catch (e) {
    return {
      id: 'settings-symlinks',
      name: 'settings.json',
      status: 'warning',
      message: 'Check failed',
      details: (e as Error).message,
      fix: 'Run: ccs sync',
    };
  }
}
