/**
 * SharedManager - plugin layout linking internals.
 *
 * Extracted from shared-dir-linker.ts to keep each file focused and under
 * the 400 LOC target. Owns the four plugin-layout primitives:
 *
 *   - ensureSharedPluginLayoutDefaults: provision ~/.claude/plugins defaults
 *   - linkInstancePlugins: link shared plugin entries into an instance
 *   - getSharedPluginLinkItems: enumerate plugin entries to link
 *   - detachManagedPluginLayout: reverse link + reconcile local registry
 */

import * as fs from 'fs';
import * as path from 'path';

import { warn } from '../../utils/ui';
import { copyDirectoryFallback, removeExistingPath, symlinkPointsTo } from './fs-helpers';
import type { PluginMetadataRoots } from './plugin-metadata-normalizer';
import { reconcileLocalMarketplaceRegistry } from './plugin-metadata-normalizer';
import {
  DEFAULT_INSTALLED_PLUGIN_REGISTRY,
  INSTANCE_LOCAL_PLUGIN_METADATA_FILES,
  SHARED_PLUGIN_ENTRIES,
} from './types';
import type { SharedItem } from './types';

/**
 * Roots for the plugin-layout internals. Same shape as PluginMetadataRoots.
 */
export type PluginLayoutRoots = PluginMetadataRoots;

/**
 * Ensure the plugin layout default directories (cache, marketplaces) and
 * registry files (installed_plugins.json, known_marketplaces.json) exist
 * under ~/.claude/plugins.
 */
export function ensureSharedPluginLayoutDefaults(claudeDir: string): void {
  const pluginsDir = path.join(claudeDir, 'plugins');
  fs.mkdirSync(pluginsDir, { recursive: true, mode: 0o700 });

  for (const entry of SHARED_PLUGIN_ENTRIES) {
    const entryPath = path.join(pluginsDir, entry.name);
    if (fs.existsSync(entryPath)) {
      continue;
    }

    if (entry.type === 'directory') {
      fs.mkdirSync(entryPath, { recursive: true, mode: 0o700 });
      continue;
    }

    fs.writeFileSync(entryPath, DEFAULT_INSTALLED_PLUGIN_REGISTRY, 'utf8');
  }

  const marketplaceRegistryPath = path.join(pluginsDir, 'known_marketplaces.json');
  if (!fs.existsSync(marketplaceRegistryPath)) {
    fs.writeFileSync(marketplaceRegistryPath, JSON.stringify({}, null, 2), 'utf8');
  }
}

/**
 * Link shared plugins directory entries into an instance, creating the
 * instance plugins directory first if needed.
 */
export function linkInstancePlugins(roots: PluginLayoutRoots, instancePath: string): void {
  const linkPath = path.join(instancePath, 'plugins');
  const targetPath = path.join(roots.sharedDir, 'plugins');
  let linkStats: fs.Stats | null = null;

  try {
    linkStats = fs.lstatSync(linkPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }

  if (linkStats?.isSymbolicLink() || (linkStats && !linkStats.isDirectory())) {
    removeExistingPath(linkPath, linkStats.isDirectory() ? 'directory' : 'file');
  }

  if (!linkStats || !linkStats.isDirectory()) {
    fs.mkdirSync(linkPath, { recursive: true, mode: 0o700 });
  }

  for (const item of getSharedPluginLinkItems(roots.sharedDir)) {
    const targetEntryPath = path.join(targetPath, item.name);
    const linkEntryPath = path.join(linkPath, item.name);

    removeExistingPath(linkEntryPath, item.type);

    try {
      const symlinkType = item.type === 'directory' ? 'dir' : 'file';
      fs.symlinkSync(targetEntryPath, linkEntryPath, symlinkType);
    } catch (_err) {
      if (process.platform === 'win32') {
        if (item.type === 'directory') {
          copyDirectoryFallback(targetEntryPath, linkEntryPath);
        } else {
          fs.copyFileSync(targetEntryPath, linkEntryPath);
        }
        console.log(
          warn(`Symlink failed for plugins/${item.name}, copied instead (enable Developer Mode)`)
        );
      } else {
        throw _err;
      }
    }
  }
}

/**
 * Build the list of plugin entries to link from the shared plugins dir.
 * Always includes the default SHARED_PLUGIN_ENTRIES; adds any additional
 * entries physically present on disk, skipping instance-local metadata.
 */
export function getSharedPluginLinkItems(sharedDir: string): SharedItem[] {
  const sharedPluginsPath = path.join(sharedDir, 'plugins');
  const items = new Map<string, SharedItem>(
    SHARED_PLUGIN_ENTRIES.map((entry) => [entry.name, { ...entry }])
  );

  for (const entry of fs.readdirSync(sharedPluginsPath, { withFileTypes: true })) {
    if (items.has(entry.name) || INSTANCE_LOCAL_PLUGIN_METADATA_FILES.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(sharedPluginsPath, entry.name);
    let stats: fs.Stats;
    try {
      stats = fs.statSync(entryPath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      console.log(
        warn(
          `Skipping plugins/${entry.name}: unable to inspect shared plugin entry${code ? ` (${code})` : ''}`
        )
      );
      continue;
    }

    items.set(entry.name, {
      name: entry.name,
      type: stats.isDirectory() ? 'directory' : 'file',
    });
  }

  return [...items.values()];
}

/**
 * Detach managed plugin layout from an instance. Removes the symlinked
 * plugin entries that point back at the shared plugins dir and reconciles
 * the local marketplace registry. Removes the plugins directory entirely
 * if it ends up empty.
 */
export function detachManagedPluginLayout(roots: PluginLayoutRoots, instancePath: string): void {
  const pluginsPath = path.join(instancePath, 'plugins');
  if (!fs.existsSync(pluginsPath)) {
    return;
  }

  const stats = fs.lstatSync(pluginsPath);
  const sharedPluginsPath = path.join(roots.sharedDir, 'plugins');

  if (stats.isSymbolicLink()) {
    if (symlinkPointsTo(pluginsPath, sharedPluginsPath)) {
      removeExistingPath(pluginsPath, 'directory');
    }
    return;
  }

  if (!stats.isDirectory()) {
    return;
  }

  let removedManagedEntries = false;

  for (const item of getSharedPluginLinkItems(roots.sharedDir)) {
    const pluginEntryPath = path.join(pluginsPath, item.name);
    if (!fs.existsSync(pluginEntryPath)) {
      continue;
    }

    const entryStats = fs.lstatSync(pluginEntryPath);
    if (!entryStats.isSymbolicLink()) {
      continue;
    }

    if (symlinkPointsTo(pluginEntryPath, path.join(sharedPluginsPath, item.name))) {
      removeExistingPath(pluginEntryPath, item.type);
      removedManagedEntries = true;
    }
  }

  if (!removedManagedEntries) {
    return;
  }

  reconcileLocalMarketplaceRegistry(roots, instancePath);

  if (fs.readdirSync(pluginsPath).length === 0) {
    fs.rmSync(pluginsPath, { recursive: true, force: true });
  }
}
