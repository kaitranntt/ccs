/**
 * SharedManager - plugin metadata normalization and marketplace reconciliation.
 *
 * Extracted from the original monolithic shared-manager.ts. These helpers
 * normalize installed_plugins.json and known_marketplaces.json contents so
 * plugin metadata refers to canonical ~/.claude/ paths rather than
 * instance-specific paths, and reconcile the marketplace registry against
 * the on-disk marketplace directories.
 *
 * All filesystem roots (claudeDir, sharedDir, instancesDir) are passed
 * explicitly to keep this module stateless and testable in isolation.
 */

import * as fs from 'fs';
import * as path from 'path';

import { ok, warn } from '../../utils/ui';
import {
  normalizePluginMetadataContent,
  normalizePluginMetadataValue,
} from '../plugin-path-normalizer';
import { listAccountInstancePaths } from '../instance-directory';
import { removeExistingPath, resolveCanonicalPath } from './fs-helpers';
import type { SharedItem } from './types';

/**
 * Roots that plugin-metadata normalization operates on. The SharedManager
 * orchestrator supplies its own private fields when constructing this
 * object.
 */
export interface PluginMetadataRoots {
  claudeDir: string;
  sharedDir: string;
  instancesDir: string;
}

/**
 * Normalize every installed_plugins.json file reachable from the given roots
 * so its embedded paths are canonical ~/.claude/ paths.
 */
export function normalizePluginRegistryPaths(roots: PluginMetadataRoots, configDir?: string): void {
  normalizePluginMetadataFiles(
    roots,
    'installed_plugins.json',
    configDir,
    'Normalized plugin registry paths',
    'plugin registry'
  );
}

/**
 * Reconcile marketplace registry content into the active config dir while
 * keeping the global ~/.claude copy up to date for non-instance flows.
 */
export function normalizeMarketplaceRegistryPaths(
  roots: PluginMetadataRoots,
  configDir?: string
): void {
  const successMessage = 'Synchronized marketplace registry paths';
  const warningLabel = 'marketplace registry';

  try {
    const sourcePaths = getMarketplaceRegistrySourcePaths(roots, configDir);
    writePluginMetadataFile(
      path.join(roots.claudeDir, 'plugins', 'known_marketplaces.json'),
      buildMarketplaceRegistryContent(sourcePaths, roots.claudeDir),
      successMessage
    );

    if (configDir && path.resolve(configDir) !== path.resolve(roots.claudeDir)) {
      writePluginMetadataFile(
        path.join(configDir, 'plugins', 'known_marketplaces.json'),
        buildMarketplaceRegistryContent(sourcePaths, configDir),
        successMessage
      );
    }
  } catch (err) {
    console.log(warn(`Could not synchronize ${warningLabel}: ${(err as Error).message}`));
  }
}

/**
 * Run normalizePluginMetadataFile across every registry path deduped by
 * canonical realpath.
 */
function normalizePluginMetadataFiles(
  roots: PluginMetadataRoots,
  fileName: string,
  configDir: string | undefined,
  successMessage: string,
  warningLabel: string
): void {
  const seen = new Set<string>();

  for (const registryPath of getPluginMetadataFilePaths(roots, fileName, configDir)) {
    const dedupeKey = resolveCanonicalPath(registryPath);
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    normalizePluginMetadataFile(registryPath, successMessage, warningLabel);
  }
}

function getPluginMetadataFilePaths(
  roots: PluginMetadataRoots,
  fileName: string,
  configDir?: string
): string[] {
  const pluginDirs = new Set<string>([
    path.join(roots.claudeDir, 'plugins'),
    path.join(roots.sharedDir, 'plugins'),
  ]);

  if (configDir && path.resolve(configDir) !== path.resolve(roots.claudeDir)) {
    pluginDirs.add(path.join(configDir, 'plugins'));
  }

  return [...pluginDirs].map((pluginDir) => path.join(pluginDir, fileName));
}

function normalizePluginMetadataFile(
  registryPath: string,
  successMessage: string,
  warningLabel: string
): void {
  if (!fs.existsSync(registryPath)) {
    return;
  }

  try {
    const original = fs.readFileSync(registryPath, 'utf8');
    const normalized = normalizePluginMetadataContent(original);

    if (normalized !== original) {
      fs.writeFileSync(registryPath, normalized, 'utf8');
      console.log(ok(successMessage));
    }
  } catch (err) {
    console.log(warn(`Could not normalize ${warningLabel}: ${(err as Error).message}`));
  }
}

function getMarketplaceRegistrySourcePaths(
  roots: PluginMetadataRoots,
  configDir?: string
): string[] {
  const sourcePaths = new Set<string>([
    path.join(roots.claudeDir, 'plugins', 'known_marketplaces.json'),
  ]);

  for (const instancePath of listAccountInstancePaths(roots.instancesDir)) {
    sourcePaths.add(path.join(instancePath, 'plugins', 'known_marketplaces.json'));
  }

  if (configDir && path.resolve(configDir) !== path.resolve(roots.claudeDir)) {
    sourcePaths.add(path.join(configDir, 'plugins', 'known_marketplaces.json'));
  }

  return [...sourcePaths];
}

