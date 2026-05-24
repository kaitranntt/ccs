import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../services/logging';
import { getSharedCodexConfigPath } from './codex-profile-paths';

const logger = createLogger('codex-auth:symlink');

export interface EnsureSharedConfigSymlinkOptions {
  overwriteRegularFile?: boolean;
}

/**
 * Ensure <profileDir>/config.toml points at the shared ~/.codex/config.toml.
 * Self-healing: recreates stale or missing symlinks. If symlink creation is
 * unavailable, copies the shared config so the profile still has settings.
 *
 * @param profileDir  - The per-profile directory (will be created if missing).
 * @param sharedConfigPath - Override for the shared target path (used in tests
 *   to avoid touching real ~/.codex/config.toml). Defaults to getSharedCodexConfigPath().
 */
export function ensureSharedConfigSymlink(
  profileDir: string,
  sharedConfigPath?: string,
  options: EnsureSharedConfigSymlinkOptions = {}
): void {
  const targetPath = sharedConfigPath ?? getSharedCodexConfigPath();
  const linkPath = path.join(profileDir, 'config.toml');

  // Ensure profile directory exists
  fs.mkdirSync(profileDir, { recursive: true, mode: 0o700 });

  // Ensure shared config target parent directory exists
  fs.mkdirSync(path.dirname(targetPath), { recursive: true, mode: 0o700 });

  // Create empty shared config if it doesn't exist — Codex will populate on first run
  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, '', { mode: 0o600 });
    logger.stage('dispatch', 'codex.shared-config.created', 'Created empty shared config.toml', {
      path: targetPath,
    });
  }

  // Inspect whatever currently exists at the link path
  let existingStat: fs.Stats | null = null;
  try {
    existingStat = fs.lstatSync(linkPath);
  } catch {
    // ENOENT — nothing there yet, proceed to create
  }

  if (existingStat !== null) {
    if (existingStat.isSymbolicLink()) {
      const currentTarget = fs.readlinkSync(linkPath);
      if (currentTarget === targetPath) {
        // Already correct — idempotent return
        logger.stage('dispatch', 'codex.symlink.ok', 'Shared config symlink already correct', {
          link: linkPath,
        });
        return;
      }
      // Stale symlink — remove and re-create
      fs.unlinkSync(linkPath);
      logger.stage('dispatch', 'codex.symlink.repaired', 'Replaced stale symlink', {
        link: linkPath,
        was: currentTarget,
        now: targetPath,
      });
    } else if (
      options.overwriteRegularFile ||
      isRegularConfigCopyUnmodified(linkPath, targetPath)
    ) {
      // Explicit repair or unchanged fallback copy — replace with a shared symlink when possible.
      process.stderr.write(
        `[!] codex-auth: overwriting regular file at ${linkPath} with symlink to shared config.toml\n`
      );
      fs.unlinkSync(linkPath);
    } else {
      process.stderr.write(
        `[!] codex-auth: preserving existing regular config.toml at ${linkPath}; ` +
          `use ccsx auth create <name> --force to refresh it.\n`
      );
      logger.warn('codex-auth.symlink-regular-file-preserved', 'Preserved regular config.toml', {
        link: linkPath,
        target: targetPath,
      });
      return;
    }
  }

  try {
    fs.symlinkSync(targetPath, linkPath);
    logger.stage('dispatch', 'codex.symlink.created', 'Created shared config symlink', {
      link: linkPath,
      target: targetPath,
    });
  } catch (err) {
    handleSymlinkFailure(targetPath, linkPath, err);
  }
}

function isRegularConfigCopyUnmodified(linkPath: string, targetPath: string): boolean {
  try {
    return fs.readFileSync(linkPath, 'utf8') === fs.readFileSync(targetPath, 'utf8');
  } catch {
    return false;
  }
}

function handleSymlinkFailure(targetPath: string, linkPath: string, err: unknown): void {
  const code = (err as NodeJS.ErrnoException | null)?.code;
  if (code !== 'EPERM' && code !== 'EACCES' && code !== 'ENOSYS') {
    throw err;
  }

  const tmpPath = path.join(
    path.dirname(linkPath),
    `.config.toml.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );

  try {
    fs.copyFileSync(targetPath, tmpPath, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(tmpPath, 0o600);
    fs.renameSync(tmpPath, linkPath);
  } catch (copyErr) {
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch {
      // best effort cleanup
    }
    throw copyErr;
  }

  process.stderr.write(
    `[!] codex-auth: symlink unavailable; copied shared config.toml to ${linkPath}. ` +
      `Config edits won't propagate automatically.\n`
  );
  logger.warn('codex-auth.symlink-copy-fallback', 'Copied shared config after symlink failure', {
    link: linkPath,
    target: targetPath,
    error: err instanceof Error ? err.message : String(err),
  });
}
