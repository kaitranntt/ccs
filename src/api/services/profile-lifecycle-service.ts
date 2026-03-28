/**
 * API profile lifecycle service.
 *
 * Discovery, registration, copy, export, and import for API profiles.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Config, Settings } from '../../types';
import type { TargetType } from '../../targets/target-adapter';
import { getPersistedTargetChoices, isPersistedTargetType } from '../../targets/target-metadata';
import { getCcsDir, getConfigPath, loadConfigSafe } from '../../utils/config-manager';
import { ensureProfileHooksOrThrow } from '../../utils/websearch/profile-hook-injector';
import { isSensitiveKey } from '../../utils/sensitive-keys';
import { isReservedName } from '../../config/reserved-names';
import { isUnifiedMode, mutateUnifiedConfig } from '../../config/unified-config-loader';
import { validateApiName } from './validation-service';
import { listApiProfiles } from './profile-reader';
import { validateApiProfileSettingsPayload } from './profile-lifecycle-validation';
import type {
  ApiProfileExportBundle,
  CopyApiProfileResult,
  DiscoverApiProfileOrphansResult,
  ExportApiProfileResult,
  ImportApiProfileResult,
  RegisterApiProfileOrphansResult,
} from './profile-types';

const SETTINGS_FILE_SUFFIX = '.settings.json';
const REDACTED_TOKEN_SENTINEL = '__CCS_REDACTED__';

function parseTargetValue(value: unknown): TargetType | null {
  if (isPersistedTargetType(value)) {
    return value;
  }
  return null;
}

function validateProfileNameForPath(name: string, label: string): string | null {
  const validationError = validateApiName(name);
  if (validationError) {
    return `Invalid ${label} profile name "${name}": ${validationError}`;
  }
  return null;
}

function getProfileSettingsPath(name: string): string {
  return path.join(getCcsDir(), `${name}${SETTINGS_FILE_SUFFIX}`);
}

function writeJsonObjectAtomically(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(tempPath, filePath);
}

function registerApiProfileInConfig(name: string, target: TargetType, force = false): void {
  if (isUnifiedMode()) {
    mutateUnifiedConfig((config) => {
      if (config.profiles[name] && !force) {
        throw new Error(`API profile already exists: ${name}`);
      }

      config.profiles[name] = {
        type: 'api',
        settings: `~/.ccs/${name}${SETTINGS_FILE_SUFFIX}`,
        ...(target !== 'claude' && { target }),
      };
    });
    return;
  }

  const configPath = getConfigPath();
  const config = loadConfigSafe() as Config;
  if (config.profiles[name] && !force) {
    throw new Error(`API profile already exists: ${name}`);
  }

  config.profiles[name] = `~/.ccs/${name}${SETTINGS_FILE_SUFFIX}`;
  config.profile_targets = config.profile_targets || {};
  if (target === 'claude') {
    delete config.profile_targets[name];
  } else {
    config.profile_targets[name] = target;
  }

  writeJsonObjectAtomically(configPath, config);
}

function getRegisteredSettingsFileNames(): Set<string> {
  const { profiles, variants } = listApiProfiles();
  const names = new Set<string>();

  for (const profile of profiles) {
    names.add(`${profile.name}${SETTINGS_FILE_SUFFIX}`);
  }

  for (const variant of variants) {
    if (!variant.settings || variant.settings === '-') continue;
    names.add(path.basename(variant.settings.replace(/^~\/\.ccs\//, '')));
  }

  return names;
}

function getProfileTarget(name: string): TargetType {
  const { profiles } = listApiProfiles();
  return profiles.find((profile) => profile.name === name)?.target || 'claude';
}

function readJsonObject(filePath: string): Record<string, unknown> {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Settings file must contain a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

function rollbackSettingsFile(
  filePath: string,
  previousContent: string | null,
  existedBefore: boolean
): void {
  if (existedBefore && previousContent !== null) {
    fs.writeFileSync(filePath, previousContent, 'utf8');
    return;
  }

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function discoverApiProfileOrphans(): DiscoverApiProfileOrphansResult {
  const ccsDir = getCcsDir();
  if (!fs.existsSync(ccsDir)) {
    return { orphans: [] };
  }

  const registeredSettings = getRegisteredSettingsFileNames();
  const files = fs.readdirSync(ccsDir).filter((file) => file.endsWith(SETTINGS_FILE_SUFFIX));
  const ignoredNames = new Set(['cursor.settings.json']);

  const orphans = files
    .filter((file) => !registeredSettings.has(file))
    .filter((file) => !file.startsWith('base-'))
    .filter((file) => !ignoredNames.has(file))
    .filter((file) => !isReservedName(file.slice(0, -SETTINGS_FILE_SUFFIX.length)))
    .map((file) => {
      const name = file.slice(0, -SETTINGS_FILE_SUFFIX.length);
      const settingsPath = path.join(ccsDir, file);

      try {
        const settings = readJsonObject(settingsPath);
        return {
          name,
          settingsPath,
          validation: validateApiProfileSettingsPayload(settings),
        };
      } catch (error) {
        return {
          name,
          settingsPath,
          validation: {
            valid: false,
            issues: [
              {
                level: 'error' as const,
                code: 'invalid_json',
                message: (error as Error).message,
                field: 'settings',
                hint: 'Fix JSON syntax before registration.',
              },
            ],
          },
        };
      }
    });

  return { orphans };
}

export function registerApiProfileOrphans(options?: {
  names?: string[];
  target?: TargetType;
  force?: boolean;
}): RegisterApiProfileOrphansResult {
  const discovered = discoverApiProfileOrphans();
  const selected =
    options?.names === undefined
      ? discovered.orphans
      : discovered.orphans.filter((orphan) => options.names?.includes(orphan.name));

  const result: RegisterApiProfileOrphansResult = { registered: [], skipped: [] };
  for (const orphan of selected) {
    const nameError = validateApiName(orphan.name);
    if (nameError) {
      result.skipped.push({
        name: orphan.name,
        reason: `Invalid profile name: ${nameError}`,
      });
      continue;
    }

    if (!options?.force && !orphan.validation.valid) {
      result.skipped.push({
        name: orphan.name,
        reason: 'Validation failed. Use --force to register.',
      });
      continue;
    }

    try {
      if (orphan.validation.valid) {
        ensureProfileHooksOrThrow(orphan.name);
      }
      registerApiProfileInConfig(orphan.name, options?.target || 'claude', options?.force || false);
      result.registered.push(orphan.name);
    } catch (error) {
      result.skipped.push({ name: orphan.name, reason: (error as Error).message });
    }
  }

  return result;
}

export function copyApiProfile(
  source: string,
  destination: string,
  options?: { target?: TargetType; force?: boolean }
): CopyApiProfileResult {
  const sourceError = validateProfileNameForPath(source, 'source');
  if (sourceError) return { success: false, error: sourceError };

  const destinationError = validateApiName(destination);
  if (destinationError) return { success: false, error: destinationError };

  const sourceSettingsPath = getProfileSettingsPath(source);
  if (!fs.existsSync(sourceSettingsPath)) {
    return { success: false, error: `Source profile settings not found: ${source}` };
  }

  const destinationSettingsPath = getProfileSettingsPath(destination);
  if (fs.existsSync(destinationSettingsPath) && !options?.force) {
    return { success: false, error: `Destination settings already exist: ${destination}` };
  }

  try {
    const sourceSettings = readJsonObject(sourceSettingsPath) as Settings;
    const validation = validateApiProfileSettingsPayload(sourceSettings);
    if (!validation.valid && !options?.force) {
      return {
        success: false,
        error: 'Source profile has validation errors. Use --force to copy.',
      };
    }

    const destinationExisted = fs.existsSync(destinationSettingsPath);
    const previousDestinationContent = destinationExisted
      ? fs.readFileSync(destinationSettingsPath, 'utf8')
      : null;

    writeJsonObjectAtomically(destinationSettingsPath, sourceSettings);
    try {
      ensureProfileHooksOrThrow(destination);
    } catch (hookError) {
      rollbackSettingsFile(destinationSettingsPath, previousDestinationContent, destinationExisted);
      throw hookError;
    }
    try {
      registerApiProfileInConfig(
        destination,
        options?.target || getProfileTarget(source),
        options?.force
      );
    } catch (registrationError) {
      rollbackSettingsFile(destinationSettingsPath, previousDestinationContent, destinationExisted);
      throw registrationError;
    }

    return {
      success: true,
      name: destination,
      settingsPath: destinationSettingsPath,
      warnings: validation.issues
        .filter((issue) => issue.level === 'warning')
        .map((issue) => issue.message),
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export function exportApiProfile(name: string, includeSecrets = false): ExportApiProfileResult {
  const nameError = validateProfileNameForPath(name, 'profile');
  if (nameError) return { success: false, error: nameError };

  const settingsPath = getProfileSettingsPath(name);
  if (!fs.existsSync(settingsPath)) {
    return { success: false, error: `Profile settings not found: ${name}` };
  }

  try {
    const settings = readJsonObject(settingsPath);
    let redacted = false;
    if (!includeSecrets) {
      const env = settings.env;
      if (typeof env === 'object' && env !== null) {
        for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
          if (!isSensitiveKey(key) || typeof value !== 'string') continue;
          (env as Record<string, unknown>)[key] = REDACTED_TOKEN_SENTINEL;
          redacted = true;
        }
      }
    }

    const bundle: ApiProfileExportBundle = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      profile: {
        name,
        target: getProfileTarget(name),
      },
      settings,
    };

    return { success: true, bundle, redacted };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export function importApiProfileBundle(
  bundle: unknown,
  options?: { name?: string; target?: TargetType; force?: boolean }
): ImportApiProfileResult {
  if (typeof bundle !== 'object' || bundle === null || Array.isArray(bundle)) {
    return { success: false, error: 'Import bundle must be a JSON object.' };
  }

  const input = bundle as Partial<ApiProfileExportBundle>;
  if (input.schemaVersion !== 1 || !input.profile || !input.settings) {
    return {
      success: false,
      error: 'Invalid bundle schema. Expected schemaVersion=1 with profile and settings.',
    };
  }

  const name = options?.name || input.profile.name;
  const nameError = validateApiName(name);
  if (nameError) return { success: false, error: nameError };

  const bundleTarget = parseTargetValue(input.profile.target);
  if (input.profile.target !== undefined && bundleTarget === null) {
    return {
      success: false,
      error: `Invalid bundle profile target. Expected: ${getPersistedTargetChoices()}.`,
    };
  }

  const settings = JSON.parse(JSON.stringify(input.settings)) as Record<string, unknown>;
  const env = settings.env as Record<string, unknown> | undefined;
  const warnings: string[] = [];
  if (env) {
    const redactedKeys = Object.entries(env)
      .filter(([key, value]) => isSensitiveKey(key) && value === REDACTED_TOKEN_SENTINEL)
      .map(([key]) => key);
    if (redactedKeys.length > 0) {
      for (const key of redactedKeys) {
        env[key] = '';
      }
      warnings.push(
        `Imported bundle had redacted values for ${redactedKeys.join(', ')}. Set secrets before use.`
      );
    }
  }

  const validation = validateApiProfileSettingsPayload(settings);
  if (!validation.valid && !options?.force) {
    return { success: false, error: 'Import validation failed.', validation };
  }

  const settingsPath = getProfileSettingsPath(name);
  try {
    const settingsExisted = fs.existsSync(settingsPath);
    const previousSettingsContent = settingsExisted ? fs.readFileSync(settingsPath, 'utf8') : null;

    writeJsonObjectAtomically(settingsPath, settings);
    try {
      ensureProfileHooksOrThrow(name);
    } catch (hookError) {
      rollbackSettingsFile(settingsPath, previousSettingsContent, settingsExisted);
      throw hookError;
    }
    try {
      registerApiProfileInConfig(name, options?.target || bundleTarget || 'claude', options?.force);
    } catch (registrationError) {
      rollbackSettingsFile(settingsPath, previousSettingsContent, settingsExisted);
      throw registrationError;
    }

    warnings.push(
      ...validation.issues
        .filter((issue) => issue.level === 'warning')
        .map((issue) => issue.message)
    );

    return { success: true, name, warnings, validation };
  } catch (error) {
    return { success: false, error: (error as Error).message, validation };
  }
}
