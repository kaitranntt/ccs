/**
 * SharedManager - low-level filesystem helpers.
 *
 * Extracted from the original monolithic shared-manager.ts. All functions
 * here are pure with respect to SharedManager instance state: they take
 * explicit paths and return values, never reading from `this`.
 *
 * Keeping these isolated lets the orchestrator class focus on coordination
 * and makes each helper independently testable.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { SharedItem } from './types';

/**
 * Return canonical realpath for a path. Falls back to the lexical resolve
 * when realpath fails (e.g. path does not exist).
 */
export function resolveCanonicalPath(targetPath: string): string {
  try {
    return fs.realpathSync.native(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
}

/**
 * Case-insensitive on Windows, case-sensitive elsewhere. Returns true when
 * candidatePath === rootPath or candidatePath is a descendant of rootPath.
 */
export function isPathWithinDirectory(candidatePath: string, rootPath: string): boolean {
  const normalizeForCompare = (inputPath: string): string => {
    const resolved = path.resolve(inputPath);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };

  const normalizedCandidate = normalizeForCompare(candidatePath);
  const normalizedRoot = normalizeForCompare(rootPath);
  const relative = path.relative(normalizedRoot, normalizedCandidate);

  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Resolve a symlink to its absolute target and compare against an expected
 * target. Synchronous variant used during detach/remove flows.
 */
export function symlinkPointsTo(linkPath: string, expectedTarget: string): boolean {
  try {
    const currentTarget = fs.readlinkSync(linkPath);
    const resolvedCurrentTarget = path.resolve(path.dirname(linkPath), currentTarget);
    return resolveCanonicalPath(resolvedCurrentTarget) === resolveCanonicalPath(expectedTarget);
  } catch {
    return false;
  }
}

/**
 * Remove an existing path, using the type hint to disambiguate between
 * a file and a directory when lstat fails to give a clear signal.
 */
export function removeExistingPath(targetPath: string, typeHint: SharedItem['type']): void {
  try {
    const stats = fs.lstatSync(targetPath);
    if (stats.isDirectory() && !stats.isSymbolicLink()) {
      fs.rmSync(targetPath, { recursive: true, force: true });
      return;
    }

    if (stats.isSymbolicLink() || typeHint === 'file') {
      fs.unlinkSync(targetPath);
      return;
    }

    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }

    if (typeHint === 'directory') {
      fs.rmSync(targetPath, { recursive: true, force: true });
    } else {
      fs.rmSync(targetPath, { force: true });
    }
  }
}

/**
 * Recursively copy a directory tree as a fallback when symlinks are not
 * available (notably Windows without Developer Mode). Creates the source
 * directory as an empty dir if it does not exist.
 */
export function copyDirectoryFallback(src: string, dest: string): void {
  if (!fs.existsSync(src)) {
    fs.mkdirSync(src, { recursive: true, mode: 0o700 });
    return;
  }

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true, mode: 0o700 });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryFallback(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Move a directory, falling back to recursive copy+remove across devices.
 */
export async function moveDirectory(src: string, dest: string): Promise<void> {
  try {
    await fs.promises.rename(src, dest);
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code !== 'EXDEV') {
      throw err;
    }

    await fs.promises.cp(src, dest, { recursive: true });
    await fs.promises.rm(src, { recursive: true, force: true });
  }
}

/**
 * Promise-based access() existence check.
 */
export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath);
    return true;
  } catch (_err) {
    return false;
  }
}

/**
 * Ensure a directory exists with restrictive permissions.
 */
export async function ensureDirectory(targetPath: string): Promise<void> {
  await fs.promises.mkdir(targetPath, { recursive: true, mode: 0o700 });
}

/**
 * Promise-based lstat, returning null for ENOENT.
 */
export async function getLstat(targetPath: string): Promise<fs.Stats | null> {
  try {
    return await fs.promises.lstat(targetPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

/**
 * Sync lstat, returning null for ENOENT.
 */
export function getLstatSync(targetPath: string): fs.Stats | null {
  try {
    return fs.lstatSync(targetPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

/**
 * Compare two files byte-for-byte. Returns false on any IO error.
 */
export async function fileContentsEqual(fileA: string, fileB: string): Promise<boolean> {
  try {
    const [statA, statB] = await Promise.all([fs.promises.stat(fileA), fs.promises.stat(fileB)]);
    if (statA.size !== statB.size) {
      return false;
    }

    const [contentA, contentB] = await Promise.all([
      fs.promises.readFile(fileA),
      fs.promises.readFile(fileB),
    ]);
    return contentA.equals(contentB);
  } catch (_err) {
    return false;
  }
}

/**
 * Build a non-destructive conflict copy path of the form
 * "<target>.migrated-from-<instance>[-N]".
 */
export async function getConflictCopyPath(
  existingTargetPath: string,
  instanceName: string
): Promise<string> {
  const safeInstanceName = instanceName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  const baseSuffix = `.migrated-from-${safeInstanceName}`;

  let candidate = `${existingTargetPath}${baseSuffix}`;
  let sequence = 1;
  while (await pathExists(candidate)) {
    candidate = `${existingTargetPath}${baseSuffix}-${sequence}`;
    sequence++;
  }

  return candidate;
}
