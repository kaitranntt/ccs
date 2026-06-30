/**
 * SharedManager - project context, memory, and continuity synchronization.
 *
 * Extracted from the original monolithic shared-manager.ts. Owns the
 * account-policy driven layout for per-instance projects/, memory/, and
 * advanced continuity artifacts (session-env, file-history, shell-snapshots,
 * todos).
 *
 * All filesystem roots are passed explicitly. The SharedManager orchestrator
 * is responsible for supplying its own private fields and the warn/ok/info
 * UI helpers.
 */

import * as fs from 'fs';
import * as path from 'path';

import { DEFAULT_ACCOUNT_CONTEXT_GROUP } from '../../auth/account-context';
import type { AccountContextPolicy } from '../../auth/account-context';
import { warn } from '../../utils/ui';
import { ensureDirectory, getLstat, pathExists } from './fs-helpers';
import {
  detachLegacySharedMemoryLinks,
  isSafeContinuityMergeSource,
  isSafeProjectsMergeSource,
  isSymlinkTarget,
  linkDirectoryWithFallback,
  mergeDirectoryWithConflictCopies,
  resolveSymlinkTargetPath,
  type SymlinkHelperDeps,
} from './symlink-helpers';
import { ADVANCED_CONTINUITY_ITEMS } from './types';

/**
 * Roots for the context sync module. Matches the linker/metadata shape.
 */
export interface ContextSyncRoots {
  sharedDir: string;
  instancesDir: string;
}

/**
 * Sync project workspace context based on account policy.
 *
 * - isolated (default): each profile keeps its own ./projects directory.
 * - shared: profile ./projects becomes symlink to shared context group root.
 */
export async function syncProjectContext(
  roots: ContextSyncRoots,
  instancePath: string,
  policy: AccountContextPolicy,
  deps: SymlinkHelperDeps
): Promise<void> {
  const projectsPath = path.join(instancePath, 'projects');
  const instanceName = path.basename(instancePath);
  const mode = policy.mode === 'shared' ? 'shared' : 'isolated';

  if (mode === 'shared') {
    const contextGroup = policy.group || DEFAULT_ACCOUNT_CONTEXT_GROUP;
    const sharedProjectsPath = path.join(
      roots.sharedDir,
      'context-groups',
      contextGroup,
      'projects'
    );

    await ensureDirectory(sharedProjectsPath);
    await ensureDirectory(path.dirname(projectsPath));

    const currentStats = await getLstat(projectsPath);
    if (!currentStats) {
      await linkDirectoryWithFallback(sharedProjectsPath, projectsPath, deps);
      return;
    }

    if (currentStats.isSymbolicLink()) {
      if (await isSymlinkTarget(projectsPath, sharedProjectsPath)) {
        return;
      }

      const currentTarget = await resolveSymlinkTargetPath(projectsPath);
      if (
        currentTarget &&
        path.resolve(currentTarget) !== path.resolve(sharedProjectsPath) &&
        isSafeProjectsMergeSource(
          currentTarget,
          instanceName,
          roots.sharedDir,
          roots.instancesDir
        ) &&
        (await pathExists(currentTarget))
      ) {
        await mergeDirectoryWithConflictCopies(currentTarget, sharedProjectsPath, instanceName);
      } else if (
        currentTarget &&
        !isSafeProjectsMergeSource(currentTarget, instanceName, roots.sharedDir, roots.instancesDir)
      ) {
        console.log(
          warn(`Skipping unsafe project merge source outside CCS roots: ${currentTarget}`)
        );
      }

      await fs.promises.unlink(projectsPath);
      await linkDirectoryWithFallback(sharedProjectsPath, projectsPath, deps);
      return;
    }

    if (currentStats.isDirectory()) {
      await detachLegacySharedMemoryLinks(projectsPath, instanceName, roots.sharedDir);
      await mergeDirectoryWithConflictCopies(projectsPath, sharedProjectsPath, instanceName);
      await fs.promises.rm(projectsPath, { recursive: true, force: true });
      await linkDirectoryWithFallback(sharedProjectsPath, projectsPath, deps);
      return;
    }

    await fs.promises.rm(projectsPath, { force: true });
    await linkDirectoryWithFallback(sharedProjectsPath, projectsPath, deps);
    return;
  }

  const currentStats = await getLstat(projectsPath);
  if (!currentStats) {
    await ensureDirectory(projectsPath);
    return;
  }

  if (currentStats.isDirectory()) {
    await detachLegacySharedMemoryLinks(projectsPath, instanceName, roots.sharedDir);
    return;
  }

  if (currentStats.isSymbolicLink()) {
    const currentTarget = await resolveSymlinkTargetPath(projectsPath);
    await fs.promises.unlink(projectsPath);
    await ensureDirectory(projectsPath);

    if (
      currentTarget &&
      path.resolve(currentTarget) !== path.resolve(projectsPath) &&
      isSafeProjectsMergeSource(currentTarget, instanceName, roots.sharedDir, roots.instancesDir) &&
      (await pathExists(currentTarget))
    ) {
      await mergeDirectoryWithConflictCopies(currentTarget, projectsPath, instanceName);
    } else if (
      currentTarget &&
      !isSafeProjectsMergeSource(currentTarget, instanceName, roots.sharedDir, roots.instancesDir)
    ) {
      console.log(warn(`Skipping unsafe project merge source outside CCS roots: ${currentTarget}`));
    }

    return;
  }

  await fs.promises.rm(projectsPath, { force: true });
  await ensureDirectory(projectsPath);
}

