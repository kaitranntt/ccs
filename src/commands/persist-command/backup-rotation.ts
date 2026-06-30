/**
 * Persist Command - Backup Rotation & Restore
 *
 * Handles settings.json backup file lifecycle: creation, timestamp-based
 * rotation, listing, and restore-with-rollback. Owns the --list-backups and
 * --restore subcommands.
 */

import * as fs from 'fs';
import * as path from 'path';
import { initUI, header, color, dim, ok, fail, warn, info } from '../../utils/ui';
import { InteractivePrompt } from '../../utils/prompt';
import { getClaudeSettingsPath } from '../../utils/claude-config-path';
import { ConfigError } from '../../errors';
import {
  formatDisplayPath,
  getClaudeSettingsDisplayPath,
  getNoFollowFlag,
  isSymlinkAsync,
  parseSettingsObject,
  pathExists,
  readFileUtf8NoFollow,
  withPersistSettingsLock,
  writeClaudeSettings,
} from './secure-file';

/** Maximum number of backups to keep (oldest are deleted) */
export const MAX_BACKUPS = 10;

export interface BackupFile {
  path: string;
  timestamp: string;
  date: Date;
}

function parseBackupTimestamp(timestamp: string): Date | null {
  const year = parseInt(timestamp.slice(0, 4), 10);
  const month = parseInt(timestamp.slice(4, 6), 10);
  const day = parseInt(timestamp.slice(6, 8), 10);
  const hour = parseInt(timestamp.slice(9, 11), 10);
  const minute = parseInt(timestamp.slice(11, 13), 10);
  const second = parseInt(timestamp.slice(13, 15), 10);
  const date = new Date(year, month - 1, day, hour, minute, second);

  if (date.getFullYear() !== year) return null;
  if (date.getMonth() !== month - 1) return null;
  if (date.getDate() !== day) return null;
  if (date.getHours() !== hour) return null;
  if (date.getMinutes() !== minute) return null;
  if (date.getSeconds() !== second) return null;

  return date;
}

/** Get all backup files sorted by date (newest first) */
export function getBackupFiles(): BackupFile[] {
  const settingsPath = getClaudeSettingsPath();
  const dir = path.dirname(settingsPath);
  if (!fs.existsSync(dir)) {
    return [];
  }
  const backupPattern = /^settings\.json\.backup\.(\d{8}_\d{6})$/;
  const files = fs
    .readdirSync(dir)
    .filter((f) => backupPattern.test(f))
    .map((f) => {
      const match = f.match(backupPattern);
      if (!match) return null;
      const timestamp = match[1];
      const date = parseBackupTimestamp(timestamp);
      if (!date) return null;
      return {
        path: path.join(dir, f),
        timestamp,
        date,
      };
    })
    .filter((f): f is BackupFile => f !== null)
    .sort((a, b) => b.date.getTime() - a.date.getTime()); // newest first
  return files;
}

/** Create backup of settings.json with proper permissions and rotation */
export async function createBackup(): Promise<string> {
  const settingsPath = getClaudeSettingsPath();
  if (!(await pathExists(settingsPath))) {
    throw new Error('No settings.json to backup');
  }

  // Guard: refuse to read a symlinked settings.json (TOCTOU mitigation on backup read).
  if (await isSymlinkAsync(settingsPath)) {
    throw new ConfigError(
      'settings.json is a symlink - refusing to read for backup for security',
      settingsPath
    );
  }

  const settingsContent = await readFileUtf8NoFollow(settingsPath);

  const now = new Date();
  const timestamp =
    now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0') +
    '_' +
    now.getHours().toString().padStart(2, '0') +
    now.getMinutes().toString().padStart(2, '0') +
    now.getSeconds().toString().padStart(2, '0');
  const backupPath = `${settingsPath}.backup.${timestamp}`;

  const flags =
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | getNoFollowFlag();

  let handle: fs.promises.FileHandle | undefined;
  try {
    handle = await fs.promises.open(backupPath, flags, 0o600);
    await handle.writeFile(settingsContent, { encoding: 'utf8' });
    await handle.sync();
  } finally {
    if (handle) {
      await handle.close();
    }
  }

  try {
    await fs.promises.chmod(backupPath, 0o600);
  } catch {
    // Best-effort permission hardening.
  }

  // Cleanup: Rotate old backups (keep only MAX_BACKUPS)
  cleanupOldBackups();
  return backupPath;
}

