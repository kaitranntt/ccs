/**
 * SharedManager - layout and shared-settings migrations.
 *
 * Extracted from the original monolithic shared-manager.ts. Handles both
 * one-shot v3.1.1 -> v3.2.0 layout upgrades and idempotent per-install
 * shared settings.json migration.
 */

import * as fs from 'fs';
import * as path from 'path';

import { info, ok, warn } from '../../utils/ui';
import { listAccountInstanceNames } from '../instance-directory';
import { getLstatSync } from './fs-helpers';
import {
  ensureSharedDirectories,
  linkSharedDirectories,
  type LinkerRoots,
} from './shared-dir-linker';
import { SHARED_ITEMS } from './types';

const PRE_SHARED_MIGRATION_SUFFIX = '.pre-shared-migration';
const MAX_BACKUP_ATTEMPTS = 10_000;

function isAccessibleFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function findMatchingPreMigrationBackup(
  instancePath: string,
  settingsFileName: string,
  currentBytes: Buffer
): string | null {
  const baseBackupName = `${settingsFileName}${PRE_SHARED_MIGRATION_SUFFIX}`;
  const entries = fs.readdirSync(instancePath);

  for (const entry of entries) {
    if (entry !== baseBackupName && !entry.startsWith(`${baseBackupName}-`)) {
      continue;
    }
    const candidatePath = path.join(instancePath, entry);
    const candidateStats = getLstatSync(candidatePath);
    if (!candidateStats?.isFile() || candidateStats.size !== currentBytes.length) {
      continue;
    }
    try {
      if (fs.readFileSync(candidatePath).equals(currentBytes)) {
        return candidatePath;
      }
    } catch {
      // Ignore unreadable backup candidate and keep searching
    }
  }

  return null;
}

function writeNonOverwritingBackup(instanceSettings: string, mode: number): string {
  const baseBackupPath = `${instanceSettings}${PRE_SHARED_MIGRATION_SUFFIX}`;

  for (let suffix = 0; suffix < MAX_BACKUP_ATTEMPTS; suffix++) {
    const backupPath = suffix === 0 ? baseBackupPath : `${baseBackupPath}-${suffix}`;
    try {
      fs.copyFileSync(instanceSettings, backupPath, fs.constants.COPYFILE_EXCL);
      try {
        fs.chmodSync(backupPath, mode);
      } catch {
        // Best-effort mode preservation on platforms without POSIX chmod
      }
      return backupPath;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        continue;
      }
      throw err;
    }
  }

  throw Object.assign(new Error(`Exceeded backup retry limit for ${instanceSettings}`), {
    code: 'EEXIST',
  });
}

function backupRegularInstanceSettings(
  instance: string,
  instancePath: string,
  instanceSettings: string,
  sharedSettings: string,
  mode: number
): void {
  const currentBytes = fs.readFileSync(instanceSettings);
  const sharedBytes = fs.readFileSync(sharedSettings);
  if (currentBytes.equals(sharedBytes)) {
    return;
  }

  if (findMatchingPreMigrationBackup(instancePath, path.basename(instanceSettings), currentBytes)) {
    return;
  }

  const backupPath = writeNonOverwritingBackup(instanceSettings, mode);
  console.log(info(`Backed up ${instance}/settings.json to ${path.basename(backupPath)}`));
}

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
 * Runs idempotently on every install (via postinstall) to ensure each
 * instance's settings.json links to shared settings.json, preserving any
 * divergent regular-file contents in a non-overwriting `.pre-shared-migration`
 * backup before replacing the file.
 */
export function migrateToSharedSettings(roots: LinkerRoots): void {
  const claudeDir = roots.claudeDir;
  const sharedDir = roots.sharedDir;
  const instancesDir = roots.instancesDir;

  console.log(info('Migrating instances to shared settings.json...'));

  const claudeSettings = path.join(claudeDir, 'settings.json');
  if (!getLstatSync(claudeSettings)) {
    fs.writeFileSync(claudeSettings, JSON.stringify({}, null, 2), 'utf8');
    console.log(info('Created ~/.claude/settings.json'));
  }

  ensureSharedDirectories(roots);

  if (!fs.existsSync(instancesDir)) {
    console.log(info('No instances to migrate'));
    return;
  }

  const instances = listAccountInstanceNames(instancesDir);
  const sharedSettings = path.join(sharedDir, 'settings.json');

  let migrated = 0;
  let skipped = 0;

  for (const instance of instances) {
    const instancePath = path.join(instancesDir, instance);
    const instanceSettings = path.join(instancePath, 'settings.json');

    try {
      const stats = getLstatSync(instanceSettings);
      if (stats?.isSymbolicLink() && fs.existsSync(instanceSettings)) {
        skipped++;
        continue;
      }

      if (!isAccessibleFile(sharedSettings)) {
        console.log(warn(`Skipping ${instance}/settings.json: shared settings.json is missing`));
        skipped++;
        continue;
      }

      if (stats?.isSymbolicLink()) {
        fs.unlinkSync(instanceSettings);
      } else if (stats?.isFile()) {
        backupRegularInstanceSettings(
          instance,
          instancePath,
          instanceSettings,
          sharedSettings,
          stats.mode & 0o777
        );
        fs.unlinkSync(instanceSettings);
      } else if (stats) {
        console.log(warn(`Skipping ${instance}/settings.json: expected file or symlink`));
        skipped++;
        continue;
      }

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
