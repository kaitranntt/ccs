import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let ensureSharedConfigSymlink: (profileDir: string, sharedConfigPath?: string) => void;

let tempDir: string;
let profileDir: string;
let sharedConfigPath: string;

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-symlink-test-'));
  profileDir = path.join(tempDir, 'profile');
  // Use a temp path for the shared config so tests never touch real ~/.codex/config.toml
  sharedConfigPath = path.join(tempDir, 'shared-config.toml');
  const mod = await import('../../../src/codex-auth/codex-config-symlink');
  ensureSharedConfigSymlink = mod.ensureSharedConfigSymlink;
});

afterEach(() => {
  mock.restore();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('ensureSharedConfigSymlink', () => {
  it('creates empty shared config and symlink when neither exists', () => {
    // Neither profileDir nor sharedConfigPath exist yet
    ensureSharedConfigSymlink(profileDir, sharedConfigPath);

    expect(fs.existsSync(sharedConfigPath)).toBe(true);
    expect(fs.readFileSync(sharedConfigPath, 'utf8')).toBe('');

    const linkPath = path.join(profileDir, 'config.toml');
    const stat = fs.lstatSync(linkPath);
    expect(stat.isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(linkPath)).toBe(sharedConfigPath);
  });

  it('is idempotent when symlink already points to correct target', () => {
    ensureSharedConfigSymlink(profileDir, sharedConfigPath);
    // Call again — should not throw
    expect(() => ensureSharedConfigSymlink(profileDir, sharedConfigPath)).not.toThrow();

    const linkPath = path.join(profileDir, 'config.toml');
    expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(linkPath)).toBe(sharedConfigPath);
  });

  it('preserves existing shared config content (does not overwrite)', () => {
    fs.writeFileSync(sharedConfigPath, '[model]\nname = "o4"', { mode: 0o600 });
    ensureSharedConfigSymlink(profileDir, sharedConfigPath);
    expect(fs.readFileSync(sharedConfigPath, 'utf8')).toBe('[model]\nname = "o4"');
  });

  it('replaces a stale symlink pointing to a wrong target with correct one', () => {
    fs.mkdirSync(profileDir, { recursive: true, mode: 0o700 });
    const wrongTarget = path.join(tempDir, 'wrong.toml');
    fs.writeFileSync(wrongTarget, '', { mode: 0o600 });
    const linkPath = path.join(profileDir, 'config.toml');
    fs.symlinkSync(wrongTarget, linkPath);

    ensureSharedConfigSymlink(profileDir, sharedConfigPath);

    expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(linkPath)).toBe(sharedConfigPath);
  });

  it('preserves an edited regular file at link path by default', () => {
    fs.mkdirSync(profileDir, { recursive: true, mode: 0o700 });
    const linkPath = path.join(profileDir, 'config.toml');
    fs.writeFileSync(sharedConfigPath, '[shared]\ndata = true', { mode: 0o600 });
    fs.writeFileSync(linkPath, '[existing]\ndata = true', { mode: 0o600 });

    // Capture stderr to verify warning was written
    const stderrChunks: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk: string | Uint8Array): boolean => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return origWrite(chunk);
    };

    try {
      ensureSharedConfigSymlink(profileDir, sharedConfigPath);
    } finally {
      process.stderr.write = origWrite;
    }

    expect(fs.lstatSync(linkPath).isFile()).toBe(true);
    expect(fs.readFileSync(linkPath, 'utf8')).toBe('[existing]\ndata = true');
    // A warning should have been emitted
    expect(stderrChunks.join('')).toMatch(/preserving existing regular config/i);
  });

  it('replaces a regular file when explicit overwrite repair is requested', () => {
    fs.mkdirSync(profileDir, { recursive: true, mode: 0o700 });
    const linkPath = path.join(profileDir, 'config.toml');
    fs.writeFileSync(linkPath, '[existing]\ndata = true', { mode: 0o600 });

    ensureSharedConfigSymlink(profileDir, sharedConfigPath, { overwriteRegularFile: true });

    expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(linkPath)).toBe(sharedConfigPath);
  });

  it('replaces a broken symlink (dangling) with correct symlink', () => {
    fs.mkdirSync(profileDir, { recursive: true, mode: 0o700 });
    const linkPath = path.join(profileDir, 'config.toml');
    // Create symlink to non-existent target
    fs.symlinkSync(path.join(tempDir, 'does-not-exist.toml'), linkPath);
    // Verify it's broken
    expect(fs.existsSync(linkPath)).toBe(false);
    expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true);

    ensureSharedConfigSymlink(profileDir, sharedConfigPath);

    expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(linkPath)).toBe(sharedConfigPath);
  });

  it('copies shared config when symlink creation fails', () => {
    fs.writeFileSync(sharedConfigPath, 'model = "gpt-5.5"\n', { mode: 0o600 });
    const linkPath = path.join(profileDir, 'config.toml');
    const symlinkSpy = spyOn(fs, 'symlinkSync').mockImplementation(() => {
      throw Object.assign(new Error('simulated symlink failure'), { code: 'EPERM' });
    });
    const stderrChunks: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk: string | Uint8Array): boolean => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    };

    try {
      ensureSharedConfigSymlink(profileDir, sharedConfigPath);
    } finally {
      process.stderr.write = origWrite;
      symlinkSpy.mockRestore();
    }

    expect(fs.lstatSync(linkPath).isFile()).toBe(true);
    expect(fs.readFileSync(linkPath, 'utf8')).toBe('model = "gpt-5.5"\n');
    expect(stderrChunks.join('')).toContain('symlink unavailable');
  });


  it('rethrows symlink errors that are not fallback-safe', () => {
    fs.writeFileSync(sharedConfigPath, 'model = "gpt-5.5"\n', { mode: 0o600 });
    const symlinkSpy = spyOn(fs, 'symlinkSync').mockImplementation(() => {
      throw Object.assign(new Error('simulated race'), { code: 'EEXIST' });
    });

    try {
      expect(() => ensureSharedConfigSymlink(profileDir, sharedConfigPath)).toThrow(/simulated race/);
    } finally {
      symlinkSpy.mockRestore();
    }
  });
  it('preserves edited fallback copies on later repair attempts', () => {
    fs.writeFileSync(sharedConfigPath, 'model = "gpt-5.5"\n', { mode: 0o600 });
    const linkPath = path.join(profileDir, 'config.toml');
    const symlinkSpy = spyOn(fs, 'symlinkSync').mockImplementation(() => {
      throw Object.assign(new Error('simulated symlink failure'), { code: 'EPERM' });
    });
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = () => true;

    try {
      ensureSharedConfigSymlink(profileDir, sharedConfigPath);
      fs.writeFileSync(linkPath, 'model = "local-edit"\n', { mode: 0o600 });
      ensureSharedConfigSymlink(profileDir, sharedConfigPath);
    } finally {
      process.stderr.write = origWrite;
      symlinkSpy.mockRestore();
    }

    expect(fs.lstatSync(linkPath).isFile()).toBe(true);
    expect(fs.readFileSync(linkPath, 'utf8')).toBe('model = "local-edit"\n');
  });
});
