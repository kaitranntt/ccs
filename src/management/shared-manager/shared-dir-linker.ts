/**
 * SharedManager - shared directory linking entrypoints.
 *
 * Extracted from the original monolithic shared-manager.ts. Owns the
 * creation of the ~/.ccs/shared/* symlinks pointing at ~/.claude/* and
 * the per-instance links for commands/skills/agents/plugins/settings.
 *
 * Plugin-layout internals (the four functions that operate on the plugins/
 * subtree) live in plugin-layout-internals.ts. This file keeps only the
 * high-level entrypoints and circular-symlink detection so each file stays
 * focused and under the 400 LOC target.
 *
 * These functions take an explicit roots object so they remain decoupled
 * from SharedManager instance state.
 */

import * as fs from 'fs';
import * as path from 'path';

import { info, warn } from '../../utils/ui';
import {
  copyDirectoryFallback,
  getLstatSync,
  isPathWithinDirectory,
  removeExistingPath,
  resolveCanonicalPath,
  symlinkPointsTo,
} from './fs-helpers';
import type { PluginMetadataRoots } from './plugin-metadata-normalizer';
import {
  normalizeMarketplaceRegistryPaths,
  normalizePluginRegistryPaths,
} from './plugin-metadata-normalizer';
import {
  detachManagedPluginLayout,
  ensureSharedPluginLayoutDefaults,
  linkInstancePlugins,
} from './plugin-layout-internals';
import { SHARED_ITEMS } from './types';

/**
 * Roots for the shared-dir linker. Reuses PluginMetadataRoots because the
 * linker operates on the same three roots.
 */
export type LinkerRoots = PluginMetadataRoots;

/**
 * Detect a circular symlink before creation. A symlink is circular when its
 * target (raw or canonical) points back inside the shared root.
 */
