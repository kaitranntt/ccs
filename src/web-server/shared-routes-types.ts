/**
 * Shared Routes — Type definitions and type guards
 */

export type SharedCollectionType = 'commands' | 'skills' | 'agents' | 'plugins';
export type SharedContentType = SharedCollectionType | 'settings';
export type SharedItemSource = 'ccs-shared' | 'claude-default';

export interface SharedItem {
  name: string;
  description: string;
  path: string;
  type: 'command' | 'skill' | 'agent' | 'plugin';
  source?: SharedItemSource;
}

export interface SharedItemsCacheEntry {
  items: SharedItem[];
  cacheKey: string;
  expiresAt: number;
}

export interface InstalledPluginRegistry {
  version?: number;
  plugins: Record<string, unknown>;
}

export function isSharedCollectionType(value: unknown): value is SharedCollectionType {
  return value === 'commands' || value === 'skills' || value === 'agents' || value === 'plugins';
}

export function isSharedContentType(value: unknown): value is SharedContentType {
  return isSharedCollectionType(value) || value === 'settings';
}
