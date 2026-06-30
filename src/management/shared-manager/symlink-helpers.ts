/**
 * SharedManager - async symlink and merge helpers.
 *
 * Extracted from the original monolithic shared-manager.ts. These functions
 * handle the cross-platform symlink + recursive merge primitives that the
 * project-context-sync and project-memory flows build on.
 *
 * Logging is dependency-injected via the SymlinkHelperDeps interface so this
 * module stays free of imports from the UI layer. The orchestrator class is
 * responsible for supplying `warn` from `../utils/ui`.
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  copyDirectoryFallback,
  ensureDirectory,
  fileContentsEqual,
  getConflictCopyPath,
  pathExists,
  resolveCanonicalPath,
  isPathWithinDirectory,
} from './fs-helpers';

/**
 * Dependencies that the orchestrator (SharedManager) must supply to the
 * symlink helpers. Injected rather than imported so this module has no
 * coupling to the UI layer.
 */
export interface SymlinkHelperDeps {
  warn: (message: string) => string;
}

/**
 * Check whether a symlink points at an expected target. Returns false on any
 * IO error or when the link is not a symlink.
 */
export async function isSymlinkTarget(linkPath: string, expectedTarget: string): Promise<boolean> {
  try {
    const stats = await fs.promises.lstat(linkPath);
    if (!stats.isSymbolicLink()) {
      return false;
    }

    const currentTarget = await fs.promises.readlink(linkPath);
    const resolvedCurrentTarget = path.resolve(path.dirname(linkPath), currentTarget);
    const resolvedExpectedTarget = path.resolve(expectedTarget);
    return resolvedCurrentTarget === resolvedExpectedTarget;
  } catch (_err) {
    return false;
  }
}

/**
 * Resolve a symlink to its absolute target path. Returns null on failure.
 */
export async function resolveSymlinkTargetPath(linkPath: string): Promise<string | null> {
  try {
    const currentTarget = await fs.promises.readlink(linkPath);
    return path.resolve(path.dirname(linkPath), currentTarget);
  } catch (_err) {
    return null;
  }
}

/**
 * Create a symlink from linkPath to targetPath, falling back to a recursive
 * copy on Windows when symlink creation fails.
 */
export async function linkDirectoryWithFallback(
  targetPath: string,
  linkPath: string,
  deps: SymlinkHelperDeps
): Promise<void> {
  const symlinkType: 'dir' | 'junction' = process.platform === 'win32' ? 'junction' : 'dir';
  const linkTarget = process.platform === 'win32' ? path.resolve(targetPath) : targetPath;

  try {
    await fs.promises.symlink(linkTarget, linkPath, symlinkType);
  } catch (_err) {
    if (process.platform === 'win32') {
      copyDirectoryFallback(targetPath, linkPath);

      console.log(
        deps.warn(`Symlink failed for context projects, copied instead (enable Developer Mode)`)
      );
      return;
    }

    throw _err;
  }
}

/**
 * Ensure a symlink from linkPath to targetPath exists, creating the target
 * directory first if needed. Returns true when a new link/copy was created
 * or an existing incorrect link was replaced.
 */
export async function ensureProjectMemoryLink(
  linkPath: string,
  targetPath: string,
  deps: SymlinkHelperDeps
): Promise<boolean> {
  await ensureDirectory(targetPath);

  let linkStats: fs.Stats | null = null;
  try {
    linkStats = await fs.promises.lstat(linkPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }

  if (linkStats) {
    if (linkStats.isSymbolicLink() && (await isSymlinkTarget(linkPath, targetPath))) {
      return false;
    }

    if (linkStats.isDirectory()) {
      await fs.promises.rm(linkPath, { recursive: true, force: true });
    } else {
      await fs.promises.unlink(linkPath);
    }
  }

  const symlinkType: 'dir' | 'junction' = process.platform === 'win32' ? 'junction' : 'dir';
  const linkTarget = process.platform === 'win32' ? path.resolve(targetPath) : targetPath;

  try {
    await fs.promises.symlink(linkTarget, linkPath, symlinkType);
    return true;
  } catch (_err) {
    if (process.platform === 'win32') {
      copyDirectoryFallback(targetPath, linkPath);

      console.log(
        deps.warn(`Symlink failed for project memory, copied instead (enable Developer Mode)`)
      );
      return true;
    }
    throw _err;
  }
}

/**
 * Merge sourceDir into targetDir recursively. On file conflicts the target
 * is preserved and the source file is copied as
 * "<name>.migrated-from-<instance>[-N]" to avoid data loss. Returns the
 * number of conflict copies produced.
 */
export async function mergeDirectoryWithConflictCopies(
  sourceDir: string,
  targetDir: string,
  instanceName: string
): Promise<number> {
  await ensureDirectory(targetDir);

  let conflicts = 0;
  const entries = await fs.promises.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      conflicts += await mergeDirectoryWithConflictCopies(sourcePath, targetPath, instanceName);
      continue;
    }

    if (entry.isFile()) {
      if (!(await pathExists(targetPath))) {
        await fs.promises.copyFile(sourcePath, targetPath);
        continue;
      }

      if (await fileContentsEqual(sourcePath, targetPath)) {
        continue;
      }

      const conflictPath = await getConflictCopyPath(targetPath, instanceName);
      await fs.promises.copyFile(sourcePath, conflictPath);
      conflicts++;
    }
  }

  return conflicts;
}

