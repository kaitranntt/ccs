import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import {
  buildClaudeExtensionSettingsObject,
  resolveClaudeExtensionSetup,
} from '../../shared/claude-extension-setup';
import {
  type ClaudeExtensionHost,
  getClaudeExtensionHostDefinition,
} from '../../shared/claude-extension-hosts';
import { getClaudeSettingsPath } from '../../utils/claude-config-path';
import { expandPath } from '../../utils/helpers';
import {
  getClaudeExtensionManagedEnvManifest,
  updateClaudeExtensionManagedEnvManifest,
  type ClaudeExtensionBinding,
} from './claude-extension-binding-service';

export type ClaudeExtensionActionTarget = 'shared' | 'ide' | 'all';
export type ClaudeExtensionFileState = 'applied' | 'drifted' | 'missing' | 'unconfigured';

export interface ClaudeExtensionTargetStatus {
  target: 'shared' | 'ide';
  path: string;
  exists: boolean;
  mtime: number | null;
  state: ClaudeExtensionFileState;
  message: string;
}

export interface ClaudeExtensionBindingStatus {
  bindingId: string;
  sharedSettings: ClaudeExtensionTargetStatus;
  ideSettings: ClaudeExtensionTargetStatus;
}

interface JsonDocument {
  exists: boolean;
  data: Record<string, unknown>;
  mtime: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sortStringRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right))
  );
}

function toStringRecord(record: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string') {
      normalized[key] = value;
    }
  }
  return normalized;
}

function uniqueFileNonce(): string {
  return `${process.pid}-${Date.now()}-${randomUUID()}`;
}

function stripJsonComments(input: string): string {
  let output = '';
  let inString = false;
  let escaping = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const nextChar = input[index + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        output += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        index += 1;
        continue;
      }
      if (char === '\n') {
        output += char;
      }
      continue;
    }

    if (inString) {
      output += char;
      if (escaping) {
        escaping = false;
      } else if (char === '\\') {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }

    if (char === '/' && nextChar === '/') {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }

    output += char;
  }

  return output;
}

function stripTrailingCommas(input: string): string {
  let output = '';
  let inString = false;
  let escaping = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (inString) {
      output += char;
      if (escaping) {
        escaping = false;
      } else if (char === '\\') {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }

    if (char === ',') {
      let lookahead = index + 1;
      while (lookahead < input.length && /\s/.test(input[lookahead])) {
        lookahead += 1;
      }

      if (input[lookahead] === '}' || input[lookahead] === ']') {
        continue;
      }
    }

    output += char;
  }

  return output;
}

function parseJsonDocumentObject(raw: string, filePath: string): Record<string, unknown> {
  const normalized = stripTrailingCommas(stripJsonComments(raw));

  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized) as unknown;
  } catch (error) {
    throw new Error(`Failed to parse ${filePath}: ${(error as Error).message}`);
  }

  if (!isRecord(parsed)) {
    throw new Error(`Expected a JSON object in ${filePath}`);
  }

  return parsed;
}