/** Remove old backups keeping only MAX_BACKUPS most recent */
function cleanupOldBackups(): void {
  const backups = getBackupFiles();
  if (backups.length > MAX_BACKUPS) {
    const toDelete = backups.slice(MAX_BACKUPS);
    for (const backup of toDelete) {
      try {
        fs.unlinkSync(backup.path);
      } catch (error) {
        console.log(
          warn(
            `Failed to delete old backup ${formatDisplayPath(backup.path)}: ${(error as Error).message}`
          )
        );
      }
    }
  }
}

/** Handle --list-backups flag */
export async function handleListBackups(): Promise<void> {
  await initUI();
  const backups = getBackupFiles();
  if (backups.length === 0) {
    console.log(info('No backups found'));
    return;
  }
  console.log(header('Available Backups'));
  console.log('');
  backups.forEach((b, i) => {
    const dateStr = b.date.toLocaleString();
    const marker = i === 0 ? color(' (latest)', 'success') : '';
    console.log(`  ${color(b.timestamp, 'command')}  ${dim(dateStr)}${marker}`);
  });
  console.log('');
  console.log(dim('To restore: ccs persist --restore [timestamp]'));
}

/** Handle --restore [timestamp] flag */
export async function handleRestore(timestamp: string | boolean, yes: boolean): Promise<void> {
  await initUI();
  const backups = getBackupFiles();
  if (backups.length === 0) {
    console.log(fail('No backups found'));
    process.exit(1);
  }
  // Find backup to restore
  let backup: BackupFile;
  if (timestamp === true) {
    // Use latest
    backup = backups[0];
  } else {
    const found = backups.find((b) => b.timestamp === timestamp);
    if (!found) {
      console.log(fail(`Backup not found: ${timestamp}`));
      console.log('');
      console.log('Available backups:');
      backups.slice(0, 5).forEach((b) => console.log(`  ${b.timestamp}`));
      process.exit(1);
    }
    backup = found;
  }
  console.log(header('Restore Backup'));
  console.log('');
  console.log(`Backup: ${color(backup.timestamp, 'command')}`);
  console.log(`Date:   ${backup.date.toLocaleString()}`);
  console.log('');
  console.log(warn(`This will replace ${getClaudeSettingsDisplayPath()}`));
  console.log('');
  if (!yes) {
    const proceed = await InteractivePrompt.confirm('Proceed with restore?', { default: false });
    if (!proceed) {
      console.log(info('Cancelled'));
      process.exit(0);
    }
  }

  let parsedBackupSettings: Record<string, unknown>;
  try {
    const backupContent = await readFileUtf8NoFollow(backup.path);
    parsedBackupSettings = parseSettingsObject(backupContent, 'Backup file');
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      console.log(fail('Backup was deleted during restore'));
      process.exit(1);
    }
    if (nodeError.code === 'ELOOP') {
      console.log(fail('Backup file is a symlink - refusing to restore for security'));
      process.exit(1);
    }
    console.log(fail(`Backup file is corrupted: ${(error as Error).message}`));
    process.exit(1);
  }

  try {
    await withPersistSettingsLock(async () => {
      const settingsPath = getClaudeSettingsPath();
      if (await isSymlinkAsync(settingsPath)) {
        throw new Error('settings.json is a symlink - refusing to restore for security');
      }

      let rollbackBackupPath: string | null = null;
      if (await pathExists(settingsPath)) {
        rollbackBackupPath = await createBackup();
      }

      try {
        await writeClaudeSettings(parsedBackupSettings);
      } catch (error) {
        const writeError = error as Error;
        if (rollbackBackupPath) {
          try {
            const rollbackContent = await readFileUtf8NoFollow(rollbackBackupPath);
            const rollbackSettings = parseSettingsObject(rollbackContent, 'Rollback backup');
            await writeClaudeSettings(rollbackSettings);
          } catch (rollbackError) {
            throw new Error(
              `Restore failed: ${writeError.message}. Rollback also failed: ${(rollbackError as Error).message}. Manual recovery backup: ${formatDisplayPath(rollbackBackupPath)}`
            );
          }
        }
        throw new Error(`Restore failed: ${writeError.message}`);
      }
    });
  } catch (error) {
    console.log(fail((error as Error).message));
    process.exit(1);
  }

  console.log(ok(`Restored from backup: ${backup.timestamp}`));
}