/**
 * Migrate legacy per-project memory symlinks that point into the shared
 * memory root back to instance-local directories, preserving data via
 * conflict-copy merge.
 */
export async function detachLegacySharedMemoryLinks(
  projectsPath: string,
  instanceName: string,
  sharedDir: string
): Promise<void> {
  const sharedMemoryRoot = resolveCanonicalPath(path.join(sharedDir, 'memory'));

  let projectEntries: fs.Dirent[] = [];
  try {
    projectEntries = await fs.promises.readdir(projectsPath, { withFileTypes: true });
  } catch (_err) {
    return;
  }

  for (const entry of projectEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const projectPath = path.join(projectsPath, entry.name);
    const memoryPath = path.join(projectPath, 'memory');
    let memoryStats: fs.Stats | null = null;
    try {
      memoryStats = await fs.promises.lstat(memoryPath);
    } catch (_err) {
      memoryStats = null;
    }

    if (!memoryStats?.isSymbolicLink()) {
      continue;
    }

    const memoryTarget = await resolveSymlinkTargetPath(memoryPath);
    if (!memoryTarget) {
      continue;
    }

    const canonicalMemoryTarget = resolveCanonicalPath(memoryTarget);
    if (!isPathWithinDirectory(canonicalMemoryTarget, sharedMemoryRoot)) {
      continue;
    }

    await fs.promises.unlink(memoryPath);
    await ensureDirectory(memoryPath);

    if (await pathExists(canonicalMemoryTarget)) {
      await mergeDirectoryWithConflictCopies(canonicalMemoryTarget, memoryPath, instanceName);
    }
  }
}

/**
 * Guard project merge operations to known CCS-managed roots only.
 */
export function isSafeProjectsMergeSource(
  sourcePath: string,
  instanceName: string,
  sharedDir: string,
  instancesDir: string
): boolean {
  const resolvedSource = resolveCanonicalPath(sourcePath);
  const sharedContextRoot = resolveCanonicalPath(path.join(sharedDir, 'context-groups'));
  const instanceProjectsRoot = resolveCanonicalPath(
    path.join(instancesDir, instanceName, 'projects')
  );

  return (
    isPathWithinDirectory(resolvedSource, sharedContextRoot) ||
    isPathWithinDirectory(resolvedSource, instanceProjectsRoot)
  );
}

/**
 * Guard advanced continuity merge operations to known CCS-managed roots only.
 */
export function isSafeContinuityMergeSource(
  sourcePath: string,
  instanceName: string,
  artifactName: string,
  sharedDir: string,
  instancesDir: string
): boolean {
  const resolvedSource = resolveCanonicalPath(sourcePath);
  const sharedContextRoot = resolveCanonicalPath(path.join(sharedDir, 'context-groups'));
  const instanceArtifactRoot = resolveCanonicalPath(
    path.join(instancesDir, instanceName, artifactName)
  );

  const normalizedSource =
    process.platform === 'win32' ? resolvedSource.toLowerCase() : resolvedSource;
  const continuitySegment =
    process.platform === 'win32'
      ? `${path.sep}continuity${path.sep}`.toLowerCase()
      : `${path.sep}continuity${path.sep}`;

  const withinSharedContinuity =
    isPathWithinDirectory(resolvedSource, sharedContextRoot) &&
    normalizedSource.includes(continuitySegment);

  return withinSharedContinuity || isPathWithinDirectory(resolvedSource, instanceArtifactRoot);
}
