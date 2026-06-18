/**
 * SharedManager - per-project memory directory synchronization.
 *
 * Extracted from project-context-sync.ts to keep each sync concern under
 * the 400 LOC target. Owns the layout migration from per-instance
 * projects/<project>/memory/ into the canonical shared memory root at
 * ~/.ccs/shared/memory/<project>/.
 */

import * as fs from 'fs';
import * as path from 'path';

import { ok } from '../../utils/ui';
import { ensureDirectory, getLstat, moveDirectory, pathExists } from './fs-helpers';
import {
  ensureProjectMemoryLink,
  isSymlinkTarget,
  mergeDirectoryWithConflictCopies,
  type SymlinkHelperDeps,
} from './symlink-helpers';
import type { ContextSyncRoots } from './project-context-sync';

/**
 * Ensure all project memory directories for an instance are shared.
 *
 * Source layout (isolated):
 *   ~/.ccs/instances/<profile>/projects/<project>/memory/
 *
 * Shared layout (canonical):
 *   ~/.ccs/shared/memory/<project>/
 */
export async function syncProjectMemories(
  roots: ContextSyncRoots,
  instancePath: string,
  deps: SymlinkHelperDeps
): Promise<void> {
  const projectsDir = path.join(instancePath, 'projects');
  if (!(await pathExists(projectsDir))) {
    return;
  }

  await ensureDirectory(roots.sharedDir);

  const sharedMemoryRoot = path.join(roots.sharedDir, 'memory');
  await ensureDirectory(sharedMemoryRoot);

  let projectEntries: fs.Dirent[] = [];
  try {
    projectEntries = await fs.promises.readdir(projectsDir, { withFileTypes: true });
  } catch (_err) {
    return;
  }

  const projects = projectEntries.filter((entry) => entry.isDirectory());
  if (projects.length === 0) {
    return;
  }

  let migrated = 0;
  let merged = 0;
  let linked = 0;
  const instanceName = path.basename(instancePath);

  for (const project of projects) {
    const projectDir = path.join(projectsDir, project.name);
    const projectMemoryPath = path.join(projectDir, 'memory');
    const sharedProjectMemoryPath = path.join(sharedMemoryRoot, project.name);

    const projectMemoryStats = await getLstat(projectMemoryPath);
    if (!projectMemoryStats) {
      if (await ensureProjectMemoryLink(projectMemoryPath, sharedProjectMemoryPath, deps)) {
        linked++;
      }
      continue;
    }

    if (projectMemoryStats.isSymbolicLink()) {
      if (await isSymlinkTarget(projectMemoryPath, sharedProjectMemoryPath)) {
        continue;
      }

      await fs.promises.unlink(projectMemoryPath);
      if (await ensureProjectMemoryLink(projectMemoryPath, sharedProjectMemoryPath, deps)) {
        linked++;
      }
      continue;
    }

    if (!projectMemoryStats.isDirectory()) {
      continue;
    }

    if (!(await pathExists(sharedProjectMemoryPath))) {
      await moveDirectory(projectMemoryPath, sharedProjectMemoryPath);
      migrated++;
    } else {
      merged += await mergeDirectoryWithConflictCopies(
        projectMemoryPath,
        sharedProjectMemoryPath,
        instanceName
      );
      await fs.promises.rm(projectMemoryPath, { recursive: true, force: true });
    }

    if (await ensureProjectMemoryLink(projectMemoryPath, sharedProjectMemoryPath, deps)) {
      linked++;
    }
  }

  if (migrated > 0 || merged > 0 || linked > 0) {
    console.log(
      ok(
        `Synced shared project memory: ${migrated} migrated, ${merged} merged conflict(s), ${linked} linked`
      )
    );
  }
}
