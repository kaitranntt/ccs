import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { detectDroidCli } from '../../targets/droid-detector';

const execFileAsync = promisify(execFile);
import type {
  DroidByokDiagnostics,
  DroidCustomModelDiagnostics,
  DroidDashboardDiagnostics,
  DroidRawSettingsResponse,
} from './compatible-cli-types';
import {
  JsonFileConflictError,
  JsonFileValidationError,
  probeJsonObjectFile,
  writeJsonObjectFileAtomic,
} from './compatible-cli-json-file-service';
import { getCompatibleCliDocsReference } from './compatible-cli-docs-registry';

interface DroidConfigPaths {
  settingsPath: string;
  settingsDisplayPath: string;
  legacyConfigPath: string;
  legacyConfigDisplayPath: string;
}

interface SaveDroidRawSettingsInput {
  rawText: string;
  expectedMtime?: number;
}

interface SaveDroidRawSettingsResult {
  success: true;
  mtime: number;
}

export {
  JsonFileConflictError as DroidRawSettingsConflictError,
  JsonFileValidationError as DroidRawSettingsValidationError,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asObject(value: unknown): Record<string, unknown> | null {
  return isObject(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseHost(value: string): string | null {
  try {
    return new URL(value).host || null;
  } catch {
    return null;
  }
}

export function maskApiKeyPreview(value: string): string {
  if (!value) return '';
  const suffix = value.slice(-4);
  return `***${suffix}`;
}

function isCcsManagedDisplayName(displayName: string): boolean {
  return displayName.startsWith('CCS ') || displayName.startsWith('ccs-');
}

export function resolveDroidConfigPaths(
  options: {
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    homeDir?: string;
  } = {}
): DroidConfigPaths {
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? os.homedir();

  const byokBase = env.CCS_HOME || homeDir;
  const settingsPath = path.join(byokBase, '.factory', 'settings.json');
  const legacyConfigPath = path.join(byokBase, '.factory', 'config.json');

  return {
    settingsPath,
    settingsDisplayPath: '~/.factory/settings.json',
    legacyConfigPath,
    legacyConfigDisplayPath: '~/.factory/config.json',
  };
}

async function getBinaryVersion(binaryPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(binaryPath, ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
    });
    return stdout.trim().split('\n')[0].trim();
  } catch {
    return null;
  }
}

export function summarizeDroidCustomModels(customModelsValue: unknown): DroidByokDiagnostics {
  const rows: DroidCustomModelDiagnostics[] = [];
  const providerBreakdown: Record<string, number> = {};
  let invalidModelEntryCount = 0;

  const source = Array.isArray(customModelsValue)
    ? customModelsValue
    : isObject(customModelsValue)
      ? Object.values(customModelsValue)
      : [];

  for (const item of source) {
    if (!isObject(item)) {
      invalidModelEntryCount += 1;
      continue;
    }

    const displayName = asString(item.displayName) ?? asString(item.model_display_name);
    const model = asString(item.model);
    const baseUrl = asString(item.baseUrl) ?? asString(item.base_url);
    const providerRaw = asString(item.provider);
    const apiKey = asString(item.apiKey) ?? asString(item.api_key);

    if (!displayName || !model || !baseUrl || !providerRaw) {
      invalidModelEntryCount += 1;
      continue;
    }

    const provider = providerRaw.toLowerCase();
    providerBreakdown[provider] = (providerBreakdown[provider] ?? 0) + 1;

    rows.push({
      displayName,
      model,
      provider,
      baseUrl,
      host: parseHost(baseUrl),
      maxOutputTokens: asNumber(item.maxOutputTokens) ?? asNumber(item.max_tokens),
      isCcsManaged: isCcsManagedDisplayName(displayName),
      apiKeyState: apiKey ? 'set' : 'missing',
      apiKeyPreview: apiKey ? maskApiKeyPreview(apiKey) : null,
    });
  }

  const ccsManagedCount = rows.filter((row) => row.isCcsManaged).length;

  return {
    activeModelSelector: null,
    customModelCount: rows.length,
    ccsManagedCount,
    userManagedCount: rows.length - ccsManagedCount,
    invalidModelEntryCount,
    providerBreakdown,
    customModels: rows,
  };
}

function resolveCustomModelsValue(settings: Record<string, unknown> | null): unknown {
  if (!settings) return undefined;
  const modern = settings.customModels;
  if (Array.isArray(modern) || isObject(modern)) return modern;

  const legacy = settings.custom_models;
  if (Array.isArray(legacy) || isObject(legacy)) return legacy;
  return undefined;
}

function usesLegacyCustomModelsKey(settings: Record<string, unknown> | null): boolean {
  if (!settings) return false;
  const modern = settings.customModels;
  if (Array.isArray(modern) || isObject(modern)) return false;

  const legacy = settings.custom_models;
  return Array.isArray(legacy) || isObject(legacy);
}

export async function getDroidDashboardDiagnostics(): Promise<DroidDashboardDiagnostics> {
  const paths = resolveDroidConfigPaths();
  const binaryPath = detectDroidCli();
  const docsReference = getCompatibleCliDocsReference('droid');

  const source = process.env.CCS_DROID_PATH ? 'CCS_DROID_PATH' : binaryPath ? 'PATH' : 'missing';

  const [settingsProbe, legacyConfigProbe, binaryVersion] = await Promise.all([
    probeJsonObjectFile(paths.settingsPath, 'BYOK settings', paths.settingsDisplayPath),
    probeJsonObjectFile(paths.legacyConfigPath, 'Legacy config', paths.legacyConfigDisplayPath),
    binaryPath ? getBinaryVersion(binaryPath) : Promise.resolve(null),
  ]);

  const settingsJson = asObject(settingsProbe.json);
  const legacyJson = asObject(legacyConfigProbe.json);
  const settingsCustomModels = resolveCustomModelsValue(settingsJson);
  const legacyCustomModels = resolveCustomModelsValue(legacyJson);
  const byok = summarizeDroidCustomModels(settingsCustomModels ?? legacyCustomModels);
  byok.activeModelSelector = asString(settingsProbe.json?.model);

  const warnings: string[] = [];
  if (!binaryPath) warnings.push('Droid binary is not detected in PATH or CCS_DROID_PATH.');
  if (settingsProbe.diagnostics.parseError) {
    warnings.push('~/.factory/settings.json contains invalid JSON.');
  }
  if (byok.invalidModelEntryCount > 0) {
    warnings.push(`${byok.invalidModelEntryCount} customModels entries are malformed.`);
  }
  if (legacyConfigProbe.diagnostics.parseError) {
    warnings.push('Legacy Droid config (~/.factory/config.json) JSON is invalid.');
  }
  if (usesLegacyCustomModelsKey(settingsJson)) {
    warnings.push(
      'settings.json uses legacy "custom_models" key; prefer "customModels" for forward compatibility.'
    );
  }

  return {
    binary: {
      installed: !!binaryPath,
      path: binaryPath,
      installDir: binaryPath ? path.dirname(binaryPath) : null,
      source,
      version: binaryVersion,
      overridePath: process.env.CCS_DROID_PATH || null,
    },
    files: {
      settings: settingsProbe.diagnostics,
      legacyConfig: legacyConfigProbe.diagnostics,
    },
    byok,
    warnings,
    docsReference,
  };
}

export async function getDroidRawSettings(): Promise<DroidRawSettingsResponse> {
  const paths = resolveDroidConfigPaths();
  const settingsProbe = await probeJsonObjectFile(
    paths.settingsPath,
    'BYOK settings',
    paths.settingsDisplayPath
  );

  return {
    path: paths.settingsDisplayPath,
    resolvedPath: paths.settingsPath,
    exists: settingsProbe.diagnostics.exists,
    mtime: settingsProbe.diagnostics.mtimeMs ?? Date.now(),
    rawText: settingsProbe.rawText,
    settings: settingsProbe.json,
    parseError: settingsProbe.diagnostics.parseError,
  };
}

export async function saveDroidRawSettings(
  input: SaveDroidRawSettingsInput
): Promise<SaveDroidRawSettingsResult> {
  const paths = resolveDroidConfigPaths();
  if (typeof input.rawText !== 'string') {
    throw new JsonFileValidationError('rawText must be a string.');
  }

  const saved = await writeJsonObjectFileAtomic({
    filePath: paths.settingsPath,
    rawText: input.rawText,
    expectedMtime: input.expectedMtime,
    fileLabel: 'settings.json',
  });
  return { success: true, mtime: saved.mtime };
}
