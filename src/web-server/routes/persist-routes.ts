/**
 * Persist Routes - Backup management for ~/.claude/settings.json
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import * as fs from 'fs';
import * as path from 'path';
import { getClaudeSettingsPath } from '../../utils/claude-config-path';
import { createLogger } from '../../services/logging';

const router = Router();
const logger = createLogger('web-server:routes:persist');

/** Rate limiter for restore endpoint - prevents abuse */
const restoreRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 restore attempts per minute
  message: { error: 'Too many restore attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

interface BackupFile {
  path: string;
  timestamp: string;
  date: Date;
}

/**
 * Async mutex for restore operations - prevents race conditions
 *
 * Design: Fast-fail lock.
 * If a restore is already running, callers immediately get `false`
 * and the route returns HTTP 409. This avoids request pileup.
 */
class RestoreMutex {
  private locked = false;

  /**
   * Attempt to acquire the mutex
   * @returns true if acquired, false if already locked
   */
  async acquire(): Promise<boolean> {
    if (this.locked) {
      return false;
    }
    this.locked = true;
    return true;
  }

  /** Release the mutex */
  release(): void {
    this.locked = false;
  }
}

const restoreMutex = new RestoreMutex();

/** Check if path is a symlink (security check) */
function isSymlink(filePath: string): boolean {
  try {
    const stats = fs.lstatSync(filePath);
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
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
function getBackupFiles(): BackupFile[] {
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
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  return files;
}

/**
 * GET /api/persist/backups - List available backups
 */
router.get('/backups', (_req: Request, res: Response): void => {
  try {
    const backups = getBackupFiles();
    res.json({
      backups: backups.map((b, i) => ({
        timestamp: b.timestamp,
        date: b.date.toISOString(),
        isLatest: i === 0,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/persist/restore - Restore from a backup
 * Body: { timestamp?: string } - If not provided, restores latest
 * Rate limited: 5 requests per minute
 */
router.post('/restore', restoreRateLimiter, async (req: Request, res: Response): Promise<void> => {
  // Atomic mutex acquisition - prevents race conditions
  const acquired = await restoreMutex.acquire();
  if (!acquired) {
    res.status(409).json({ error: 'Restore already in progress' });
    return;
  }

  try {
    const { timestamp } = req.body;
    const backups = getBackupFiles();

    if (backups.length === 0) {
      res.status(404).json({ error: 'No backups found' });
      return;
    }

    // Find backup
    let backup: BackupFile;
    if (!timestamp) {
      backup = backups[0]; // Latest
    } else {
      const found = backups.find((b) => b.timestamp === timestamp);
      if (!found) {
        res.status(404).json({ error: `Backup not found: ${timestamp}` });
        return;
      }
      backup = found;
    }

    // Security: reject symlinks to prevent path traversal attacks
    if (isSymlink(backup.path)) {
      res.status(400).json({ error: 'Backup file is a symlink - refusing for security' });
      return;
    }

    const settingsPath = getClaudeSettingsPath();
    if (isSymlink(settingsPath)) {
      res.status(400).json({ error: 'settings.json is a symlink - refusing for security' });
      return;
    }

    // Read backup content securely using file descriptor to prevent TOCTOU
    // Open with O_NOFOLLOW equivalent check then read atomically
    let backupContent: string;
    let fd: number | undefined;
    try {
      if (typeof fs.constants.O_NOFOLLOW !== 'number') {
        res.status(500).json({ error: 'Secure restore unsupported on this platform' });
        return;
      }
      // Open file descriptor for atomic read
      const openFlags = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW;
      fd = fs.openSync(backup.path, openFlags);
      const stats = fs.fstatSync(fd);
      if (!stats.isFile()) {
        res.status(400).json({ error: 'Backup path is not a regular file' });
        return;
      }
      const buffer = Buffer.alloc(stats.size);
      fs.readSync(fd, buffer, 0, stats.size, 0);
      backupContent = buffer.toString('utf8');

      const parsed = JSON.parse(backupContent);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        res.status(400).json({ error: 'Backup file is corrupted' });
        return;
      }
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ELOOP') {
        res.status(400).json({ error: 'Backup file is a symlink - refusing for security' });
        return;
      }
      if (error.code === 'ENOENT') {
        res.status(404).json({ error: 'Backup was deleted during restore' });
        return;
      }
      res.status(400).json({ error: 'Backup file is corrupted or invalid JSON' });
      return;
    } finally {
      if (fd !== undefined) {
        try {
          fs.closeSync(fd);
        } catch {
          // Ignore close errors
        }
      }
    }

    // Atomic restore with rollback capability
    const settingsDir = path.dirname(settingsPath);
    const restoreNonce = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const tempPath = path.join(settingsDir, `settings.json.restore-${restoreNonce}.tmp`);
    const rollbackPath = path.join(settingsDir, `settings.json.rollback-${restoreNonce}.tmp`);

    try {
      // Step 1: Backup current settings for rollback
      if (fs.existsSync(settingsPath)) {
        fs.copyFileSync(settingsPath, rollbackPath, fs.constants.COPYFILE_EXCL);
      }

      // Step 2: Write validated content to temp file
      fs.writeFileSync(tempPath, backupContent, { encoding: 'utf8', flag: 'wx', mode: 0o600 });

      // Step 3: Atomic rename (replaces existing file)
      fs.renameSync(tempPath, settingsPath);

      // Step 4: Cleanup rollback backup on success
      if (fs.existsSync(rollbackPath)) {
        fs.unlinkSync(rollbackPath);
      }

      res.json({
        success: true,
        timestamp: backup.timestamp,
        date: backup.date.toISOString(),
      });
    } catch (error) {
      // Rollback on failure
      try {
        if (fs.existsSync(rollbackPath)) {
          fs.renameSync(rollbackPath, settingsPath);
        }
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (rollbackErr) {
        const e = rollbackErr as Error;
        logger.error(
          'persist.restore_rollback_failed',
          'Restore failed and rollback unsuccessful - manual recovery may be needed',
          {
            timestamp: backup.timestamp,
            settingsPath,
            err: { name: e.name, message: e.message },
          }
        );
        res.status(500).json({
          error: 'Restore failed and rollback unsuccessful - manual recovery may be needed',
        });
        return;
      }
      throw error;
    }
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  } finally {
    restoreMutex.release();
  }
});

export default router;
