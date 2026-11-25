/**
 * Droid Config Manager
 *
 * Read/write ~/.factory/settings.json safely.
 * Only touches ccs-* prefixed entries in customModels[].
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as lockfile from 'proper-lockfile';
import { getModelThinkingSupport } from '../cliproxy/model-catalog';
import { validateThinking } from '../cliproxy/thinking-validator';
import { ConfigError, ValidationError } from '../errors/error-types';
import { stripModelConfigurationSuffixes } from '../shared/extended-context-utils';

const CCS_MODEL_PREFIX = 'ccs-';
const CCS_DISPLAY_PREFIX = 'CCS ';

/** Lock configuration for concurrent write safety */
const LOCK_STALE_MS = 10000;
const LOCK_RETRY_MIN_MS = 200;
const LOCK_RETRY_MAX_MS = 1000;

/**
 * Validate profile name to prevent filesystem/security issues.
 * Only alphanumeric, dot, underscore, hyphen allowed.
 */
function isValidProfileName(profile: string): boolean {
  return !!profile && /^[a-zA-Z0-9._-]+$/.test(profile);
}

function validateProfileName(profile: string): void {
  if (!isValidProfileName(profile)) {
    throw new ValidationError(
      `Invalid profile name "${profile}": must contain only alphanumeric characters, dots, underscores, or hyphens`,
      'profile'
    );
  }
}

export interface DroidCustomModel {
  model: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  provider: 'anthropic' | 'openai' | 'generic-chat-completion-api';
  maxOutputTokens?: number;
  reasoningOverride?: string | number;
}

export interface DroidManagedModelRef {
  profile: string;
  displayName: string;
  index: number;
  selectorAlias: string;
  selector: string;
}

interface DroidSettings {
  model?: string;
  customModels?: DroidCustomModelEntry[];
  [key: string]: unknown;
}

interface DroidCustomModelEntry {
  model: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  provider: string;
  maxOutputTokens?: number;
  extraArgs?: Record<string, unknown>;
  extra_args?: Record<string, unknown>;
  /** Internal alias used by CCS for lookup. Stored as the model's display name prefix. */
  [key: string]: unknown;
}

const DROID_REASONING_OFF_VALUES = new Set(['off', 'none', 'disabled', '0']);
const DROID_ANTHROPIC_BUDGET_BY_EFFORT: Record<string, number> = {
  minimal: 4000,
  low: 4000,
  medium: 12000,
  high: 30000,
  max: 50000,
  xhigh: 64000,
  auto: 30000,
};

function isSupportedProvider(value: string): value is DroidCustomModel['provider'] {
  return value === 'anthropic' || value === 'openai' || value === 'generic-chat-completion-api';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDroidCustomModelEntry(value: unknown): value is DroidCustomModelEntry {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.displayName === 'string' &&
    record.displayName.trim() !== '' &&
    typeof record.model === 'string' &&
    typeof record.baseUrl === 'string' &&
    typeof record.apiKey === 'string' &&
    typeof record.provider === 'string' &&
    record.provider.trim() !== ''
  );
}

function isManagedDisplayName(displayName: string): boolean {
  return displayName.startsWith(CCS_DISPLAY_PREFIX) || displayName.startsWith(CCS_MODEL_PREFIX);
}

function parseManagedProfile(displayName: string): string | null {
  let profile: string | null = null;

  if (displayName.startsWith(CCS_DISPLAY_PREFIX)) {
    profile = displayName.slice(CCS_DISPLAY_PREFIX.length).trim();
  } else if (displayName.startsWith(CCS_MODEL_PREFIX)) {
    profile = displayName.slice(CCS_MODEL_PREFIX.length).trim();
  }

  if (!profile || !isValidProfileName(profile)) return null;
  return profile;
}

function asModelEntry(value: unknown): DroidCustomModelEntry | null {
  return isDroidCustomModelEntry(value) ? value : null;
}