/**
 * Sync advanced continuity artifacts for shared deeper mode.
 *
 * - shared + deeper: artifacts are linked per context group.
 * - shared + standard / isolated: artifacts stay local to instance.
 */
export async function syncAdvancedContinuityArtifacts(
  roots: ContextSyncRoots,
  instancePath: string,
  policy: AccountContextPolicy,
  deps: SymlinkHelperDeps
): Promise<void> {
  const instanceName = path.basename(instancePath);
  const useSharedContinuity = policy.mode === 'shared' && policy.continuityMode === 'deeper';
  const contextGroup = policy.group || DEFAULT_ACCOUNT_CONTEXT_GROUP;

  for (const artifactName of ADVANCED_CONTINUITY_ITEMS) {
    const instanceArtifactPath = path.join(instancePath, artifactName);

    if (useSharedContinuity) {
      const sharedArtifactPath = path.join(
        roots.sharedDir,
        'context-groups',
        contextGroup,
        'continuity',
        artifactName
      );

      await ensureDirectory(sharedArtifactPath);
      await ensureDirectory(path.dirname(instanceArtifactPath));

      const currentStats = await getLstat(instanceArtifactPath);
      if (!currentStats) {
        await linkDirectoryWithFallback(sharedArtifactPath, instanceArtifactPath, deps);
        continue;
      }

      if (currentStats.isSymbolicLink()) {
        if (await isSymlinkTarget(instanceArtifactPath, sharedArtifactPath)) {
          continue;
        }

        const currentTarget = await resolveSymlinkTargetPath(instanceArtifactPath);
        if (
          currentTarget &&
          path.resolve(currentTarget) !== path.resolve(sharedArtifactPath) &&
          isSafeContinuityMergeSource(
            currentTarget,
            instanceName,
            artifactName,
            roots.sharedDir,
            roots.instancesDir
          ) &&
          (await pathExists(currentTarget))
        ) {
          await mergeDirectoryWithConflictCopies(currentTarget, sharedArtifactPath, instanceName);
        } else if (
          currentTarget &&
          !isSafeContinuityMergeSource(
            currentTarget,
            instanceName,
            artifactName,
            roots.sharedDir,
            roots.instancesDir
          )
        ) {
          console.log(
            warn(`Skipping unsafe ${artifactName} merge source outside CCS roots: ${currentTarget}`)
          );
        }

        await fs.promises.unlink(instanceArtifactPath);
        await linkDirectoryWithFallback(sharedArtifactPath, instanceArtifactPath, deps);
        continue;
      }

      if (currentStats.isDirectory()) {
        await mergeDirectoryWithConflictCopies(
          instanceArtifactPath,
          sharedArtifactPath,
          instanceName
        );
        await fs.promises.rm(instanceArtifactPath, { recursive: true, force: true });
        await linkDirectoryWithFallback(sharedArtifactPath, instanceArtifactPath, deps);
        continue;
      }

      await fs.promises.rm(instanceArtifactPath, { force: true });
      await linkDirectoryWithFallback(sharedArtifactPath, instanceArtifactPath, deps);
      continue;
    }

    const currentStats = await getLstat(instanceArtifactPath);
    if (!currentStats) {
      await ensureDirectory(instanceArtifactPath);
      continue;
    }

    if (currentStats.isDirectory()) {
      continue;
    }

    if (currentStats.isSymbolicLink()) {
      const currentTarget = await resolveSymlinkTargetPath(instanceArtifactPath);
      await fs.promises.unlink(instanceArtifactPath);
      await ensureDirectory(instanceArtifactPath);

      if (
        currentTarget &&
        path.resolve(currentTarget) !== path.resolve(instanceArtifactPath) &&
        isSafeContinuityMergeSource(
          currentTarget,
          instanceName,
          artifactName,
          roots.sharedDir,
          roots.instancesDir
        ) &&
        (await pathExists(currentTarget))
      ) {
        await mergeDirectoryWithConflictCopies(currentTarget, instanceArtifactPath, instanceName);
      } else if (
        currentTarget &&
        !isSafeContinuityMergeSource(
          currentTarget,
          instanceName,
          artifactName,
          roots.sharedDir,
          roots.instancesDir
        )
      ) {
        console.log(
          warn(`Skipping unsafe ${artifactName} merge source outside CCS roots: ${currentTarget}`)
        );
      }

      continue;
    }

    await fs.promises.rm(instanceArtifactPath, { force: true });
    await ensureDirectory(instanceArtifactPath);
  }
}
