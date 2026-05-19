import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as lockfile from 'proper-lockfile';
import { createLogger } from '../services/logging';
import { getCodexAuthRegistryPath } from './codex-profile-paths';
import { getCcsDirSource } from '../utils/config-manager';
import { CODEX_PROFILE_SCHEMA_VERSION, getCodexProfileNameError } from './types';
import type { CodexProfileData, CodexProfileMetadata } from './types';

const logger = createLogger('codex-auth:registry');
const REGISTRY_LOCK_STALE_MS = 10000;
const REGISTRY_LOCK_RETRIES = 40;
const REGISTRY_LOCK_RETRY_DELAY_MS = 50;

function emptyRegistry(): CodexProfileData {
  return { version: CODEX_PROFILE_SCHEMA_VERSION, default: null, profiles: {} };
}

export class CodexProfileRegistryReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CodexProfileRegistryReadError';
  }
}

export function validateCodexProfileRegistryData(parsed: unknown): CodexProfileData {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('registry YAML root is not an object');
  }

  const data = parsed as Partial<CodexProfileData>;
  if (!data.profiles || typeof data.profiles !== 'object' || Array.isArray(data.profiles)) {
    throw new Error('registry YAML is missing an object profiles map');
  }
  if (data.default !== undefined && data.default !== null && typeof data.default !== 'string') {
    throw new Error('registry YAML default must be a string or null');
  }
  if (typeof data.default === 'string') {
    assertValidProfileName(data.default);
  }

  const profiles: Record<string, CodexProfileMetadata> = {};
  for (const [name, profile] of Object.entries(data.profiles)) {
    assertValidProfileName(name);
    profiles[name] = validateProfileMetadata(name, profile);
  }
  if (
    typeof data.default === 'string' &&
    !Object.prototype.hasOwnProperty.call(profiles, data.default)
  ) {
    throw new Error('registry YAML default profile is missing from profiles map');
  }

  return {
    version: typeof data.version === 'string' ? data.version : CODEX_PROFILE_SCHEMA_VERSION,
    default: data.default ?? null,
    profiles,
  };
}

function assertValidProfileName(name: string): void {
  const nameError = getCodexProfileNameError(name);
  if (nameError) {
    throw new Error(`registry YAML contains invalid profile name "${name}": ${nameError}`);
  }
}

function validateProfileMetadata(name: string, profile: unknown): CodexProfileMetadata {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error(`registry YAML profile "${name}" must be an object`);
  }
  const meta = profile as Partial<CodexProfileMetadata>;
  if (meta.type !== 'codex') {
    throw new Error(`registry YAML profile "${name}" must have type "codex"`);
  }
  if (typeof meta.created !== 'string') {
    throw new Error(`registry YAML profile "${name}" must have a string created timestamp`);
  }
  if (meta.last_used !== null && typeof meta.last_used !== 'string') {
    throw new Error(
      `registry YAML profile "${name}" must have a string or null last_used timestamp`
    );
  }
  if (meta.email !== undefined && typeof meta.email !== 'string') {
    throw new Error(`registry YAML profile "${name}" email must be a string`);
  }
  if (
    meta.plan_type !== undefined &&
    meta.plan_type !== null &&
    typeof meta.plan_type !== 'string'
  ) {
    throw new Error(`registry YAML profile "${name}" plan_type must be a string or null`);
  }
  if (meta.account_id !== undefined && typeof meta.account_id !== 'string') {
    throw new Error(`registry YAML profile "${name}" account_id must be a string`);
  }
  return meta as CodexProfileMetadata;
}

