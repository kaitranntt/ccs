import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as lockfile from 'proper-lockfile';
import { spawn } from 'child_process';

let CodexProfileRegistry: new (registryPath?: string) => {
  createProfile(name: string, meta?: Record<string, unknown>): void;
  getProfile(name: string): Record<string, unknown>;
  updateProfile(name: string, partial: Record<string, unknown>): void;
  removeProfile(name: string, options?: { forceDefault?: boolean }): void;
  listProfiles(): string[];
  hasProfile(name: string): boolean;
  getDefault(): string | null;
  setDefault(name: string): void;
  clearDefault(): void;
  touchProfile(name: string): void;
};

let tempDir: string;
let ccsHome: string;
let registryPath: string;

const ORIGINAL_CCS_HOME = process.env.CCS_HOME;

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-registry-test-'));
  ccsHome = path.join(tempDir, 'ccs-home');
  fs.mkdirSync(path.join(ccsHome, '.ccs'), { recursive: true, mode: 0o700 });
  process.env.CCS_HOME = ccsHome;
  registryPath = path.join(ccsHome, '.ccs', 'codex-profiles.yaml');

  const mod = await import('../../../src/codex-auth/codex-profile-registry');
  CodexProfileRegistry = mod.CodexProfileRegistry;
});

afterEach(() => {
  if (ORIGINAL_CCS_HOME === undefined) {
    delete process.env.CCS_HOME;
  } else {
    process.env.CCS_HOME = ORIGINAL_CCS_HOME;
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
  mock.restore();
});

describe('CodexProfileRegistry — empty state', () => {
  it('returns empty list when registry file does not exist', () => {
    const reg = new CodexProfileRegistry(registryPath);
    expect(reg.listProfiles()).toEqual([]);
  });

  it('returns null default when registry file does not exist', () => {
    const reg = new CodexProfileRegistry(registryPath);
    expect(reg.getDefault()).toBeNull();
  });
});

describe('CodexProfileRegistry — create and get', () => {
  it('creates a profile and retrieves it by name', () => {
    const reg = new CodexProfileRegistry(registryPath);
    reg.createProfile('work');
    const profile = reg.getProfile('work');
    expect(profile.type).toBe('codex');
    expect(typeof profile.created).toBe('string');
    expect(profile.last_used).toBeNull();
  });

  it('persists profile to disk as YAML with schema version', () => {
    const reg = new CodexProfileRegistry(registryPath);
    reg.createProfile('work');
    const raw = fs.readFileSync(registryPath, 'utf8');
    const parsed = yaml.load(raw) as Record<string, unknown>;
    expect(parsed.version).toBe('1.0');
    expect(typeof parsed.profiles).toBe('object');
  });

  it('throws when creating a duplicate profile name', () => {
    const reg = new CodexProfileRegistry(registryPath);
    reg.createProfile('work');
    expect(() => reg.createProfile('work')).toThrow(/already exists/i);
  });

  it('accepts optional metadata on create', () => {
    const reg = new CodexProfileRegistry(registryPath);
    reg.createProfile('personal', { email: 'me@example.com', plan_type: 'pro' });
    const profile = reg.getProfile('personal');
    expect(profile.email).toBe('me@example.com');
    expect(profile.plan_type).toBe('pro');
  });

  it('hasProfile returns false before creation and true after', () => {
    const reg = new CodexProfileRegistry(registryPath);
    expect(reg.hasProfile('work')).toBe(false);
    reg.createProfile('work');
    expect(reg.hasProfile('work')).toBe(true);
  });

  it('rejects unsafe profile names before writing the registry', () => {
    const reg = new CodexProfileRegistry(registryPath);
    expect(() => reg.createProfile('../escape')).toThrow(/path separators/i);
    expect(reg.hasProfile('../escape')).toBe(false);
    expect(fs.existsSync(registryPath)).toBe(false);
  });
});

describe('CodexProfileRegistry — remove', () => {
  it('removes an existing profile', () => {
    const reg = new CodexProfileRegistry(registryPath);
    reg.createProfile('work');
    reg.removeProfile('work');
    expect(reg.listProfiles()).toEqual([]);
  });

  it('throws when removing a non-existent profile', () => {
    const reg = new CodexProfileRegistry(registryPath);
    expect(() => reg.removeProfile('ghost')).toThrow(/not found/i);
  });

  it('clears default when the default profile is removed', () => {
    const reg = new CodexProfileRegistry(registryPath);
    reg.createProfile('work');
    reg.setDefault('work');
    expect(reg.getDefault()).toBe('work');
    reg.removeProfile('work');
    expect(reg.getDefault()).toBeNull();
  });

  it('refuses to remove the default profile when other profiles remain without force', () => {
    const reg = new CodexProfileRegistry(registryPath);
    reg.createProfile('work');
    reg.createProfile('personal');
    reg.setDefault('work');

    expect(() => reg.removeProfile('work')).toThrow(/default profile.*without --force/i);

    expect(reg.listProfiles()).toEqual(['work', 'personal']);
    expect(reg.getDefault()).toBe('work');
  });

  it('does not promote another profile when the default profile is force removed', () => {
    const reg = new CodexProfileRegistry(registryPath);
    reg.createProfile('work');
    reg.createProfile('personal');
    reg.setDefault('work');

    reg.removeProfile('work', { forceDefault: true });

    expect(reg.listProfiles()).toEqual(['personal']);
    expect(reg.getDefault()).toBeNull();
  });
});

describe('CodexProfileRegistry — default pointer', () => {
  it('setDefault throws when profile does not exist', () => {
    const reg = new CodexProfileRegistry(registryPath);
    expect(() => reg.setDefault('ghost')).toThrow(/not found/i);
  });

  it('setDefault and getDefault round-trip', () => {
    const reg = new CodexProfileRegistry(registryPath);
    reg.createProfile('work');
    reg.setDefault('work');
    expect(reg.getDefault()).toBe('work');
  });

  it('clearDefault resets default to null', () => {
    const reg = new CodexProfileRegistry(registryPath);
    reg.createProfile('work');
    reg.setDefault('work');
    reg.clearDefault();
    expect(reg.getDefault()).toBeNull();
  });
});

describe('CodexProfileRegistry — listProfiles', () => {
  it('returns all profile names', () => {
    const reg = new CodexProfileRegistry(registryPath);
    reg.createProfile('work');
    reg.createProfile('personal');
    const list = reg.listProfiles();
    expect(list).toContain('work');
    expect(list).toContain('personal');
    expect(list.length).toBe(2);
  });
});

describe('CodexProfileRegistry — corrupt YAML safety', () => {
  it('throws on corrupt YAML without rewriting the registry', () => {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    const corrupt = '{ invalid: yaml: content: [';
    fs.writeFileSync(registryPath, corrupt, { mode: 0o600 });
    const reg = new CodexProfileRegistry(registryPath);
    expect(() => reg.listProfiles()).toThrow(/could not be read safely/i);
    expect(fs.readFileSync(registryPath, 'utf8')).toBe(corrupt);
  });

  it('refuses mutating writes when the registry shape is invalid', () => {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    const invalidShape = 'version: "1.0"\ndefault: null\nprofiles: []\n';
    fs.writeFileSync(registryPath, invalidShape, { mode: 0o600 });
    const reg = new CodexProfileRegistry(registryPath);

    expect(() => reg.createProfile('work')).toThrow(/profiles map/i);
    expect(fs.readFileSync(registryPath, 'utf8')).toBe(invalidShape);
  });

  it('refuses registry entries with unsafe profile names', () => {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    const unsafeRegistry =
      'version: "1.0"\ndefault: null\nprofiles:\n  ../escape:\n    type: codex\n    created: "2026-01-01T00:00:00.000Z"\n    last_used: null\n';
    fs.writeFileSync(registryPath, unsafeRegistry, { mode: 0o600 });
    const reg = new CodexProfileRegistry(registryPath);

    expect(() => reg.listProfiles()).toThrow(/invalid profile name/i);
    expect(fs.readFileSync(registryPath, 'utf8')).toBe(unsafeRegistry);
  });

  it('refuses malformed profile entries instead of activating corrupt state', () => {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    const malformedRegistry = 'version: "1.0"\ndefault: work\nprofiles:\n  work: 1\n';
    fs.writeFileSync(registryPath, malformedRegistry, { mode: 0o600 });
    const reg = new CodexProfileRegistry(registryPath);

    expect(() => reg.getDefault()).toThrow(/must be an object/i);
    expect(fs.readFileSync(registryPath, 'utf8')).toBe(malformedRegistry);
  });

  it('redacts absolute registry paths and raw YAML parser details in read errors', () => {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    const corrupt = '{ invalid yaml: [[[ sensitive-local-fragment';
    fs.writeFileSync(registryPath, corrupt, { mode: 0o600 });
    const reg = new CodexProfileRegistry(registryPath);

    let message = '';
    try {
      reg.listProfiles();
    } catch (err) {
      message = String(err);
    }

    expect(message).toContain('$CCS_HOME/.ccs/codex-profiles.yaml');
    expect(message).not.toContain(registryPath);
    expect(message).not.toContain('sensitive-local-fragment');
  });
});

describe('CodexProfileRegistry — atomic write', () => {
  it('leaves no .tmp file after successful write', () => {
    const reg = new CodexProfileRegistry(registryPath);
    reg.createProfile('work');
    const dir = path.dirname(registryPath);
    const tmpFiles = fs.readdirSync(dir).filter((f) => f.includes('.tmp.'));
    expect(tmpFiles.length).toBe(0);
  });
});

describe('CodexProfileRegistry — touchProfile', () => {
  it('updates last_used timestamp', async () => {
    const reg = new CodexProfileRegistry(registryPath);
    reg.createProfile('work');
    const before = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 5));
    reg.touchProfile('work');
    const profile = reg.getProfile('work');
    expect(typeof profile.last_used).toBe('string');
    expect((profile.last_used as string) >= before).toBe(true);
  });
});