function isReasoningOffValue(value: string | number): boolean {
  if (typeof value === 'number') return value <= 0;
  const normalized = value.trim().toLowerCase();
  return DROID_REASONING_OFF_VALUES.has(normalized);
}

function toAnthropicBudget(value: string | number): number {
  if (typeof value === 'number') {
    return Math.max(1024, Math.floor(value));
  }

  const normalized = value.trim().toLowerCase();
  if (/^\d+$/.test(normalized)) {
    return Math.max(1024, Number.parseInt(normalized, 10));
  }

  return DROID_ANTHROPIC_BUDGET_BY_EFFORT[normalized] ?? DROID_ANTHROPIC_BUDGET_BY_EFFORT.high;
}

function resolveAnthropicModelId(model: string): string {
  return stripModelConfigurationSuffixes(model);
}

function usesAnthropicAdaptiveThinking(model: string): boolean {
  return getModelThinkingSupport('claude', resolveAnthropicModelId(model))?.type === 'levels';
}

function toAnthropicAdaptiveEffort(model: string, value: string | number): string | undefined {
  const validation = validateThinking('claude', resolveAnthropicModelId(model), value);
  if (isReasoningOffValue(validation.value)) {
    return undefined;
  }

  const normalized = String(validation.value).trim().toLowerCase();
  return normalized === 'auto' ? undefined : normalized;
}

function toReasoningEffort(value: string | number): string {
  if (typeof value === 'number') {
    if (value <= 4000) return 'low';
    if (value <= 12000) return 'medium';
    if (value <= 30000) return 'high';
    if (value <= 50000) return 'max';
    return 'xhigh';
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) return 'high';
  return normalized;
}

function applyReasoningOverride(
  entry: DroidCustomModelEntry,
  provider: DroidCustomModel['provider'],
  reasoningOverride: string | number
): void {
  const extraArgsKey: 'extraArgs' | 'extra_args' = Object.prototype.hasOwnProperty.call(
    entry,
    'extra_args'
  )
    ? 'extra_args'
    : 'extraArgs';
  const currentExtraArgs = entry[extraArgsKey];
  const extraArgs = isObject(currentExtraArgs) ? { ...currentExtraArgs } : {};

  // Normalize legacy aliases before writing provider-specific shape.
  delete extraArgs.reasoningEffort;

  if (provider === 'anthropic') {
    delete extraArgs.reasoning;
    delete extraArgs.reasoning_effort;

    if (isReasoningOffValue(reasoningOverride)) {
      delete extraArgs.thinking;
      delete extraArgs.output_config;
    } else if (usesAnthropicAdaptiveThinking(entry.model)) {
      const thinking = isObject(extraArgs.thinking) ? { ...extraArgs.thinking } : {};
      const outputConfig = isObject(extraArgs.output_config) ? { ...extraArgs.output_config } : {};
      const effort = toAnthropicAdaptiveEffort(entry.model, reasoningOverride);

      thinking.type = 'adaptive';
      delete thinking.budget_tokens;
      delete thinking.budgetTokens;

      if (effort) {
        outputConfig.effort = effort;
      } else {
        delete outputConfig.effort;
      }

      extraArgs.thinking = thinking;
      if (Object.keys(outputConfig).length > 0) {
        extraArgs.output_config = outputConfig;
      } else {
        delete extraArgs.output_config;
      }
    } else {
      const thinking = isObject(extraArgs.thinking) ? { ...extraArgs.thinking } : {};
      thinking.type = 'enabled';
      thinking.budget_tokens = toAnthropicBudget(reasoningOverride);
      delete thinking.budgetTokens;
      extraArgs.thinking = thinking;
      delete extraArgs.output_config;
    }
  } else if (provider === 'openai') {
    delete extraArgs.reasoning_effort;
    delete extraArgs.thinking;

    if (isReasoningOffValue(reasoningOverride)) {
      delete extraArgs.reasoning;
    } else {
      const reasoning = isObject(extraArgs.reasoning) ? { ...extraArgs.reasoning } : {};
      reasoning.effort = toReasoningEffort(reasoningOverride);
      extraArgs.reasoning = reasoning;
    }
  } else {
    delete extraArgs.reasoning;
    delete extraArgs.thinking;

    if (isReasoningOffValue(reasoningOverride)) {
      delete extraArgs.reasoning_effort;
    } else {
      extraArgs.reasoning_effort = toReasoningEffort(reasoningOverride);
    }
  }

  if (Object.keys(extraArgs).length === 0) {
    delete entry.extraArgs;
    delete entry.extra_args;
    return;
  }

  entry[extraArgsKey] = extraArgs;
}

