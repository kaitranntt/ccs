/**
 * SharedManager - one-shot upgrade migrations.
 *
 * Extracted from the original monolithic shared-manager.ts. These run once
 * on upgrade to reconcile older on-disk layouts into the current symlink
 * based architecture.
 */

import * as fs from 'fs';
import * as path from 'path';

import { info, ok, warn } from '../../utils/ui';
import { listAccountInstanceNames } from '../instance-directory';
import {
  ensureSharedDirectories,
  linkSharedDirectories,
  type LinkerRoots,
} from './shared-dir-linker';
import { SHARED_ITEMS } from './types';

/**
 * Migrate from v3.1.1 (copied data in ~/.ccs/shared/) to v3.2.0 (symlinks
 * to ~/.claude/). Runs once on upgrade; exits early when the shared
 * commands directory is already a symlink.
 */
export function migrateFromV311(roots: LinkerRoots): void {
  const sharedDir = roots.sharedDir;
  const claudeDir = roots.claudeDir;

  const commandsPath = path.join(sharedDir, 'commands');
  if (fs.existsSync(commandsPath)) {
    try {
      if (fs.lstatSync(commandsPath).isSymbolicLink()) {
        return;
      }
    } catch (_err) {
      // Continue with migration
    }
  }

  console.log(info('Migrating from v3.1.1 to v3.2.0...'));

  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true, mode: 0o700 });
  }

  for (const item of SHARED_ITEMS) {
    const sharedPath = path.join(sharedDir, item.name);
    const claudePath = path.join(claudeDir, item.name);

    if (!fs.existsSync(sharedPath)) continue;

    try {
      const stats = fs.lstatSync(sharedPath);

      if (item.type === 'directory' && stats.isDirectory()) {
        if (!fs.existsSync(claudePath)) {
          fs.mkdirSync(claudePath, { recursive: true, mode: 0o700 });
        }

        const entries = fs.readdirSync(sharedPath, { withFileTypes: true });
        let copied = 0;

        for (const entry of entries) {
          const src = path.join(sharedPath, entry.name);
          const dest = path.join(claudePath, entry.name);

          if (fs.existsSync(dest)) continue;

          if (entry.isDirectory()) {
            fs.cpSync(src, dest, { recursive: true });
          } else {
            fs.copyFileSync(src, dest);
          }
          copied++;
        }

        if (copied > 0) {
          console.log(ok(`Migrated ${copied} ${item.name} to ~/.claude/${item.name}`));
        }
      } else if (item.type === 'file' && stats.isFile()) {
        if (!fs.existsSync(claudePath)) {
          fs.copyFileSync(sharedPath, claudePath);
          console.log(ok(`Migrated ${item.name} to ~/.claude/${item.name}`));
        }
      }
    } catch (_err) {
      console.log(warn(`Failed to migrate ${item.name}: ${(_err as Error).message}`));
    }
  }

  ensureSharedDirectories(roots);

  if (fs.existsSync(roots.instancesDir)) {
    try {
      for (const instance of listAccountInstanceNames(roots.instancesDir)) {
        const instancePath = path.join(roots.instancesDir, instance);
        try {
          linkSharedDirectories(roots, instancePath);
        } catch (_err) {
          console.log(warn(`Failed to update instance ${instance}: ${(_err as Error).message}`));
        }
      }
    } catch (_err) {
      // No instances to update
    }
  }

  console.log(ok('Migration to v3.2.0 complete'));
}

/**
 * Migrate existing instances from isolated to shared settings.json (v4.4+).
 * Backs up each instance's pre-existing settings.json before replacing it
 * with a symlink to the shared settings.json.
 */
export function migrateToSharedSettings(roots: LinkerRoots): void {
  const claudeDir = roots.claudeDir;
  const sharedDir = roots.sharedDir;
  const instancesDir = roots.instancesDir;

  console.log(info('Migrating instances to shared settings.json...'));

  const claudeSettings = path.join(claudeDir, 'settings.json');
  if (!fs.existsSync(claudeSettings)) {
    fs.writeFileSync(claudeSettings, JSON.stringify({}, null, 2), 'utf8');
    console.log(info('Created ~/.claude/settings.json'));
  }

  ensureSharedDirectories(roots);

  if (!fs.existsSync(instancesDir)) {
    console.log(info('No instances to migrate'));
    return;
  }

  const instances = listAccountInstanceNames(instancesDir);

  let migrated = 0;
  let skipped = 0;

  for (const instance of instances) {
    const instancePath = path.join(instancesDir, instance);
    const instanceSettings = path.join(instancePath, 'settings.json');

    try {
      if (fs.existsSync(instanceSettings)) {
        const stats = fs.lstatSync(instanceSettings);
        if (stats.isSymbolicLink()) {
          skipped++;
          continue;
        }

        const backup = instanceSettings + '.pre-shared-migration';
        if (!fs.existsSync(backup)) {
          fs.copyFileSync(instanceSettings, backup);
          console.log(info(`Backed up ${instance}/settings.json`));
        }

        fs.unlinkSync(instanceSettings);
      }

      const sharedSettings = path.join(sharedDir, 'settings.json');

      try {
        fs.symlinkSync(sharedSettings, instanceSettings, 'file');
        migrated++;
      } catch (_err) {
        if (process.platform === 'win32') {
          fs.copyFileSync(sharedSettings, instanceSettings);
          console.log(warn(`Symlink failed for ${instance}, copied instead`));
          migrated++;
        } else {
          throw _err;
        }
      }
    } catch (_err) {
      console.log(warn(`Failed to migrate ${instance}: ${(_err as Error).message}`));
    }
  }

  console.log(ok(`Migrated ${migrated} instance(s), skipped ${skipped}`));
}