function registryDisplayPath(registryPath: string): string {
  const [source] = getCcsDirSource();
  const defaultRegistryPath = path.resolve(getCodexAuthRegistryPath());
  if (path.resolve(registryPath) !== defaultRegistryPath) {
    return path.basename(registryPath);
  }
  if (source === 'default') {
    return process.platform === 'win32'
      ? '%USERPROFILE%\\.ccs\\codex-profiles.yaml'
      : '~/.ccs/codex-profiles.yaml';
  }
  if (source === 'CCS_HOME' || source === 'scoped:CCS_HOME') {
    return '$CCS_HOME/.ccs/codex-profiles.yaml';
  }
  if (source === 'CCS_DIR' || source === 'scoped:CCS_DIR') {
    return '$CCS_DIR/codex-profiles.yaml';
  }
  return 'codex-profiles.yaml';
}

function safeRegistryReadMessage(err: unknown): string {
  if ((err as { name?: unknown } | undefined)?.name === 'YAMLException') {
    return 'registry YAML could not be parsed';
  }
  return err instanceof Error ? err.message : String(err);
}

function sleepSync(ms: number): void {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      // Fall back for runtimes without Atomics.wait.
    }
  }
}

function isLockContentionError(err: unknown): boolean {
  return (err as NodeJS.ErrnoException | undefined)?.code === 'ELOCKED';
}

/**
 * Registry for codex auth profiles stored at ~/.ccs/codex-profiles.yaml.
 *
 * Writes are guarded by a registry-directory lock around the read-modify-write
 * cycle, then persisted atomically with tmp file + POSIX rename.
 *
 * Constructor accepts an optional registryPath for test isolation.
 */
export class CodexProfileRegistry {
  private readonly registryPath: string;

  constructor(registryPath?: string) {
    this.registryPath = registryPath ?? getCodexAuthRegistryPath();
    this._cleanOrphanTmpFiles();
  }

  // ── private read/write ──────────────────────────────────────────────────

  private _read(): CodexProfileData {
    if (!fs.existsSync(this.registryPath)) {
      return emptyRegistry();
    }
    try {
      const raw = fs.readFileSync(this.registryPath, 'utf8');
      return validateCodexProfileRegistryData(yaml.load(raw));
    } catch (err) {
      const msg = safeRegistryReadMessage(err);
      const displayPath = registryDisplayPath(this.registryPath);
      logger.warn(
        'codex-auth.registry.read-failed',
        `Registry at ${displayPath} could not be read safely; refusing empty-state rewrite: ${msg}`
      );
      throw new CodexProfileRegistryReadError(
        `Codex profile registry at ${displayPath} could not be read safely: ${msg}. Refusing to rewrite it.`
      );
    }
  }