function buildSelectorAlias(displayName: string, index: number): string {
  const normalizedDisplayName = displayName.trim().replace(/\s+/g, '-');
  return `${normalizedDisplayName}-${index}`;
}

function normalizeCustomModels(value: unknown): DroidCustomModelEntry[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => asModelEntry(entry))
      .filter((entry): entry is DroidCustomModelEntry => !!entry);
  }

  // Accept legacy object-map shapes and normalize to array.
  if (value && typeof value === 'object') {
    return Object.values(value)
      .map((entry) => asModelEntry(entry))
      .filter((entry): entry is DroidCustomModelEntry => !!entry);
  }

  return [];
}

/**
 * Get path to ~/.factory/settings.json.
 * Respects CCS_HOME for test isolation (uses CCS_HOME/.factory/ in tests).
 */
function getFactoryDir(): string {
  const base = process.env.CCS_HOME || os.homedir();
  return path.join(base, '.factory');
}

function getSettingsPath(): string {
  return path.join(getFactoryDir(), 'settings.json');
}

/**
 * Ensure ~/.factory/ directory exists.
 */
function ensureFactoryDir(): void {
  const dir = getFactoryDir();
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code !== 'EEXIST') throw error;
  }
}

function getNoFollowFlag(): number {
  const candidate = (fs.constants as Record<string, number>)['O_NOFOLLOW'];
  if (process.platform !== 'win32' && typeof candidate === 'number') {
    return candidate;
  }
  return 0;
}

function openFileNoFollow(filePath: string, flags: number, mode?: number): number {
  const safeFlags = flags | getNoFollowFlag();
  if (mode === undefined) {
    return fs.openSync(filePath, safeFlags);
  }
  return fs.openSync(filePath, safeFlags, mode);
}

function readFileUtf8NoFollow(filePath: string): string {
  const fd = openFileNoFollow(filePath, fs.constants.O_RDONLY);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) {
      throw new ConfigError('Refusing to read: settings.json is not a regular file', filePath);
    }
    return fs.readFileSync(fd, 'utf8');
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Read ~/.factory/settings.json, creating empty structure if missing.
 */
function readDroidSettings(): DroidSettings {
  const settingsPath = getSettingsPath();
  if (!fs.existsSync(settingsPath)) {
    return { customModels: [] };
  }

  const fileStat = fs.lstatSync(settingsPath);
  if (fileStat.isSymbolicLink()) {
    throw new ConfigError('Refusing to read: settings.json is a symlink', settingsPath);
  }
  if (!fileStat.isFile()) {
    throw new ConfigError('Refusing to read: settings.json is not a regular file', settingsPath);
  }

  const raw = readFileUtf8NoFollow(settingsPath);
  try {
    const parsed = JSON.parse(raw) as DroidSettings;
    return {
      ...parsed,
      customModels: normalizeCustomModels((parsed as { customModels?: unknown }).customModels),
    };
  } catch {
    // Corrupted file — preserve as backup, start fresh
    const backup = settingsPath + '.bak';
    try {
      fs.copyFileSync(settingsPath, backup);
      fs.chmodSync(backup, 0o600); // Secure backup permissions
      console.warn(`[!] Corrupted ${settingsPath}, backed up to ${backup}`);
    } catch (error) {
      console.warn(`[!] Corrupted ${settingsPath}; backup failed: ${(error as Error).message}`);
    }
    return { customModels: [] };
  }
}

