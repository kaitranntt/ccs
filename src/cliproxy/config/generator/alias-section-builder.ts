/**
 * OAuth Model Alias Section Builder & Legacy Antigravity Alias Pruning
 */

import * as fs from 'fs';
import { getDeniedModelIdReasonForProvider } from '../../ai-providers/model-id-normalizer';
import type { CLIProxyOAuthModelAliasConfig } from '../../../config/schemas/cliproxy';
import {
  mergeOAuthModelAliases,
  parseOAuthModelAliasSection,
  serializeOAuthModelAliasBody,
} from '../oauth-model-alias-config';
import { sanitizeYamlScalar } from './settings-readers';

interface OAuthModelAliasEntry {
  name: string;
  alias: string;
  fork?: boolean;
}

interface PreservedAntigravityAliasesResult {
  yaml: string;
  prunedLegacyAliasCount: number;
}

const DEPRECATED_ANTIGRAVITY_ALIAS_PREFIX = 'gemini-claude-';
const UPSTREAM_CLAUDE_ALIAS_PREFIX = 'claude-';
const DEPRECATED_ANTIGRAVITY_SONNET_46_THINKING_REGEX = /^claude-sonnet-4(?:[.-])6-thinking$/i;
const CANONICAL_ANTIGRAVITY_SONNET_46_ALIAS = 'claude-sonnet-4-6';

const DEFAULT_ANTIGRAVITY_ALIASES: OAuthModelAliasEntry[] = [
  { name: 'rev19-uic3-1p', alias: 'gemini-2.5-computer-use-preview-10-2025' },
  { name: 'gemini-3-pro-image', alias: 'gemini-3-pro-image-preview' },
  { name: 'gemini-3-pro-high', alias: 'gemini-3-pro-preview' },
  { name: 'gemini-3-pro-high', alias: 'gemini-3.1-pro-preview' },
  { name: 'gemini-3-pro-high', alias: 'gemini-3.1-pro-preview-customtools' },
  { name: 'gemini-3-flash', alias: 'gemini-3-flash-preview' },
  { name: 'gemini-3-flash', alias: 'gemini-3.1-flash-preview' },
  { name: 'claude-sonnet-4-6', alias: 'claude-sonnet-4-6', fork: true },
  { name: 'claude-sonnet-4-6-thinking', alias: 'claude-sonnet-4-6', fork: true },
  { name: 'claude-opus-4-6-thinking', alias: 'claude-opus-4-6-thinking', fork: true },
];

const BUILT_IN_GEMINI_ALIAS_NAMES = new Set(
  DEFAULT_ANTIGRAVITY_ALIASES.filter((entry) => entry.alias.startsWith('gemini-3')).map(
    (entry) => entry.name
  )
);
const MIN_STALE_GUESSED_GEMINI_MINOR_VERSIONS = 2;
const MIN_STALE_HIGH_ONLY_GEMINI_MINOR_VERSIONS = 3;
const MIN_STALE_GUESSED_GEMINI_AVERAGE_VARIANTS_PER_MINOR = 2;
const MAX_LEGACY_MANUAL_GEMINI_MINOR_VERSION = 2;

export const LEGACY_GEMINI_STALE_ALIAS_MIGRATION_VERSION = 16;

function normalizeAntigravityAlias(rawAlias: string): string {
  const normalized = sanitizeYamlScalar(rawAlias);
  if (normalized.toLowerCase().startsWith(DEPRECATED_ANTIGRAVITY_ALIAS_PREFIX)) {
    const migratedPrefix =
      UPSTREAM_CLAUDE_ALIAS_PREFIX + normalized.slice(DEPRECATED_ANTIGRAVITY_ALIAS_PREFIX.length);
    return normalizeAntigravityAlias(migratedPrefix);
  }

  if (DEPRECATED_ANTIGRAVITY_SONNET_46_THINKING_REGEX.test(normalized)) {
    return CANONICAL_ANTIGRAVITY_SONNET_46_ALIAS;
  }

  return normalized;
}

function addAliasEntry(
  entries: OAuthModelAliasEntry[],
  indexByKey: Map<string, number>,
  entry: OAuthModelAliasEntry
): void {
  const normalized: OAuthModelAliasEntry = {
    name: sanitizeYamlScalar(entry.name),
    alias: normalizeAntigravityAlias(entry.alias),
    fork: entry.fork || undefined,
  };
  if (!normalized.name || !normalized.alias) return;
  if (getDeniedModelIdReasonForProvider(normalized.name, 'agy')) return;
  if (getDeniedModelIdReasonForProvider(normalized.alias, 'agy')) return;

  const key = `${normalized.name}\0${normalized.alias}`;
  const existingIndex = indexByKey.get(key);
  if (existingIndex !== undefined) {
    if (normalized.fork) entries[existingIndex].fork = true;
    return;
  }

  indexByKey.set(key, entries.length);
  entries.push(normalized);
}