describe('CodexProfileRegistry — updateProfile', () => {
  it('merges partial updates into existing profile', () => {
    const reg = new CodexProfileRegistry(registryPath);
    reg.createProfile('work');
    reg.updateProfile('work', { email: 'updated@example.com', plan_type: 'plus' });
    const profile = reg.getProfile('work');
    expect(profile.email).toBe('updated@example.com');
    expect(profile.plan_type).toBe('plus');
    expect(profile.type).toBe('codex');
  });

  it('throws when updating a non-existent profile', () => {
    const reg = new CodexProfileRegistry(registryPath);
    expect(() => reg.updateProfile('ghost', { email: 'x@x.com' })).toThrow(/not found/i);
  });
});

describe('CodexProfileRegistry — registry file permissions', () => {
  it('writes registry file with mode 0o600', () => {
    const reg = new CodexProfileRegistry(registryPath);
    reg.createProfile('work');
    const stat = fs.statSync(registryPath);
    // On POSIX, check owner read/write only (0o600 = 0b110_000_000 = 384)
    expect(stat.mode & 0o777).toBe(0o600);
  });
});

describe('CodexProfileRegistry — write lock', () => {
  it('serializes read-modify-write mutations through a registry lock', () => {
    const release = () => {};
    const lockSpy = spyOn(lockfile, 'lockSync').mockReturnValue(release);
    const reg = new CodexProfileRegistry(registryPath);

    reg.createProfile('work');

    expect(lockSpy).toHaveBeenCalled();
    const [lockTarget, options] = lockSpy.mock.calls[0] ?? [];
    expect(lockTarget).toBe(path.dirname(registryPath));
    expect(options).toMatchObject({ stale: 10000 });
  });

  it('waits for a contended registry lock before writing', async () => {
    const registryDir = path.dirname(registryPath);
    const readyPath = path.join(tempDir, 'holder-ready');
    const holderScript = path.join(tempDir, 'hold-registry-lock.cjs');
    fs.writeFileSync(
      holderScript,
      `
const fs = require('fs');
const lockfile = require(process.argv[4]);
const release = lockfile.lockSync(process.argv[2], { stale: 10000 });
fs.writeFileSync(process.argv[3], String(process.pid));
setTimeout(() => {
  release();
  process.exit(0);
}, 150);
setTimeout(() => process.exit(2), 5000);
process.on('SIGTERM', () => {
  try { release(); } finally { process.exit(0); }
});
`,
      'utf8'
    );

    const child = spawn(
      process.execPath,
      [
        holderScript,
        registryDir,
        readyPath,
        path.join(process.cwd(), 'node_modules', 'proper-lockfile'),
      ],
      {
        cwd: process.cwd(),
        stdio: ['ignore', 'ignore', 'pipe'],
      }
    );

    try {
      await waitForFile(readyPath);

      const reg = new CodexProfileRegistry(registryPath);
      reg.createProfile('work');

      expect(reg.hasProfile('work')).toBe(true);
    } finally {
      if (!child.killed) child.kill();
      await waitForChildExit(child);
    }
  });
});

async function waitForFile(filePath: string, timeoutMs = 1000): Promise<void> {
  const started = Date.now();
  while (!fs.existsSync(filePath)) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Timed out waiting for ${filePath}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function waitForChildExit(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => child.once('exit', () => resolve()));
}