  private _write(data: CodexProfileData): void {
    const dir = path.dirname(this.registryPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    // Unique tmp suffix avoids collisions on concurrent writes and orphan leaks
    const tmpPath = `${this.registryPath}.tmp.${process.pid}.${Math.random().toString(36).slice(2)}`;

    try {
      fs.writeFileSync(tmpPath, yaml.dump(data, { indent: 2, lineWidth: -1 }), {
        mode: 0o600,
      });
      fs.renameSync(tmpPath, this.registryPath);
    } catch (err) {
      if (fs.existsSync(tmpPath)) {
        try {
          fs.unlinkSync(tmpPath);
        } catch {
          // best-effort cleanup
        }
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to write codex profile registry: ${msg}`);
    }
  }

  private _withRegistryWriteLock<T>(callback: () => T): T {
    const dir = path.dirname(this.registryPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    let release: (() => void) | undefined;
    let lastLockError: unknown;

    for (let attempt = 0; attempt <= REGISTRY_LOCK_RETRIES; attempt++) {
      try {
        release = lockfile.lockSync(dir, { stale: REGISTRY_LOCK_STALE_MS }) as () => void;
        break;
      } catch (err) {
        if (!isLockContentionError(err) || attempt === REGISTRY_LOCK_RETRIES) {
          throw err;
        }
        lastLockError = err;
        sleepSync(REGISTRY_LOCK_RETRY_DELAY_MS);
      }
    }

    if (!release) {
      const msg = lastLockError instanceof Error ? lastLockError.message : 'unknown lock error';
      throw new Error(`Failed to acquire codex profile registry lock: ${msg}`);
    }

    try {
      return callback();
    } finally {
      try {
        release();
      } catch {
        // Best-effort release.
      }
    }
  }

  // Best-effort cleanup of orphan tmp files older than 1 hour (H3 mitigation).
  private _cleanOrphanTmpFiles(): void {
    const dir = path.dirname(this.registryPath);
    const base = path.basename(this.registryPath);
    if (!fs.existsSync(dir)) return;
    try {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      for (const entry of fs.readdirSync(dir)) {
        if (!entry.startsWith(`${base}.tmp.`)) continue;
        const full = path.join(dir, entry);
        try {
          const stat = fs.statSync(full);
          if (stat.mtimeMs < oneHourAgo) {
            fs.unlinkSync(full);
          }
        } catch {
          // ignore per-file errors
        }
      }
    } catch {
      // ignore cleanup failure silently
    }
  }

  // ── CRUD ────────────────────────────────────────────────────────────────

  createProfile(name: string, meta: Partial<CodexProfileMetadata> = {}): void {
    assertValidProfileName(name);
    this._withRegistryWriteLock(() => {
      const data = this._read();
      if (data.profiles[name]) {
        throw new Error(`Profile already exists: ${name}`);
      }
      data.profiles[name] = {
        type: 'codex',
        created: new Date().toISOString(),
        last_used: null,
        ...meta,
      } as CodexProfileMetadata;
      this._write(data);
      logger.stage('route', 'codex-auth.profile.created', 'Codex profile created', { name });
    });
  }

  getProfile(name: string): CodexProfileMetadata {
    assertValidProfileName(name);
    const data = this._read();
    const profile = data.profiles[name];
    if (!profile) {
      throw new Error(`Profile not found: ${name}`);
    }
    return profile;
  }

  updateProfile(name: string, partial: Partial<CodexProfileMetadata>): void {
    assertValidProfileName(name);
    this._withRegistryWriteLock(() => {
      const data = this._read();
      if (!data.profiles[name]) {
        throw new Error(`Profile not found: ${name}`);
      }
      data.profiles[name] = { ...data.profiles[name], ...partial } as CodexProfileMetadata;
      this._write(data);
    });
  }

  removeProfile(name: string, options: { forceDefault?: boolean } = {}): void {
    assertValidProfileName(name);
    this._withRegistryWriteLock(() => {
      const data = this._read();
      if (!data.profiles[name]) {
        throw new Error(`Profile not found: ${name}`);
      }
      if (data.default === name && Object.keys(data.profiles).length > 1 && !options.forceDefault) {
        throw new Error('Cannot remove default profile while other profiles exist without --force');
      }
      delete data.profiles[name];
      if (data.default === name) {
        data.default = null;
      }
      this._write(data);
      logger.stage('cleanup', 'codex-auth.profile.deleted', 'Codex profile removed', { name });
    });
  }

  listProfiles(): string[] {
    return Object.keys(this._read().profiles);
  }

  hasProfile(name: string): boolean {
    if (getCodexProfileNameError(name)) return false;
    return Object.prototype.hasOwnProperty.call(this._read().profiles, name);
  }

  // ── Default pointer ──────────────────────────────────────────────────────

  getDefault(): string | null {
    return this._read().default;
  }

  setDefault(name: string): void {
    assertValidProfileName(name);
    this._withRegistryWriteLock(() => {
      const data = this._read();
      if (!data.profiles[name]) {
        throw new Error(`Profile not found: ${name}`);
      }
      data.default = name;
      this._write(data);
    });
  }

  clearDefault(): void {
    this._withRegistryWriteLock(() => {
      const data = this._read();
      data.default = null;
      this._write(data);
    });
  }

  touchProfile(name: string): void {
    this.updateProfile(name, { last_used: new Date().toISOString() });
  }
}