async function acquireFactoryLock(retries: number): Promise<() => Promise<void>> {
  ensureFactoryDir();
  const factoryDir = getFactoryDir();
  try {
    return await lockfile.lock(factoryDir, {
      stale: LOCK_STALE_MS,
      retries: { retries, minTimeout: LOCK_RETRY_MIN_MS, maxTimeout: LOCK_RETRY_MAX_MS },
    });
  } catch (error) {
    throw new ConfigError(
      `Failed to lock Droid settings directory (${factoryDir}): ${(error as Error).message}`,
      factoryDir
    );
  }
}

function fsyncDir(dirPath: string): void {
  try {
    const dirFd = fs.openSync(dirPath, fs.constants.O_RDONLY);
    try {
      fs.fsyncSync(dirFd);
    } finally {
      fs.closeSync(dirFd);
    }
  } catch {
    // Best-effort directory fsync (platform dependent).
  }
}

/**
 * Write ~/.factory/settings.json atomically with safe permissions.
 * Uses temp file + rename for atomicity on same filesystem.
 */
function writeDroidSettings(settings: DroidSettings): void {
  ensureFactoryDir();
  const settingsPath = getSettingsPath();

  // Refuse to write if target is a symlink (prevents symlink attacks)
  if (fs.existsSync(settingsPath)) {
    const stat = fs.lstatSync(settingsPath);
    if (stat.isSymbolicLink()) {
      throw new ConfigError('Refusing to write: settings.json is a symlink', settingsPath);
    }
  }

  const tmpPath = settingsPath + '.tmp';
  if (fs.existsSync(tmpPath)) {
    const tmpStat = fs.lstatSync(tmpPath);
    if (tmpStat.isSymbolicLink()) {
      throw new ConfigError('Refusing to write: settings.json.tmp is a symlink', tmpPath);
    }
  }

  const payload = JSON.stringify(
    {
      ...settings,
      customModels: normalizeCustomModels((settings as { customModels?: unknown }).customModels),
    },
    null,
    2
  );
  const fd = openFileNoFollow(
    tmpPath,
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC,
    0o600
  );
  try {
    const tmpFdStat = fs.fstatSync(fd);
    if (!tmpFdStat.isFile()) {
      throw new ConfigError('Refusing to write: settings.json.tmp is not a regular file', tmpPath);
    }
    fs.writeFileSync(fd, payload + '\n', { encoding: 'utf8' });
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpPath, settingsPath);
  fsyncDir(path.dirname(settingsPath));

  // Fix permissions on existing file if world-readable
  try {
    const stat = fs.statSync(settingsPath);

    if (stat.mode & 0o077) {
      fs.chmodSync(settingsPath, 0o600);
      console.warn('[!] Fixed permissions on ~/.factory/settings.json (was world-readable)');
    }
  } catch {
    // Best-effort permission check
  }
}

/**
 * Upsert a CCS-managed custom model entry.
 * Acquires file lock to prevent concurrent write races.
 */