function upsertConfiguredAliasEntry(
  entries: OAuthModelAliasEntry[],
  indexByKey: Map<string, number>,
  entry: OAuthModelAliasEntry
): void {
  const normalized: OAuthModelAliasEntry = {
    name: sanitizeYamlScalar(entry.name),
    alias: normalizeAntigravityAlias(entry.alias),
    fork: entry.fork || undefined,
  };
  if (!normalized.name || !normalized.alias) return;
  if (getDeniedModelIdReasonForProvider(normalized.name, 'agy')) return;
  if (getDeniedModelIdReasonForProvider(normalized.alias, 'agy')) return;

  const existingIndex = entries.findIndex((candidate) => candidate.alias === normalized.alias);
  if (existingIndex === -1) {
    addAliasEntry(entries, indexByKey, normalized);
    return;
  }

  entries[existingIndex] = normalized;
  indexByKey.clear();
  entries.forEach((candidate, index) => {
    indexByKey.set(candidate.alias, index);
  });
}

function buildAntigravityAliasKey(entry: Pick<OAuthModelAliasEntry, 'name' | 'alias'>): string {
  return `${sanitizeYamlScalar(entry.name)}\u0000${normalizeAntigravityAlias(entry.alias)}`;
}

function parseExistingAntigravityAliases(existingAliases: string): OAuthModelAliasEntry[] {
  const entries: OAuthModelAliasEntry[] = [];
  const lines = existingAliases.replace(/\r\n/g, '\n').split('\n');

  let currentChannel = '';
  let currentName = '';
  let currentAlias = '';
  let currentFork = false;

  const flushCurrent = () => {
    if (currentName && currentAlias && (!currentChannel || currentChannel === 'antigravity')) {
      entries.push({
        name: sanitizeYamlScalar(currentName),
        alias: sanitizeYamlScalar(currentAlias),
        fork: currentFork || undefined,
      });
    }
    currentName = '';
    currentAlias = '';
    currentFork = false;
  };

  for (const line of lines) {
    const channelMatch = line.match(/^\s{2}([a-zA-Z0-9_-]+):\s*$/);
    if (channelMatch) {
      flushCurrent();
      currentChannel = channelMatch[1].trim().toLowerCase();
      continue;
    }

    if (currentChannel && currentChannel !== 'antigravity') continue;

    const nameMatch = line.match(/^\s+-\s*name:\s*(.+)/);
    const aliasMatch = line.match(/^\s+alias:\s*(.+)/);
    const forkMatch = line.match(/^\s+fork:\s*(.+)/);

    if (nameMatch) {
      flushCurrent();
      currentName = nameMatch[1];
      continue;
    }

    if (aliasMatch) {
      currentAlias = aliasMatch[1];
      continue;
    }

    if (forkMatch) {
      currentFork = sanitizeYamlScalar(forkMatch[1]).toLowerCase() === 'true';
    }
  }

  flushCurrent();
  return entries;
}

function toDottedGeminiVersionAlias(alias: string): string | null {
  const match = alias.match(/^(gemini-\d+)-(\d+)(-.+)$/);
  if (!match) return null;
  return `${match[1]}.${match[2]}${match[3]}`;
}

function toHyphenatedGeminiVersionAlias(alias: string): string | null {
  const match = alias.match(/^(gemini-\d+)\.(\d+)(-.+)$/);
  if (!match) return null;
  return `${match[1]}-${match[2]}${match[3]}`;
}

function buildGeminiCompatibilityAliases(alias: string): string[] {
  if (!alias.startsWith('gemini-') || !alias.includes('-preview')) return [];

  const variants = new Set<string>();
  const queue: string[] = [alias];

  const enqueue = (candidate: string) => {
    if (!candidate || candidate === alias || variants.has(candidate)) return;
    variants.add(candidate);
    queue.push(candidate);
  };

  const visited = new Set<string>();
  while (queue.length > 0) {
    const current = queue.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    if (current.startsWith('gemini-') && current.includes('-preview')) {
      if (current.endsWith('-customtools')) {
        enqueue(current.slice(0, -'-customtools'.length));
      } else {
        enqueue(`${current}-customtools`);
      }
    }

    const dotted = toDottedGeminiVersionAlias(current);
    if (dotted) enqueue(dotted);

    const hyphenated = toHyphenatedGeminiVersionAlias(current);
    if (hyphenated) enqueue(hyphenated);
  }

  return [...variants];
}

