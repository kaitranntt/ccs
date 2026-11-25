import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import ProfileDetector from '../../auth/profile-detector';
import { ConfigError, ProfileError, ValidationError } from '../../errors/error-types';
import type { ClaudeExtensionHost } from '../../shared/claude-extension-hosts';
import { expandPath } from '../../utils/helpers';
import { getCcsDir } from '../../config/config-loader-facade';

export interface ClaudeExtensionBinding {
  id: string;
  name: string;
  profile: string;
  host: ClaudeExtensionHost;
  ideSettingsPath?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClaudeExtensionBindingInput {
  name: string;
  profile: string;
  host: ClaudeExtensionHost;
  ideSettingsPath?: string;
  notes?: string;
}

export interface ClaudeExtensionManagedEnvManifest {
  shared: string[];
  ide: string[];
}

interface ClaudeExtensionStoredBinding extends ClaudeExtensionBinding {
  managedEnvManifest: ClaudeExtensionManagedEnvManifest;
}

interface ClaudeExtensionBindingStore {
  bindings: ClaudeExtensionStoredBinding[];
}

const VALID_HOSTS = new Set<ClaudeExtensionHost>(['vscode', 'cursor', 'windsurf']);

function getBindingsFilePath(): string {
  return path.join(getCcsDir(), 'claude-extension-bindings.json');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeEnvKeyList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return [...new Set(value.filter((entry): entry is string => typeof entry === 'string'))]
    .map((entry) => entry.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

function normalizeManagedEnvManifest(value: unknown): ClaudeExtensionManagedEnvManifest {
  if (!isRecord(value)) {
    return { shared: [], ide: [] };
  }

  return {
    shared: normalizeEnvKeyList(value.shared),
    ide: normalizeEnvKeyList(value.ide),
  };
}

function toPublicBinding(binding: ClaudeExtensionStoredBinding): ClaudeExtensionBinding {
  const { managedEnvManifest: _managedEnvManifest, ...publicBinding } = binding;
  return publicBinding;
}

function normalizeBindingInput(input: ClaudeExtensionBindingInput): ClaudeExtensionBindingInput {
  const name = input.name?.trim();
  const profile = input.profile?.trim();
  const ideSettingsPath = input.ideSettingsPath?.trim();
  const notes = input.notes?.trim();

  if (!name) throw new ValidationError('Binding name is required', 'name');
  if (!profile) throw new ValidationError('Profile is required', 'profile');
  if (!VALID_HOSTS.has(input.host)) {
    throw new ValidationError(`Unsupported IDE host "${input.host}"`, 'host');
  }

  try {
    new ProfileDetector().detectProfileType(profile);
  } catch {
    throw new ProfileError(`Unknown profile "${profile}"`, profile);
  }

  return {
    name,
    profile,
    host: input.host,
    ideSettingsPath: ideSettingsPath ? expandPath(ideSettingsPath) : undefined,
    notes: notes || undefined,
  };
}

function normalizeStoredBinding(value: unknown): ClaudeExtensionStoredBinding | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const profile = typeof value.profile === 'string' ? value.profile.trim() : '';
  const host = typeof value.host === 'string' ? value.host.trim() : '';
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : '';
  const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : '';

  if (!id || !name || !profile || !VALID_HOSTS.has(host as ClaudeExtensionHost)) {
    return null;
  }

  return {
    id,
    name,
    profile,
    host: host as ClaudeExtensionHost,
    ideSettingsPath:
      typeof value.ideSettingsPath === 'string' && value.ideSettingsPath.trim().length > 0
        ? value.ideSettingsPath.trim()
        : undefined,
    notes:
      typeof value.notes === 'string' && value.notes.trim().length > 0
        ? value.notes.trim()
        : undefined,
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
    managedEnvManifest: normalizeManagedEnvManifest(value.managedEnvManifest),
  };
}

function readBindingsStore(): ClaudeExtensionBindingStore {
  const filePath = getBindingsFilePath();
  if (!fs.existsSync(filePath)) {
    return { bindings: [] };
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    throw new ConfigError(
      `Failed to parse Claude extension bindings store at ${filePath}: ${(error as Error).message}`,
      filePath
    );
  }
  const bindings = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.bindings)
      ? parsed.bindings
      : [];

  return {
    bindings: bindings
      .map((entry) => normalizeStoredBinding(entry))
      .filter((entry): entry is ClaudeExtensionStoredBinding => entry !== null)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  };
}

function writeBindingsStore(store: ClaudeExtensionBindingStore): void {
  const filePath = getBindingsFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp.${process.pid}-${Date.now()}-${randomUUID()}`;

  try {
    fs.writeFileSync(tempPath, JSON.stringify(store, null, 2) + '\n', 'utf8');
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    if (fs.existsSync(tempPath)) {
      fs.rmSync(tempPath, { force: true });
    }
    throw error;
  }
}

export function listClaudeExtensionBindings(): ClaudeExtensionBinding[] {
  return readBindingsStore().bindings.map((binding) => toPublicBinding(binding));
}

export function getClaudeExtensionBinding(id: string): ClaudeExtensionBinding {
  const binding = readBindingsStore().bindings.find((entry) => entry.id === id);
  if (!binding) {
    throw new ConfigError(`Binding not found: ${id}`);
  }
  return toPublicBinding(binding);
}

export function getClaudeExtensionManagedEnvManifest(
  id: string
): ClaudeExtensionManagedEnvManifest {
  const binding = readBindingsStore().bindings.find((entry) => entry.id === id);
  if (!binding) {
    throw new ConfigError(`Binding not found: ${id}`);
  }
  return binding.managedEnvManifest;
}

export function updateClaudeExtensionManagedEnvManifest(
  id: string,
  updates: Partial<ClaudeExtensionManagedEnvManifest>
): void {
  const store = readBindingsStore();
  const index = store.bindings.findIndex((entry) => entry.id === id);
  if (index === -1) {
    throw new ConfigError(`Binding not found: ${id}`);
  }

  const current = store.bindings[index];
  store.bindings[index] = {
    ...current,
    managedEnvManifest: {
      shared:
        updates.shared !== undefined
          ? normalizeEnvKeyList(updates.shared)
          : current.managedEnvManifest.shared,
      ide:
        updates.ide !== undefined
          ? normalizeEnvKeyList(updates.ide)
          : current.managedEnvManifest.ide,
    },
  };

  writeBindingsStore(store);
}

export function createClaudeExtensionBinding(
  input: ClaudeExtensionBindingInput
): ClaudeExtensionBinding {
  const normalized = normalizeBindingInput(input);
  const store = readBindingsStore();
  const timestamp = new Date().toISOString();
  const binding: ClaudeExtensionStoredBinding = {
    managedEnvManifest: { shared: [], ide: [] },
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    ...normalized,
  };

  store.bindings.unshift(binding);
  writeBindingsStore(store);
  return toPublicBinding(binding);
}

export function updateClaudeExtensionBinding(
  id: string,
  input: ClaudeExtensionBindingInput
): ClaudeExtensionBinding {
  const normalized = normalizeBindingInput(input);
  const store = readBindingsStore();
  const index = store.bindings.findIndex((entry) => entry.id === id);
  if (index === -1) {
    throw new ConfigError(`Binding not found: ${id}`);
  }

  const updated: ClaudeExtensionStoredBinding = {
    ...store.bindings[index],
    ...normalized,
    updatedAt: new Date().toISOString(),
  };

  store.bindings[index] = updated;
  writeBindingsStore(store);
  return toPublicBinding(updated);
}

export function deleteClaudeExtensionBinding(id: string): void {
  const store = readBindingsStore();
  const nextBindings = store.bindings.filter((entry) => entry.id !== id);
  if (nextBindings.length === store.bindings.length) {
    throw new ConfigError(`Binding not found: ${id}`);
  }

  writeBindingsStore({ bindings: nextBindings });
}