function buildMarketplaceRegistryContent(sourcePaths: string[], targetConfigDir: string): string {
  const merged: Record<string, unknown> = {};

  for (const registryPath of sourcePaths) {
    if (!fs.existsSync(registryPath)) {
      continue;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        continue;
      }

      for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (!isMarketplaceRegistryEntry(value)) {
          continue;
        }

        if (isDirectorySourceMarketplace(value)) {
          merged[name] = value;
        } else {
          merged[name] = normalizePluginMetadataValue(value, targetConfigDir).normalized;
        }
      }
    } catch (err) {
      console.log(
        warn(`Skipping malformed marketplace registry ${registryPath}: ${(err as Error).message}`)
      );
    }
  }

  const discoveredEntries = discoverMarketplaceEntries(targetConfigDir);

  // Keep only registry entries that have a physical directory, and update
  // their installLocation. Entries only on disk (no registry record) are
  // excluded: they lack required schema fields that Claude Code enforces.
  for (const name of Object.keys(merged)) {
    const entry = merged[name];
    if (!isMarketplaceRegistryEntry(entry)) {
      delete merged[name];
      continue;
    }
    // Directory-source marketplace takes precedence over discovered clone dirs.
    // A directory-source marketplace lives at its source path and has no clone
    // under plugins/marketplaces/. Even if an empty directory exists under
    // plugins/marketplaces/<name>, preserve the original entry and installLocation.
    if (isDirectorySourceMarketplace(entry)) {
      if (fs.existsSync(entry.source.path)) {
        continue;
      }
      // Prune stale directory source; never resurrect as a clone
      delete merged[name];
      continue;
    }
    if (name in discoveredEntries) {
      merged[name] = {
        ...entry,
        installLocation: discoveredEntries[name].installLocation,
      };
      continue;
    }
    delete merged[name];
  }

  return JSON.stringify(merged, null, 2);
}

/**
 * Discover physical marketplace directories on disk. Skips hidden dirs and
 * Claude Code rename-dance leftovers (.staging/.bak).
 */
export function discoverMarketplaceEntries(
  targetConfigDir: string
): Record<string, { installLocation: string }> {
  const marketplacesDir = path.join(targetConfigDir, 'plugins', 'marketplaces');
  if (!fs.existsSync(marketplacesDir)) {
    return {};
  }

  const discovered: Record<string, { installLocation: string }> = {};

  for (const entry of fs.readdirSync(marketplacesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    if (isTransientMarketplaceDirectory(entry.name)) {
      continue;
    }

    discovered[entry.name] = {
      installLocation: path.join(targetConfigDir, 'plugins', 'marketplaces', entry.name),
    };
  }

  return discovered;
}

function isTransientMarketplaceDirectory(name: string): boolean {
  return name.startsWith('.') || name.endsWith('.staging') || name.endsWith('.bak');
}

function isMarketplaceRegistryEntry(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isDirectorySourceMarketplace(
  entry: unknown
): entry is { source: { source: 'directory'; path: string } } {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    return false;
  }
  if (!('source' in entry)) {
    return false;
  }
  const source = entry.source;
  if (typeof source !== 'object' || source === null || Array.isArray(source)) {
    return false;
  }
  if (!('source' in source) || !('path' in source)) {
    return false;
  }
  return source.source === 'directory' && typeof source.path === 'string' && source.path.length > 0;
}

/**
 * Write a plugin metadata file, creating parent dirs first and skipping
 * when the content is unchanged.
 */
export function writePluginMetadataFile(
  registryPath: string,
  content: string,
  successMessage: string
): void {
  fs.mkdirSync(path.dirname(registryPath), { recursive: true, mode: 0o700 });
  const current = fs.existsSync(registryPath) ? fs.readFileSync(registryPath, 'utf8') : null;

  if (current === content) {
    return;
  }

  fs.writeFileSync(registryPath, content, 'utf8');
  console.log(ok(successMessage));
}

/**
 * Reconcile the local marketplace registry against on-disk directories,
 * removing the registry file entirely when no marketplaces remain and
 * otherwise re-normalizing each entry.
 */
export function reconcileLocalMarketplaceRegistry(
  _roots: PluginMetadataRoots,
  configDir: string
): void {
  const registryPath = path.join(configDir, 'plugins', 'known_marketplaces.json');
  if (!fs.existsSync(registryPath)) {
    return;
  }

  const discoveredEntries = discoverMarketplaceEntries(configDir);

  let parsed: Record<string, unknown> = {};
  try {
    const raw = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as unknown;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      parsed = raw as Record<string, unknown>;
    }
  } catch {
    parsed = {};
  }
  // Preserve directory-source entries whose path still exists on disk (precedence over discovered)
  const directoryEntries: Record<string, Record<string, unknown>> = {};
  for (const [name, entry] of Object.entries(parsed)) {
    if (
      isMarketplaceRegistryEntry(entry) &&
      isDirectorySourceMarketplace(entry) &&
      fs.existsSync(entry.source.path)
    ) {
      directoryEntries[name] = entry;
    }
  }

  if (Object.keys(discoveredEntries).length === 0 && Object.keys(directoryEntries).length === 0) {
    removeExistingPath(registryPath, 'file');
    return;
  }

  const reconciled: Record<string, unknown> = {
    ...directoryEntries,
  };

  for (const [name, value] of Object.entries(discoveredEntries)) {
    if (name in directoryEntries) {
      continue;
    }
    const existing = parsed[name];
    if (isDirectorySourceMarketplace(existing)) {
      // Stale directory source must not be resurrected as a clone
      continue;
    }
    if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
      reconciled[name] = {
        ...(normalizePluginMetadataValue(existing, configDir).normalized as Record<
          string,
          unknown
        >),
        installLocation: value.installLocation,
      };
    } else {
      reconciled[name] = value;
    }
  }
  writePluginMetadataFile(
    registryPath,
    JSON.stringify(reconciled, null, 2),
    'Synchronized marketplace registry paths'
  );
}

// Silence unused-import warning for SharedItem when consumers re-import it.
export type { SharedItem };
