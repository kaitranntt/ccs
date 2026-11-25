/**
 * Settings File Migration & Provider Settings Repair Helpers
 */

import * as fs from 'fs';
import * as path from 'path';
import type { CLIProxyProvider } from '../../types';
import { CLIPROXY_DEFAULT_PORT } from '../port-manager';
import {
  getLegacyProviderSettingsPath,
  migrateLegacyProviderSettingsIfNeeded,
} from '../path-resolver';
import {
  canonicalizeModelIdForProvider,
  MODEL_ENV_VAR_KEYS,
  migrateDeniedAntigravityModelAliases,
  normalizeModelEnvVarsForProvider,
  normalizeIFlowLegacyModelAliases,
  normalizeModelIdForProvider,
} from '../../ai-providers/model-id-normalizer';
import { getCcsDir } from '../../../config/config-loader-facade';
import {
  CURSOR_LEGACY_ENV_OVERRIDE_KEYS,
  getClaudeEnvVars,
  isObjectRecord,
  normalizeLocalProviderBaseUrl,
  PRESET_MODEL_KEYS,
  type ProviderSettings,
  REQUIRED_CLAUDE_ENV_KEYS,
  REQUIRED_PROVIDER_ENV_KEYS,
} from './shared-helpers';

const DEPRECATED_MODEL_PREFIX = 'gemini-claude-';
const UPSTREAM_MODEL_PREFIX = 'claude-';
const CLAUDE_MODEL_MIGRATED_MARKER = '.claude-model-migrated';

const CLAUDE_STALE_MODEL_DEFAULTS: Record<string, Set<string>> = {
  ANTHROPIC_MODEL: new Set([
    'claude-sonnet-4-20250514',
    'claude-sonnet-4-5-20250929',
    'claude-sonnet-4-6',
  ]),
  ANTHROPIC_DEFAULT_OPUS_MODEL: new Set([
    'claude-opus-4-20250514',
    'claude-opus-4-5-20251101',
    'claude-opus-4-6',
    'claude-opus-4-7',
  ]),
  ANTHROPIC_DEFAULT_SONNET_MODEL: new Set([
    'claude-sonnet-4-20250514',
    'claude-sonnet-4-5-20250929',
    'claude-sonnet-4-6',
  ]),
  ANTHROPIC_DEFAULT_HAIKU_MODEL: new Set([
    'claude-haiku-3-5-20241022',
    'claude-haiku-4-5-20251001',
  ]),
};

export function migrateDeprecatedModelNames(
  settingsPath: string,
  provider: CLIProxyProvider,
  settings: ProviderSettings
): boolean {
  if (!settings.env || typeof settings.env !== 'object') return false;

  let migrated = false;
  for (const key of MODEL_ENV_VAR_KEYS) {
    const value = settings.env[key];
    if (typeof value !== 'string') continue;

    let canonical = value;
    if (canonical.toLowerCase().startsWith(DEPRECATED_MODEL_PREFIX)) {
      canonical = UPSTREAM_MODEL_PREFIX + canonical.slice(DEPRECATED_MODEL_PREFIX.length);
    }
    canonical = normalizeModelIdForProvider(canonical, provider);
    if (provider === 'agy') {
      canonical = migrateDeniedAntigravityModelAliases(canonical);
    }

    if (canonical !== value) {
      settings.env[key] = canonical;
      migrated = true;
    }
  }

  if (provider === 'agy' && Array.isArray(settings.presets)) {
    for (const preset of settings.presets) {
      if (!preset || typeof preset !== 'object') continue;
      const presetRecord = preset as Record<string, unknown>;

      for (const key of PRESET_MODEL_KEYS) {
        const value = presetRecord[key];
        if (typeof value !== 'string') continue;
        let canonical = normalizeModelIdForProvider(value, provider);
        canonical = migrateDeniedAntigravityModelAliases(canonical);
        if (canonical !== value) {
          presetRecord[key] = canonical;
          migrated = true;
        }
      }
    }
  }

  if (migrated) {
    try {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', { mode: 0o600 });
    } catch {
      // Best-effort migration — don't block startup if write fails
    }
  }

  return migrated;
}