function readJsonDocument(filePath: string): JsonDocument {
  if (!fs.existsSync(filePath)) {
    return { exists: false, data: {}, mtime: null };
  }

  if (fs.lstatSync(filePath).isSymbolicLink()) {
    throw new Error(`Refusing to manage symlinked file: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf8');

  return {
    exists: true,
    data: parseJsonDocumentObject(raw, filePath),
    mtime: fs.statSync(filePath).mtimeMs,
  };
}

function backupIfPresent(filePath: string, suffix: string): void {
  if (!fs.existsSync(filePath)) return;
  const backupPath = `${filePath}.${suffix}.${uniqueFileNonce()}`;
  fs.copyFileSync(filePath, backupPath, fs.constants.COPYFILE_EXCL);
}

function writeJsonDocument(
  filePath: string,
  data: Record<string, unknown>,
  backupSuffix: string
): void {
  if (fs.existsSync(filePath) && fs.lstatSync(filePath).isSymbolicLink()) {
    throw new Error(`Refusing to manage symlinked file: ${filePath}`);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  backupIfPresent(filePath, backupSuffix);
  const tempPath = `${filePath}.tmp.${uniqueFileNonce()}`;

  try {
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2) + '\n', {
      encoding: 'utf8',
      mode: 0o600,
    });
    fs.renameSync(tempPath, filePath);
    fs.chmodSync(filePath, 0o600);
  } catch (error) {
    if (fs.existsSync(tempPath)) {
      fs.rmSync(tempPath, { force: true });
    }
    throw error;
  }
}

function getManagedSharedEnv(
  data: Record<string, unknown>,
  managedKeys: ReadonlySet<string>
): Record<string, string> {
  const rawEnv = isRecord(data.env) ? toStringRecord(data.env) : {};
  const managed: Record<string, string> = {};
  for (const key of managedKeys) {
    if (typeof rawEnv[key] === 'string') {
      managed[key] = rawEnv[key];
    }
  }
  return sortStringRecord(managed);
}

interface ExtensionEnvEntry {
  name: string;
  value: string;
}

function getExtensionEnvEntries(value: unknown): ExtensionEnvEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!isRecord(entry) || typeof entry.name !== 'string' || typeof entry.value !== 'string') {
        return null;
      }
      return { name: entry.name, value: entry.value };
    })
    .filter((entry): entry is ExtensionEnvEntry => entry !== null);
}

function getExtensionEnvMap(
  value: unknown,
  managedKeys?: ReadonlySet<string>
): Record<string, string> {
  const entries = getExtensionEnvEntries(value)
    .filter((entry) => !managedKeys || managedKeys.has(entry.name))
    .map((entry) => [entry.name, entry.value] as const);
  return sortStringRecord(Object.fromEntries(entries));
}

function mergeManagedExtensionEnvEntries(
  value: unknown,
  managedKeys: ReadonlySet<string>,
  nextManagedEnv: Record<string, string>
): ExtensionEnvEntry[] {
  const preservedEntries = getExtensionEnvEntries(value).filter(
    (entry) => !managedKeys.has(entry.name)
  );
  const managedEntries = Object.entries(sortStringRecord(nextManagedEnv)).map(
    ([name, entryValue]) => ({
      name,
      value: entryValue,
    })
  );

  return [...preservedEntries, ...managedEntries];
}

function recordsMatch(left: Record<string, string>, right: Record<string, string>): boolean {
  return JSON.stringify(sortStringRecord(left)) === JSON.stringify(sortStringRecord(right));
}

function booleansMatch(left: boolean | undefined, right: boolean | undefined): boolean {
  return left === right;
}

function targetEnabled(target: ClaudeExtensionActionTarget, candidate: 'shared' | 'ide'): boolean {
  return target === 'all' || target === candidate;
}

function getManagedKeysForTarget(
  binding: ClaudeExtensionBinding,
  target: 'shared' | 'ide',
  currentResolvedKeys: string[]
): Set<string> {
  const manifest = getClaudeExtensionManagedEnvManifest(binding.id);
  const manifestKeys = target === 'shared' ? manifest.shared : manifest.ide;
  return new Set([...currentResolvedKeys, ...manifestKeys]);
}

function getCurrentResolvedManagedKeys(
  setup: Awaited<ReturnType<typeof resolveClaudeExtensionSetup>>
): string[] {
  return [...new Set([...setup.removeEnvKeys, ...Object.keys(setup.extensionEnv)])].sort(
    (left, right) => left.localeCompare(right)
  );
}

export function getDefaultClaudeExtensionIdeSettingsPath(host: ClaudeExtensionHost): string {
  if (process.platform === 'darwin') {
    if (host === 'vscode') {
      return path.join(
        os.homedir(),
        'Library',
        'Application Support',
        'Code',
        'User',
        'settings.json'
      );
    }
    if (host === 'cursor') {
      return path.join(
        os.homedir(),
        'Library',
        'Application Support',
        'Cursor',
        'User',
        'settings.json'
      );
    }
    return path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Windsurf',
      'User',
      'settings.json'
    );
  }

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    if (host === 'vscode') return path.join(appData, 'Code', 'User', 'settings.json');
    if (host === 'cursor') return path.join(appData, 'Cursor', 'User', 'settings.json');
    return path.join(appData, 'Windsurf', 'User', 'settings.json');
  }

  if (host === 'vscode') return path.join(os.homedir(), '.config', 'Code', 'User', 'settings.json');
  if (host === 'cursor')
    return path.join(os.homedir(), '.config', 'Cursor', 'User', 'settings.json');
  return path.join(os.homedir(), '.config', 'Windsurf', 'User', 'settings.json');
}

export function resolveClaudeExtensionIdeSettingsPath(binding: ClaudeExtensionBinding): string {
  return binding.ideSettingsPath
    ? expandPath(binding.ideSettingsPath)
    : getDefaultClaudeExtensionIdeSettingsPath(binding.host);
}

export async function verifyClaudeExtensionBinding(
  binding: ClaudeExtensionBinding
): Promise<ClaudeExtensionBindingStatus> {
  const setup = await resolveClaudeExtensionSetup(binding.profile);
  const currentResolvedKeys = getCurrentResolvedManagedKeys(setup);
  const sharedManagedKeys = getManagedKeysForTarget(binding, 'shared', currentResolvedKeys);
  const ideManagedKeys = getManagedKeysForTarget(binding, 'ide', currentResolvedKeys);
  const sharedPath = getClaudeSettingsPath();
  const idePath = resolveClaudeExtensionIdeSettingsPath(binding);
  const sharedDoc = readJsonDocument(sharedPath);
  const ideDoc = readJsonDocument(idePath);
  const hostDefinition = getClaudeExtensionHostDefinition(binding.host);
  const expectedIde = buildClaudeExtensionSettingsObject(setup, binding.host);
  const expectedIdeEnv = getExtensionEnvMap(
    expectedIde[hostDefinition.settingsKey],
    ideManagedKeys
  );
  const expectedDisablePrompt = hostDefinition.disableLoginPromptKey
    ? (expectedIde[hostDefinition.disableLoginPromptKey] as boolean | undefined)
    : undefined;
  const actualIdeEnv = getExtensionEnvMap(ideDoc.data[hostDefinition.settingsKey], ideManagedKeys);
  const actualDisablePrompt = hostDefinition.disableLoginPromptKey
    ? (ideDoc.data[hostDefinition.disableLoginPromptKey] as boolean | undefined)
    : undefined;
  const expectedShared = sortStringRecord(setup.extensionEnv);
  const actualShared = getManagedSharedEnv(sharedDoc.data, sharedManagedKeys);
  const missingSharedState: ClaudeExtensionFileState =
    Object.keys(expectedShared).length > 0 ? 'missing' : 'applied';
  const missingIdeState: ClaudeExtensionFileState =
    Object.keys(expectedIdeEnv).length > 0 || expectedDisablePrompt === true
      ? 'missing'
      : 'applied';

  const sharedSettings = !sharedDoc.exists
    ? {
        target: 'shared' as const,
        path: sharedPath,
        exists: false,
        mtime: null,
        state: missingSharedState,
        message:
          Object.keys(expectedShared).length > 0
            ? 'Shared Claude settings file does not exist yet.'
            : 'No shared CCS-managed values are required.',
      }
    : recordsMatch(actualShared, expectedShared)
      ? {
          target: 'shared' as const,
          path: sharedPath,
          exists: true,
          mtime: sharedDoc.mtime,
          state: 'applied' as const,
          message: 'Shared Claude settings match this binding.',
        }
      : Object.keys(actualShared).length === 0
        ? {
            target: 'shared' as const,
            path: sharedPath,
            exists: true,
            mtime: sharedDoc.mtime,
            state: 'unconfigured' as const,
            message: 'Shared Claude settings are not configured for this binding.',
          }
        : {
            target: 'shared' as const,
            path: sharedPath,
            exists: true,
            mtime: sharedDoc.mtime,
            state: 'drifted' as const,
            message: 'Shared Claude settings differ from the expected managed values.',
          };

  const ideSettings = !ideDoc.exists
    ? {
        target: 'ide' as const,
        path: idePath,
        exists: false,
        mtime: null,
        state: missingIdeState,
        message:
          Object.keys(expectedIdeEnv).length > 0 || expectedDisablePrompt === true
            ? `${hostDefinition.label} settings file does not exist yet.`
            : 'No IDE-local CCS-managed values are required.',
      }
    : recordsMatch(actualIdeEnv, expectedIdeEnv) &&
        booleansMatch(actualDisablePrompt, expectedDisablePrompt)
      ? {
          target: 'ide' as const,
          path: idePath,
          exists: true,
          mtime: ideDoc.mtime,
          state: 'applied' as const,
          message: `${hostDefinition.label} settings match this binding.`,
        }
      : Object.keys(actualIdeEnv).length === 0 && actualDisablePrompt === undefined
        ? {
            target: 'ide' as const,
            path: idePath,
            exists: true,
            mtime: ideDoc.mtime,
            state: 'unconfigured' as const,
            message: `${hostDefinition.label} settings are not configured for this binding.`,
          }
        : {
            target: 'ide' as const,
            path: idePath,
            exists: true,
            mtime: ideDoc.mtime,
            state: 'drifted' as const,
            message: `${hostDefinition.label} settings differ from the expected managed values.`,
          };

  return { bindingId: binding.id, sharedSettings, ideSettings };
}

export async function applyClaudeExtensionBinding(
  binding: ClaudeExtensionBinding,
  target: ClaudeExtensionActionTarget = 'all'
): Promise<ClaudeExtensionBindingStatus> {
  const setup = await resolveClaudeExtensionSetup(binding.profile);
  const currentResolvedKeys = getCurrentResolvedManagedKeys(setup);
  if (targetEnabled(target, 'shared')) {
    const managedKeys = getManagedKeysForTarget(binding, 'shared', currentResolvedKeys);
    const filePath = getClaudeSettingsPath();
    const document = readJsonDocument(filePath);
    const env = isRecord(document.data.env) ? { ...document.data.env } : {};
    for (const key of managedKeys) delete env[key];
    for (const [key, value] of Object.entries(setup.extensionEnv)) env[key] = value;
    const nextData = { ...document.data };
    const nextEnv = toStringRecord(env);
    if (Object.keys(nextEnv).length > 0) nextData.env = sortStringRecord(nextEnv);
    else delete nextData.env;
    if (document.exists || Object.keys(setup.extensionEnv).length > 0) {
      writeJsonDocument(filePath, nextData, 'backup');
    }
    updateClaudeExtensionManagedEnvManifest(binding.id, {
      shared: Object.keys(setup.extensionEnv),
    });
  }

  if (targetEnabled(target, 'ide')) {
    const managedKeys = getManagedKeysForTarget(binding, 'ide', currentResolvedKeys);
    const hostDefinition = getClaudeExtensionHostDefinition(binding.host);
    const filePath = resolveClaudeExtensionIdeSettingsPath(binding);
    const document = readJsonDocument(filePath);
    const nextData = { ...document.data };
    const payload = buildClaudeExtensionSettingsObject(setup, binding.host);
    const mergedEnvEntries = mergeManagedExtensionEnvEntries(
      document.data[hostDefinition.settingsKey],
      managedKeys,
      setup.extensionEnv
    );
    if (mergedEnvEntries.length > 0) {
      nextData[hostDefinition.settingsKey] = mergedEnvEntries;
    } else {
      delete nextData[hostDefinition.settingsKey];
    }
    if (hostDefinition.disableLoginPromptKey) {
      if (payload[hostDefinition.disableLoginPromptKey] === true) {
        nextData[hostDefinition.disableLoginPromptKey] = true;
      } else {
        delete nextData[hostDefinition.disableLoginPromptKey];
      }
    }
    if (
      document.exists ||
      Object.keys(setup.extensionEnv).length > 0 ||
      payload[hostDefinition.disableLoginPromptKey ?? ''] === true
    ) {
      writeJsonDocument(filePath, nextData, 'ccs-backup');
    }
    updateClaudeExtensionManagedEnvManifest(binding.id, {
      ide: Object.keys(setup.extensionEnv),
    });
  }

  return verifyClaudeExtensionBinding(binding);
}

export async function resetClaudeExtensionBinding(
  binding: ClaudeExtensionBinding,
  target: ClaudeExtensionActionTarget = 'all'
): Promise<ClaudeExtensionBindingStatus> {
  const setup = await resolveClaudeExtensionSetup(binding.profile);
  const currentResolvedKeys = getCurrentResolvedManagedKeys(setup);

  if (targetEnabled(target, 'shared')) {
    const managedKeys = getManagedKeysForTarget(binding, 'shared', currentResolvedKeys);
    const filePath = getClaudeSettingsPath();
    const document = readJsonDocument(filePath);
    if (document.exists) {
      const env = isRecord(document.data.env) ? { ...document.data.env } : {};
      for (const key of managedKeys) delete env[key];
      const nextData = { ...document.data };
      const nextEnv = toStringRecord(env);
      if (Object.keys(nextEnv).length > 0) nextData.env = sortStringRecord(nextEnv);
      else delete nextData.env;
      writeJsonDocument(filePath, nextData, 'backup');
    }
    updateClaudeExtensionManagedEnvManifest(binding.id, { shared: [] });
  }

  if (targetEnabled(target, 'ide')) {
    const managedKeys = getManagedKeysForTarget(binding, 'ide', currentResolvedKeys);
    const hostDefinition = getClaudeExtensionHostDefinition(binding.host);
    const filePath = resolveClaudeExtensionIdeSettingsPath(binding);
    const document = readJsonDocument(filePath);
    if (document.exists) {
      const nextData = { ...document.data };
      const preservedEntries = getExtensionEnvEntries(
        document.data[hostDefinition.settingsKey]
      ).filter((entry) => !managedKeys.has(entry.name));
      if (preservedEntries.length > 0) {
        nextData[hostDefinition.settingsKey] = preservedEntries;
      } else {
        delete nextData[hostDefinition.settingsKey];
      }
      if (hostDefinition.disableLoginPromptKey) {
        delete nextData[hostDefinition.disableLoginPromptKey];
      }
      writeJsonDocument(filePath, nextData, 'ccs-backup');
    }
    updateClaudeExtensionManagedEnvManifest(binding.id, { ide: [] });
  }

  return verifyClaudeExtensionBinding(binding);
}