function getCompatibilityAliases(entries: OAuthModelAliasEntry[]): OAuthModelAliasEntry[] {
  const compatibilityAliases: OAuthModelAliasEntry[] = [];
  for (const entry of entries) {
    const variants = buildGeminiCompatibilityAliases(entry.alias);
    for (const variant of variants) {
      compatibilityAliases.push({
        name: entry.name,
        alias: variant,
        fork: entry.fork,
      });
    }
  }
  return compatibilityAliases;
}

function buildGeneratedAntigravityAliases(): OAuthModelAliasEntry[] {
  const generatedAliases: OAuthModelAliasEntry[] = [];
  const generatedAliasIndex = new Map<string, number>();

  for (const alias of DEFAULT_ANTIGRAVITY_ALIASES) {
    addAliasEntry(generatedAliases, generatedAliasIndex, alias);
  }

  for (const alias of getCompatibilityAliases(generatedAliases)) {
    addAliasEntry(generatedAliases, generatedAliasIndex, alias);
  }

  return generatedAliases;
}

const GENERATED_ANTIGRAVITY_ALIASES = buildGeneratedAntigravityAliases();
const GENERATED_ANTIGRAVITY_ALIAS_MAP = new Map(
  GENERATED_ANTIGRAVITY_ALIASES.map((entry) => [buildAntigravityAliasKey(entry), entry] as const)
);

function serializeAntigravityAliases(entries: OAuthModelAliasEntry[]): string {
  if (entries.length === 0) {
    return '';
  }

  const lines = ['  antigravity:'];
  for (const entry of entries) {
    lines.push(`    - name: ${entry.name}`);
    lines.push(`      alias: ${entry.alias}`);
    if (entry.fork) {
      lines.push('      fork: true');
    }
  }

  return lines.join('\n');
}

function getLegacyGeneratedGeminiPreviewInfo(
  entry: OAuthModelAliasEntry
): { nameKey: string; minorVersion: string } | null {
  if (!BUILT_IN_GEMINI_ALIAS_NAMES.has(entry.name)) {
    return null;
  }

  const normalizedAlias = normalizeAntigravityAlias(entry.alias).toLowerCase();
  if (!normalizedAlias.startsWith('gemini-3') || !normalizedAlias.includes('-preview')) {
    return null;
  }

  const aliasWithoutCustomtools = normalizedAlias.endsWith('-customtools')
    ? normalizedAlias.slice(0, -'-customtools'.length)
    : normalizedAlias;
  const canonicalAlias =
    toDottedGeminiVersionAlias(aliasWithoutCustomtools) ?? aliasWithoutCustomtools;
  const minorVersionMatch = canonicalAlias.match(/^gemini-3\.(\d+)(-.+-preview)$/);
  if (!minorVersionMatch) {
    return null;
  }

  return {
    nameKey: sanitizeYamlScalar(entry.name),
    minorVersion: minorVersionMatch[1],
  };
}

function buildLegacyGeneratedGeminiAliasPruneSet(
  parsedEntries: OAuthModelAliasEntry[]
): Set<string> {
  const aliasKeysByNameAndMinor = new Map<string, Map<string, string[]>>();

  for (const entry of parsedEntries) {
    if (entry.fork) {
      continue;
    }

    const aliasKey = buildAntigravityAliasKey(entry);
    if (GENERATED_ANTIGRAVITY_ALIAS_MAP.has(aliasKey)) {
      continue;
    }

    const previewInfo = getLegacyGeneratedGeminiPreviewInfo(entry);
    if (!previewInfo) {
      continue;
    }

    const aliasKeysByMinor = aliasKeysByNameAndMinor.get(previewInfo.nameKey) ?? new Map();
    const aliasKeys = aliasKeysByMinor.get(previewInfo.minorVersion) ?? [];
    aliasKeys.push(aliasKey);
    aliasKeysByMinor.set(previewInfo.minorVersion, aliasKeys);
    aliasKeysByNameAndMinor.set(previewInfo.nameKey, aliasKeysByMinor);
  }

  const staleAliasKeys = new Set<string>();

  for (const aliasKeysByMinor of aliasKeysByNameAndMinor.values()) {
    const sortedMinorVersions = [...aliasKeysByMinor.keys()].sort((left, right) => {
      return Number(left) - Number(right);
    });
    const totalAliasCount = sortedMinorVersions.reduce((total, minorVersion) => {
      return total + (aliasKeysByMinor.get(minorVersion)?.length ?? 0);
    }, 0);
    const preservedMinorVersion =
      Number(sortedMinorVersions[0]) <= MAX_LEGACY_MANUAL_GEMINI_MINOR_VERSION
        ? sortedMinorVersions[0]
        : null;
    const minimumMinorVersionsToPrune = preservedMinorVersion
      ? MIN_STALE_GUESSED_GEMINI_MINOR_VERSIONS
      : MIN_STALE_HIGH_ONLY_GEMINI_MINOR_VERSIONS;
    if (sortedMinorVersions.length < minimumMinorVersionsToPrune) {
      continue;
    }
    if (
      totalAliasCount <
      sortedMinorVersions.length * MIN_STALE_GUESSED_GEMINI_AVERAGE_VARIANTS_PER_MINOR
    ) {
      continue;
    }

    for (const minorVersion of sortedMinorVersions) {
      if (minorVersion === preservedMinorVersion) {
        continue;
      }

      const aliasKeys = aliasKeysByMinor.get(minorVersion) ?? [];
      for (const aliasKey of aliasKeys) {
        staleAliasKeys.add(aliasKey);
      }
    }
  }

  return staleAliasKeys;
}

