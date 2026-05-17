import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';

let resolveActiveProfile: (
  env?: NodeJS.ProcessEnv
) => { name: string; dir: string; source: 'env' | 'default' } | null;

const ORIGINAL_CCS_HOME = process.env.CCS_HOME;

let tempDir: string;
let ccsHome: string;
let registryPath: string;
let instancesDir: string;

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-profile-test-'));
  ccsHome = path.join(tempDir, 'ccs');
  fs.mkdirSync(path.join(ccsHome, '.ccs'), { recursive: true, mode: 0o700 });
  process.env.CCS_HOME = ccsHome;

  registryPath = path.join(ccsHome, '.ccs', 'codex-profiles.yaml');
  instancesDir = path.join(ccsHome, '.ccs', 'codex-instances');

  // Re-import after setting CCS_HOME so module picks up updated dir
  const mod = await import('../../../src/codex-auth/resolve-active-profile');
  resolveActiveProfile = mod.resolveActiveProfile;
});

afterEach(() => {
  if (ORIGINAL_CCS_HOME === undefined) {
    delete process.env.CCS_HOME;
  } else {
    process.env.CCS_HOME = ORIGINAL_CCS_HOME;
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

// Helper to write a registry YAML fixture
function writeRegistry(data: object): void {
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, yaml.dump(data, { indent: 2 }), { mode: 0o600 });
}

function makeProfileDir(name: string): string {
  const dir = path.join(instancesDir, name);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

describe('resolveActiveProfile', () => {
  it('returns null silently when registry file does not exist', () => {
    // No registry written
    const result = resolveActiveProfile({});
    expect(result).toBeNull();
  });

  it('throws when registry YAML is corrupt even without an env override', () => {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(registryPath, '{ invalid yaml: [[[', { mode: 0o600 });

    expect(() => resolveActiveProfile({})).toThrow(/registry YAML could not be parsed/);
    try {
      resolveActiveProfile({});
    } catch (err) {
      expect(String(err)).toContain('$CCS_HOME/.ccs/codex-profiles.yaml');
      expect(String(err)).not.toContain(registryPath);
      expect(String(err)).not.toContain('invalid yaml');
    }
  });

  it('throws when CCS_CODEX_PROFILE is set and registry YAML is corrupt', () => {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(registryPath, '{ invalid yaml: [[[', { mode: 0o600 });

    let thrown: unknown;
    try {
      resolveActiveProfile({ CCS_CODEX_PROFILE: 'work' });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect(String(thrown)).toContain('Refusing to fall back to ~/.codex');
    expect(String(thrown)).toContain('$CCS_HOME/.ccs/codex-profiles.yaml');
    expect(String(thrown)).not.toContain(registryPath);
    expect(String(thrown)).not.toContain('invalid yaml');
  });

  it('throws when registry is missing a valid profiles map', () => {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(registryPath, 'version: "1.0"\ndefault: null\nprofiles: []\n', {
      mode: 0o600,
    });

    expect(() => resolveActiveProfile({})).toThrow(/object profiles map/);
  });

  it('throws instead of falling back when registry default has an invalid falsy type', () => {
    writeRegistry({
      version: '1.0',
      default: false,
      profiles: {},
    });

    expect(() => resolveActiveProfile({})).toThrow(/default must be a string or null/i);
  });

  it('throws when CCS_CODEX_PROFILE contains an unsafe profile name', () => {
    writeRegistry({
      version: '1.0',
      default: null,
      profiles: {},
    });

    expect(() => resolveActiveProfile({ CCS_CODEX_PROFILE: '../escape' })).toThrow(
      /invalid.*path separators/i
    );
  });

  it('throws when registry default contains an unsafe profile name', () => {
    writeRegistry({
      version: '1.0',
      default: '../escape',
      profiles: {
        '../escape': { type: 'codex', created: '2026-01-01T00:00:00.000Z', last_used: null },
      },
    });

    expect(() => resolveActiveProfile({})).toThrow(/invalid.*path separators/i);
  });

  it('throws when registry default points to a missing profile', () => {
    writeRegistry({
      version: '1.0',
      default: 'ghost',
      profiles: {},
    });

    expect(() => resolveActiveProfile({})).toThrow(/default profile is missing from profiles map/i);
  });

  it('throws when matched registry profile entry is malformed', () => {
    writeRegistry({
      version: '1.0',
      default: 'work',
      profiles: {
        work: 1,
      },
    });

    expect(() => resolveActiveProfile({})).toThrow(/profile "work" must be an object/i);
  });

  it('throws when a registry profile is missing required metadata', () => {
    writeRegistry({
      version: '1.0',
      default: 'work',
      profiles: {
        work: { type: 'codex', last_used: null },
      },
    });

    expect(() => resolveActiveProfile({})).toThrow(/created timestamp/i);
  });

  it('throws when a registry profile has invalid optional metadata types', () => {
    writeRegistry({
      version: '1.0',
      default: 'work',
      profiles: {
        work: {
          type: 'codex',
          created: '2026-01-01T00:00:00.000Z',
          last_used: null,
          account_id: 123,
        },
      },
    });

    expect(() => resolveActiveProfile({})).toThrow(/account_id must be a string/i);
  });

  it('returns source=env when CCS_CODEX_PROFILE matches a registry entry', () => {
    const profileDir = makeProfileDir('work');
    writeRegistry({
      version: '1.0',
      default: null,
      profiles: {
        work: { type: 'codex', created: '2026-01-01T00:00:00.000Z', last_used: null },
      },
    });

    const result = resolveActiveProfile({ CCS_CODEX_PROFILE: 'work' });

    expect(result).not.toBeNull();
    expect(result?.name).toBe('work');
    expect(result?.source).toBe('env');
    expect(result?.dir).toBe(profileDir);
  });

  it('returns source=default when no env var and registry has a default profile', () => {
    const profileDir = makeProfileDir('personal');
    writeRegistry({
      version: '1.0',
      default: 'personal',
      profiles: {
        personal: { type: 'codex', created: '2026-01-01T00:00:00.000Z', last_used: null },
      },
    });

    const result = resolveActiveProfile({});

    expect(result).not.toBeNull();
    expect(result?.name).toBe('personal');
    expect(result?.source).toBe('default');
    expect(result?.dir).toBe(profileDir);
  });

  it('env > default precedence: CCS_CODEX_PROFILE overrides registry default', () => {
    makeProfileDir('work');
    makeProfileDir('personal');
    writeRegistry({
      version: '1.0',
      default: 'personal',
      profiles: {
        work: { type: 'codex', created: '2026-01-01T00:00:00.000Z', last_used: null },
        personal: { type: 'codex', created: '2026-01-01T00:00:00.000Z', last_used: null },
      },
    });

    const result = resolveActiveProfile({ CCS_CODEX_PROFILE: 'work' });

    expect(result?.name).toBe('work');
    expect(result?.source).toBe('env');
  });

  it('throws when CCS_CODEX_PROFILE names a profile not in registry', () => {
    writeRegistry({
      version: '1.0',
      default: null,
      profiles: {},
    });

    expect(() => resolveActiveProfile({ CCS_CODEX_PROFILE: 'ghost' })).toThrow(
      /CCS_CODEX_PROFILE='ghost'/
    );
  });

  it('throws when CCS_CODEX_PROFILE is set but registry file is missing', () => {
    expect(() => resolveActiveProfile({ CCS_CODEX_PROFILE: 'ghost' })).toThrow(/does not exist/);
  });

  it('treats empty/whitespace-only CCS_CODEX_PROFILE as unset, falls back to default', () => {
    makeProfileDir('default-profile');
    writeRegistry({
      version: '1.0',
      default: 'default-profile',
      profiles: {
        'default-profile': {
          type: 'codex',
          created: '2026-01-01T00:00:00.000Z',
          last_used: null,
        },
      },
    });

    const resultEmpty = resolveActiveProfile({ CCS_CODEX_PROFILE: '' });
    expect(resultEmpty?.name).toBe('default-profile');
    expect(resultEmpty?.source).toBe('default');

    const resultWhitespace = resolveActiveProfile({ CCS_CODEX_PROFILE: '   ' });
    expect(resultWhitespace?.name).toBe('default-profile');
    expect(resultWhitespace?.source).toBe('default');
  });

  it('resolves the profile dir to an absolute path', () => {
    makeProfileDir('absolute-test');
    writeRegistry({
      version: '1.0',
      default: 'absolute-test',
      profiles: {
        'absolute-test': {
          type: 'codex',
          created: '2026-01-01T00:00:00.000Z',
          last_used: null,
        },
      },
    });

    const result = resolveActiveProfile({});

    expect(result?.dir).toBe(path.resolve(result?.dir ?? ''));
    expect(path.isAbsolute(result?.dir ?? '')).toBe(true);
  });
});
