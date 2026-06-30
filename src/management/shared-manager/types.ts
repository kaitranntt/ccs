/**
 * SharedManager - shared types and constants.
 *
 * Extracted from the original monolithic shared-manager.ts to keep the
 * orchestrator class focused on coordination. Pure data only: no behavior
 * lives here.
 */

/**
 * Descriptor for a filesystem entry (directory or file) managed by
 * SharedManager. Used for both top-level shared items and plugin layout
 * entries.
 */
export interface SharedItem {
  name: string;
  type: 'directory' | 'file';
}

/**
 * Default content for a freshly provisioned installed_plugins.json registry.
 * Version 2 schema with an empty plugins map.
 */
export const DEFAULT_INSTALLED_PLUGIN_REGISTRY = JSON.stringify(
  {
    version: 2,
    plugins: {},
  },
  null,
  2
);

/**
 * Canonical list of shared items linked between ~/.claude and ~/.ccs/shared,
 * and from there into each instance.
 *
 * Order matters: consumers rely on a stable iteration order when reconciling
 * symlinks, and 'plugins' is special-cased by the linker.
 */
export const SHARED_ITEMS: readonly SharedItem[] = [
  { name: 'commands', type: 'directory' },
  { name: 'skills', type: 'directory' },
  { name: 'agents', type: 'directory' },
  { name: 'plugins', type: 'directory' },
  { name: 'settings.json', type: 'file' },
];

/**
 * Plugin layout entries that always exist under ~/.claude/plugins and are
 * linked as-is into each instance's plugins directory.
 */
export const SHARED_PLUGIN_ENTRIES: readonly SharedItem[] = [
  { name: 'cache', type: 'directory' },
  { name: 'marketplaces', type: 'directory' },
  { name: 'installed_plugins.json', type: 'file' },
];

/**
 * Plugin metadata filenames that are intentionally instance-local and must
 * NOT be linked from the shared plugins directory.
 */
export const INSTANCE_LOCAL_PLUGIN_METADATA_FILES = new Set(['known_marketplaces.json']);

/**
 * Advanced continuity artifacts linked per context group when the account
 * policy requests shared + deeper continuity.
 */
export const ADVANCED_CONTINUITY_ITEMS: readonly string[] = [
  'session-env',
  'file-history',
  'shell-snapshots',
  'todos',
];