export async function upsertCcsModel(
  profile: string,
  model: DroidCustomModel
): Promise<DroidManagedModelRef> {
  validateProfileName(profile);
  ensureFactoryDir();

  let release: (() => Promise<void>) | undefined;
  let ref: DroidManagedModelRef | null = null;
  try {
    release = await acquireFactoryLock(10);

    const settings = readDroidSettings();
    settings.customModels = normalizeCustomModels(settings.customModels);

    // Find existing current or legacy entry for this profile.
    const idx = settings.customModels.findIndex(
      (m) => parseManagedProfile(m.displayName) === profile
    );

    const { reasoningOverride, ...modelWithoutReasoning } = model;
    const existingEntry = idx >= 0 ? settings.customModels[idx] : undefined;
    const entry: DroidCustomModelEntry = {
      ...(existingEntry ?? {}),
      ...modelWithoutReasoning,
      displayName: `CCS ${profile}`,
    };
    if (reasoningOverride !== undefined) {
      applyReasoningOverride(entry, model.provider, reasoningOverride);
    }

    if (idx >= 0) {
      settings.customModels[idx] = entry;
    } else {
      settings.customModels.push(entry);
    }

    const index = settings.customModels.findIndex(
      (entry) => parseManagedProfile(entry.displayName) === profile
    );
    const safeIndex = index >= 0 ? index : 0;
    const selectorAlias = buildSelectorAlias(entry.displayName, safeIndex);
    const selector = `custom:${selectorAlias}`;
    // Droid interactive mode uses settings.model for default model selection.
    settings.model = selector;
    writeDroidSettings(settings);
    ref = {
      profile,
      displayName: entry.displayName,
      index: safeIndex,
      selectorAlias,
      selector,
    };
  } finally {
    if (release) await release();
  }

  return (
    ref || {
      profile,
      displayName: `CCS ${profile}`,
      index: 0,
      selectorAlias: `CCS-${profile}-0`,
      selector: `custom:CCS-${profile}-0`,
    }
  );
}

/**
 * Remove a CCS-managed custom model entry.
 */
export async function removeCcsModel(profile: string): Promise<void> {
  validateProfileName(profile);
  ensureFactoryDir();
  const settingsPath = getSettingsPath();

  let release: (() => Promise<void>) | undefined;
  try {
    release = await acquireFactoryLock(3);
    if (!fs.existsSync(settingsPath)) return;

    const settings = readDroidSettings();
    settings.customModels = normalizeCustomModels(settings.customModels);

    settings.customModels = settings.customModels.filter(
      (m) => parseManagedProfile(m.displayName) !== profile
    );

    writeDroidSettings(settings);
  } finally {
    if (release) await release();
  }
}

/**
 * List all CCS-managed custom model entries.
 */
export async function listCcsModels(): Promise<Map<string, DroidCustomModel>> {
  const result = new Map<string, DroidCustomModel>();
  const settings = readDroidSettings();
  for (const entry of normalizeCustomModels(settings.customModels)) {
    const profile = parseManagedProfile(entry.displayName);
    if (!profile) continue;
    if (!isSupportedProvider(entry.provider)) continue;

    result.set(profile, {
      ...entry,
      provider: entry.provider,
    });
  }

  return result;
}

/**
 * Prune orphaned CCS entries from settings.json.
 * Removes ccs-* entries whose profile no longer exists in active profiles.
 */
export async function pruneOrphanedModels(activeProfiles: string[]): Promise<number> {
  // Snapshot at call time so caller-side mutation cannot affect filtering while lock is pending.
  const activeProfilesSnapshot = [...activeProfiles];

  ensureFactoryDir();
  const settingsPath = getSettingsPath();

  let release: (() => Promise<void>) | undefined;
  let removed = 0;

  try {
    release = await acquireFactoryLock(3);
    const activeProfileSet = new Set<string>();
    for (const profile of activeProfilesSnapshot) {
      validateProfileName(profile);
      activeProfileSet.add(profile);
    }

    if (!fs.existsSync(settingsPath)) return 0;

    const settings = readDroidSettings();
    settings.customModels = normalizeCustomModels(settings.customModels);

    const before = settings.customModels.length;
    settings.customModels = settings.customModels.filter((m) => {
      const profile = parseManagedProfile(m.displayName);
      if (profile) {
        return activeProfileSet.has(profile);
      }

      // Drop malformed managed entries; keep user-managed entries.
      return !isManagedDisplayName(m.displayName);
    });

    removed = before - settings.customModels.length;
    if (removed > 0) {
      writeDroidSettings(settings);
    }
  } finally {
    if (release) await release();
  }

  return removed;
}