export function extractPreservedAntigravityAliases(
  existingAliases: string,
  options?: { enableLegacyGeminiStaleCleanup?: boolean }
): PreservedAntigravityAliasesResult {
  if (!existingAliases.trim()) {
    return { yaml: '', prunedLegacyAliasCount: 0 };
  }

  const parsedEntries = parseExistingAntigravityAliases(existingAliases);
  const staleAliasKeys = options?.enableLegacyGeminiStaleCleanup
    ? buildLegacyGeneratedGeminiAliasPruneSet(parsedEntries)
    : new Set<string>();

  const preservedEntries = parsedEntries.filter((entry) => {
    const aliasKey = buildAntigravityAliasKey(entry);
    const generatedEntry = GENERATED_ANTIGRAVITY_ALIAS_MAP.get(aliasKey);

    if (generatedEntry) {
      return Boolean(entry.fork) && !generatedEntry.fork;
    }

    if (entry.fork) {
      return true;
    }

    return !staleAliasKeys.has(aliasKey);
  });

  return {
    yaml: serializeAntigravityAliases(preservedEntries),
    prunedLegacyAliasCount: parsedEntries.filter((entry) =>
      staleAliasKeys.has(buildAntigravityAliasKey(entry))
    ).length,
  };
}

export function writeLegacyGeminiAliasCleanupBackup(
  configPath: string,
  existingContent: string
): void {
  const backupPath = `${configPath}.pre-v16-gemini-alias-cleanup.bak`;
  if (fs.existsSync(backupPath)) {
    return;
  }

  fs.writeFileSync(backupPath, existingContent, { mode: 0o600 });
}

export function generateOAuthModelAliasSection(
  existingAliases?: string,
  configuredAliases?: CLIProxyOAuthModelAliasConfig
): string {
  const aliasEntries: OAuthModelAliasEntry[] = [];
  const aliasIndexByKey = new Map<string, number>();
  const normalizedConfiguredAliases = mergeOAuthModelAliases({}, configuredAliases);

  for (const alias of DEFAULT_ANTIGRAVITY_ALIASES) {
    addAliasEntry(aliasEntries, aliasIndexByKey, alias);
  }

  if (existingAliases) {
    const parsed = parseExistingAntigravityAliases(existingAliases);
    for (const alias of parsed) {
      addAliasEntry(aliasEntries, aliasIndexByKey, alias);
    }
  }

  for (const alias of normalizedConfiguredAliases.antigravity ?? []) {
    upsertConfiguredAliasEntry(aliasEntries, aliasIndexByKey, alias);
  }

  for (const alias of getCompatibilityAliases(aliasEntries)) {
    addAliasEntry(aliasEntries, aliasIndexByKey, alias);
  }

  const entries = aliasEntries
    .map((a) => {
      let entry = `    - name: ${a.name}\n      alias: ${a.alias}`;
      if (a.fork) entry += '\n      fork: true';
      return entry;
    })
    .join('\n');

  const existingAliasConfig = parseOAuthModelAliasSection(existingAliases ?? '');
  const mergedAliasConfig = mergeOAuthModelAliases(
    existingAliasConfig,
    normalizedConfiguredAliases
  );
  delete mergedAliasConfig.antigravity;
  const otherProviders = serializeOAuthModelAliasBody(mergedAliasConfig);

  return `oauth-model-alias:\n  antigravity:\n${entries}${otherProviders ? `\n${otherProviders}` : ''}`;
}