export function migrateIFlowPlaceholderModel(
  settingsPath: string,
  provider: CLIProxyProvider,
  settings: ProviderSettings
): boolean {
  if (provider !== 'iflow') return false;
  if (!settings.env || typeof settings.env !== 'object') return false;

  let migrated = false;
  const replaceLegacyIFlowModel = (value: string): string =>
    normalizeIFlowLegacyModelAliases(value);

  for (const key of MODEL_ENV_VAR_KEYS) {
    const value = settings.env[key];
    if (typeof value !== 'string') continue;
    const replaced = replaceLegacyIFlowModel(value);
    if (replaced !== value) {
      settings.env[key] = replaced;
      migrated = true;
    }
  }

  if (Array.isArray(settings.presets)) {
    for (const preset of settings.presets) {
      if (!preset || typeof preset !== 'object') continue;
      const presetRecord = preset as Record<string, unknown>;

      for (const key of PRESET_MODEL_KEYS) {
        const value = presetRecord[key];
        if (typeof value !== 'string') continue;
        const replaced = replaceLegacyIFlowModel(value);
        if (replaced !== value) {
          presetRecord[key] = replaced;
          migrated = true;
        }
      }
    }
  }

  if (migrated) {
    try {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', { mode: 0o600 });
    } catch {
      // Best-effort migration — don't block startup if write fails
    }
  }

  return migrated;
}

function buildCursorProviderSettingsFromLegacy(
  legacySettings: Record<string, unknown>
): Record<string, unknown> {
  const defaultEnv = getClaudeEnvVars('cursor');
  const legacyEnvSource = legacySettings.env;
  const legacyEnv = isObjectRecord(legacyEnvSource) ? legacyEnvSource : {};
  const migratedEnv: NodeJS.ProcessEnv = { ...defaultEnv };

  for (const [key, value] of Object.entries(legacyEnv)) {
    if (typeof value !== 'string' || CURSOR_LEGACY_ENV_OVERRIDE_KEYS.has(key)) {
      continue;
    }
    migratedEnv[key] = value;
  }

  delete migratedEnv.ANTHROPIC_API_KEY;

  return {
    ...legacySettings,
    env: normalizeModelEnvVarsForProvider(migratedEnv, 'cursor'),
  };
}

export function resolveProviderSettingsPath(provider: CLIProxyProvider): string {
  const settingsPath = migrateLegacyProviderSettingsIfNeeded(provider);
  if (provider !== 'cursor' || fs.existsSync(settingsPath)) {
    return settingsPath;
  }

  const legacySettingsPath = getLegacyProviderSettingsPath(provider);
  if (!fs.existsSync(legacySettingsPath)) {
    return settingsPath;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(legacySettingsPath, 'utf-8')) as unknown;
    if (!isObjectRecord(parsed)) {
      return settingsPath;
    }

    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(buildCursorProviderSettingsFromLegacy(parsed), null, 2) + '\n',
      { mode: 0o600 }
    );
  } catch {
    // Best-effort migration only.
  }

  return settingsPath;
}

export function claudeModelMigrationDone(): boolean {
  try {
    return fs.existsSync(path.join(getCcsDir(), 'cliproxy', CLAUDE_MODEL_MIGRATED_MARKER));
  } catch {
    return true;
  }
}

function markClaudeModelMigrationDone(): void {
  try {
    const dir = path.join(getCcsDir(), 'cliproxy');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, CLAUDE_MODEL_MIGRATED_MARKER), new Date().toISOString(), {
      encoding: 'utf8',
      flag: 'w',
    });
  } catch {
    // Best-effort — failure to persist is not fatal.
  }
}

function migrateClaudeStaleModelPins(env: Record<string, string>): boolean {
  let mutated = false;
  for (const [key, staleValues] of Object.entries(CLAUDE_STALE_MODEL_DEFAULTS)) {
    if (staleValues.has(env[key])) {
      delete env[key];
      mutated = true;
    }
  }
  return mutated;
}

export function filterClaudeStaleModelPins(env: Record<string, string>): Record<string, string> {
  const result = { ...env };
  for (const [key, staleValues] of Object.entries(CLAUDE_STALE_MODEL_DEFAULTS)) {
    if (staleValues.has(result[key])) {
      delete result[key];
    }
  }
  return result;
}