export function detectCircularSymlink(target: string, sharedDir: string): boolean {
  try {
    const stats = fs.lstatSync(target);
    if (!stats.isSymbolicLink()) {
      return false;
    }

    const targetLink = fs.readlinkSync(target);
    const resolvedTarget = path.resolve(path.dirname(target), targetLink);
    const sharedDirPath = path.resolve(sharedDir);

    // A raw target path pointing back into ~/.ccs/shared is already unsafe.
    // Re-pointing ~/.ccs/shared/* to ~/.claude/* would turn it into a real
    // loop, even if the current ~/.ccs/shared entry ultimately resolves to
    // an external path.
    if (isPathWithinDirectory(resolvedTarget, sharedDirPath)) {
      console.log(warn(`Circular symlink detected: ${target} → ${resolvedTarget}`));
      return true;
    }

    // Only treat targets inside the managed shared root as circular.
    // Existing shared symlinks may already resolve through ~/.claude/ to an
    // external repo, which is a supported upgrade path rather than a loop.
    const sharedDirCanonical = resolveCanonicalPath(sharedDirPath);
    const canonicalResolvedTarget = resolveCanonicalPath(resolvedTarget);

    if (isPathWithinDirectory(canonicalResolvedTarget, sharedDirCanonical)) {
      console.log(warn(`Circular symlink detected: ${target} → ${resolvedTarget}`));
      return true;
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw err;
  }

  return false;
}

/**
 * Ensure shared directories exist as symlinks to ~/.claude/ and that the
 * plugin layout default directories and registry files are present.
 */
export function ensureSharedDirectories(roots: LinkerRoots): void {
  const claudeDir = roots.claudeDir;
  const sharedDir = roots.sharedDir;

  if (!getLstatSync(claudeDir)) {
    console.log(info('Creating ~/.claude/ directory structure'));
    fs.mkdirSync(claudeDir, { recursive: true, mode: 0o700 });
  }

  if (!getLstatSync(sharedDir)) {
    fs.mkdirSync(sharedDir, { recursive: true, mode: 0o700 });
  }

  ensureSharedPluginLayoutDefaults(claudeDir);

  for (const item of SHARED_ITEMS) {
    const claudePath = path.join(claudeDir, item.name);
    const sharedPath = path.join(sharedDir, item.name);

    if (!getLstatSync(claudePath)) {
      if (item.type === 'directory') {
        fs.mkdirSync(claudePath, { recursive: true, mode: 0o700 });
      } else if (item.type === 'file') {
        fs.writeFileSync(claudePath, JSON.stringify({}, null, 2), 'utf8');
      }
    }

    if (detectCircularSymlink(claudePath, sharedDir)) {
      console.log(warn(`Skipping ${item.name}: circular symlink detected`));
      continue;
    }

    if (getLstatSync(sharedPath)) {
      try {
        const stats = fs.lstatSync(sharedPath);
        if (stats.isSymbolicLink()) {
          const currentTarget = fs.readlinkSync(sharedPath);
          const resolvedTarget = path.resolve(path.dirname(sharedPath), currentTarget);
          if (resolvedTarget === claudePath) {
            continue;
          }
        }
      } catch (_err) {
        // Continue to recreate
      }

      if (item.type === 'directory') {
        fs.rmSync(sharedPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(sharedPath);
      }
    }

    try {
      const symlinkType = item.type === 'directory' ? 'dir' : 'file';
      fs.symlinkSync(claudePath, sharedPath, symlinkType);
    } catch (_err) {
      if (process.platform === 'win32') {
        if (item.type === 'directory') {
          copyDirectoryFallback(claudePath, sharedPath);
        } else if (item.type === 'file') {
          fs.copyFileSync(claudePath, sharedPath);
        }
        console.log(
          warn(`Symlink failed for ${item.name}, copied instead (enable Developer Mode)`)
        );
      } else {
        throw _err;
      }
    }
  }
}

/**
 * Link shared directories into a specific instance path.
 */
export function linkSharedDirectories(roots: LinkerRoots, instancePath: string): void {
  ensureSharedDirectories(roots);

  const sharedDir = roots.sharedDir;

  for (const item of SHARED_ITEMS) {
    if (item.name === 'plugins') {
      linkInstancePlugins(roots, instancePath);
      continue;
    }

    const linkPath = path.join(instancePath, item.name);
    const targetPath = path.join(sharedDir, item.name);

    removeExistingPath(linkPath, item.type);

    try {
      const symlinkType = item.type === 'directory' ? 'dir' : 'file';
      fs.symlinkSync(targetPath, linkPath, symlinkType);
    } catch (_err) {
      if (process.platform === 'win32') {
        if (item.type === 'directory') {
          copyDirectoryFallback(targetPath, linkPath);
        } else if (item.type === 'file') {
          fs.copyFileSync(targetPath, linkPath);
        }
        console.log(
          warn(`Symlink failed for ${item.name}, copied instead (enable Developer Mode)`)
        );
      } else {
        throw _err;
      }
    }
  }

  // Preserve original behavior: linkSharedDirectories always concludes by
  // normalizing plugin + marketplace metadata for the freshly linked
  // instance. migrateFromV311 relies on this side effect.
  normalizePluginRegistryPaths(roots, instancePath);
  normalizeMarketplaceRegistryPaths(roots, instancePath);
}

/**
 * Detach shared-directory symlinks from an instance, removing only entries
 * that point back at the shared root.
 */
export function detachSharedDirectories(roots: LinkerRoots, instancePath: string): void {
  ensureSharedDirectories(roots);

  const sharedDir = roots.sharedDir;

  for (const item of SHARED_ITEMS) {
    const managedPath = path.join(instancePath, item.name);
    if (!fs.existsSync(managedPath)) {
      continue;
    }

    if (item.name === 'plugins') {
      detachManagedPluginLayout(roots, instancePath);
      continue;
    }

    const stats = fs.lstatSync(managedPath);
    if (!stats.isSymbolicLink()) {
      continue;
    }

    if (symlinkPointsTo(managedPath, path.join(sharedDir, item.name))) {
      removeExistingPath(managedPath, item.type);
    }
  }
}