export function ensureProviderSettings(provider: CLIProxyProvider): void {
  const settingsPath = resolveProviderSettingsPath(provider);
  const defaultEnv = getClaudeEnvVars(provider);

  const writeSettings = (settings: Record<string, unknown>): void => {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', {
      mode: 0o600,
    });
  };

  if (!fs.existsSync(settingsPath)) {
    writeSettings({ env: defaultEnv });
    if (provider === 'claude') {
      markClaudeModelMigrationDone();
    }
    return;
  }

  let rawContent = '';
  try {
    rawContent = fs.readFileSync(settingsPath, 'utf-8');
  } catch {
    return;
  }

  let parsed: Record<string, unknown>;
  try {
    const value = JSON.parse(rawContent) as unknown;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      parsed = value as Record<string, unknown>;
    } else {
      throw new SyntaxError('settings root must be an object');
    }
  } catch {
    const backupPath = `${settingsPath}.corrupt-${Date.now()}`;
    try {
      fs.writeFileSync(backupPath, rawContent || '', { mode: 0o600 });
    } catch {
      // Best effort only.
    }
    writeSettings({ env: defaultEnv });
    return;
  }

  const envCandidate = parsed.env;
  const mergedEnv: Record<string, string> =
    envCandidate && typeof envCandidate === 'object' && !Array.isArray(envCandidate)
      ? { ...(envCandidate as Record<string, string>) }
      : {};

  let mutated = !(envCandidate && typeof envCandidate === 'object' && !Array.isArray(envCandidate));

  if (provider === 'claude' && !claudeModelMigrationDone()) {
    if (migrateClaudeStaleModelPins(mergedEnv)) {
      mutated = true;
    }
    markClaudeModelMigrationDone();
  }

  const requiredKeys =
    provider === 'claude' ? REQUIRED_CLAUDE_ENV_KEYS : REQUIRED_PROVIDER_ENV_KEYS;
  for (const key of requiredKeys) {
    const current = mergedEnv[key];
    if (typeof current !== 'string' || current.trim().length === 0) {
      const fallback = defaultEnv[key];
      if (fallback) {
        mergedEnv[key] = fallback;
        mutated = true;
      }
    }
  }

  if (typeof mergedEnv.ANTHROPIC_BASE_URL === 'string') {
    const normalizedBaseUrl = normalizeLocalProviderBaseUrl(
      mergedEnv.ANTHROPIC_BASE_URL,
      provider,
      CLIPROXY_DEFAULT_PORT
    );
    if (normalizedBaseUrl !== mergedEnv.ANTHROPIC_BASE_URL) {
      mergedEnv.ANTHROPIC_BASE_URL = normalizedBaseUrl;
      mutated = true;
    }
  }

  for (const key of MODEL_ENV_VAR_KEYS) {
    const current = mergedEnv[key];
    if (typeof current !== 'string' || current.trim().length === 0) continue;
    let canonical = canonicalizeModelIdForProvider(current, provider);
    if (provider === 'agy') {
      canonical = migrateDeniedAntigravityModelAliases(canonical);
    }
    if (canonical !== current) {
      mergedEnv[key] = canonical;
      mutated = true;
    }
  }

  const presetsCandidate = parsed.presets;
  if (Array.isArray(presetsCandidate)) {
    for (const preset of presetsCandidate) {
      if (!preset || typeof preset !== 'object') continue;
      const presetRecord = preset as Record<string, unknown>;
      for (const key of PRESET_MODEL_KEYS) {
        const value = presetRecord[key];
        if (typeof value !== 'string') continue;
        let canonical = canonicalizeModelIdForProvider(value, provider);
        if (provider === 'agy') {
          canonical = migrateDeniedAntigravityModelAliases(canonical);
        }
        if (canonical !== value) {
          presetRecord[key] = canonical;
          mutated = true;
        }
      }
    }
  }

  if (!mutated) {
    return;
  }

  writeSettings({
    ...parsed,
    env: mergedEnv,
  });
}
