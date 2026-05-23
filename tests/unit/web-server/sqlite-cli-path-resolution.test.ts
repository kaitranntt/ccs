/**
 * Tests for sqlite-cli.ts cross-platform path resolution and CCS_SQLITE_BIN
 * env-var override.
 *
 * Threat model (PR #1347 follow-up): PATH-hijack via a writable PATH entry.
 * The env-var escape hatch must NOT reintroduce that vector: only binaries
 * whose realpath resolves under a trusted system prefix are accepted.
 */
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  getPlatformTrustedPrefixes,
  resolveTrustedSqlitePath,
  validateEnvOverridePath,
} from '../../../src/web-server/usage/sqlite-cli';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempExecutable(dir: string, name: string): string {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, '#!/bin/sh\nexec sqlite3 "$@"\n', { mode: 0o755 });
  return filePath;
}

// ---------------------------------------------------------------------------
// validateEnvOverridePath
// ---------------------------------------------------------------------------

describe('validateEnvOverridePath', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-sqlite-test-'));
  });

  afterEach(() => {
    mock.restore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('rejects a path under /tmp (user-writable)', () => {
    if (process.platform === 'win32') return; // skip on Windows

    const fakebin = makeTempExecutable(tempDir, 'sqlite3');

    // Make realpathSync return the /tmp path itself
    const realpathSpy = spyOn(fs, 'realpathSync').mockImplementation(() => fakebin as string);

    expect(() => validateEnvOverridePath(fakebin)).toThrow(
      /does not resolve under a trusted system prefix/
    );

    realpathSpy.mockRestore();
  });

  it('rejects a path under $HOME/.local', () => {
    if (process.platform === 'win32') return;

    const homeLocalBin = path.join(os.homedir(), '.local', 'bin', 'sqlite3');
    const realpathSpy = spyOn(fs, 'realpathSync').mockImplementation(() => homeLocalBin as string);
    const accessSpy = spyOn(fs, 'accessSync').mockImplementation(() => undefined);

    expect(() => validateEnvOverridePath(homeLocalBin)).toThrow(
      /does not resolve under a trusted system prefix/
    );

    realpathSpy.mockRestore();
    accessSpy.mockRestore();
  });

  it('accepts a path under /usr/bin (trusted Unix prefix)', () => {
    if (process.platform === 'win32') return;

    const trustedPath = '/usr/bin/sqlite3';
    const realpathSpy = spyOn(fs, 'realpathSync').mockImplementation(() => trustedPath as string);
    const accessSpy = spyOn(fs, 'accessSync').mockImplementation(() => undefined);

    expect(() => validateEnvOverridePath(trustedPath)).not.toThrow();
    const result = validateEnvOverridePath(trustedPath);
    expect(result).toBe(trustedPath);

    realpathSpy.mockRestore();
    accessSpy.mockRestore();
  });

  it('accepts a NixOS-style path under /nix/store (immutable)', () => {
    if (process.platform === 'win32') return;

    const nixPath = '/nix/store/abc123-sqlite-3.45.0/bin/sqlite3';
    const realpathSpy = spyOn(fs, 'realpathSync').mockImplementation(() => nixPath as string);
    const accessSpy = spyOn(fs, 'accessSync').mockImplementation(() => undefined);

    expect(() => validateEnvOverridePath(nixPath)).not.toThrow();
    const result = validateEnvOverridePath(nixPath);
    expect(result).toBe(nixPath);

    realpathSpy.mockRestore();
    accessSpy.mockRestore();
  });

  it('accepts a MacPorts path under /opt/local (trusted)', () => {
    if (process.platform === 'win32') return;

    const macPortsPath = '/opt/local/bin/sqlite3';
    const realpathSpy = spyOn(fs, 'realpathSync').mockImplementation(() => macPortsPath as string);
    const accessSpy = spyOn(fs, 'accessSync').mockImplementation(() => undefined);

    expect(() => validateEnvOverridePath(macPortsPath)).not.toThrow();

    realpathSpy.mockRestore();
    accessSpy.mockRestore();
  });

  it('rejects a non-existent path', () => {
    expect(() => validateEnvOverridePath('/nonexistent/path/to/sqlite3')).toThrow(
      /could not be resolved/
    );
  });

  it('resolves symlinks before checking prefix — rejects symlink pointing into /tmp', () => {
    if (process.platform === 'win32') return;

    // Simulate: /usr/local/bin/sqlite3-link -> /tmp/evil-sqlite3
    const evilTarget = path.join(tempDir, 'evil-sqlite3');
    makeTempExecutable(tempDir, 'evil-sqlite3');

    const realpathSpy = spyOn(fs, 'realpathSync').mockImplementation(() => evilTarget as string);
    const accessSpy = spyOn(fs, 'accessSync').mockImplementation(() => undefined);

    // The symlink source looks trusted, but the realpath (evilTarget in /tmp) is not
    expect(() => validateEnvOverridePath('/usr/local/bin/sqlite3-link')).toThrow(
      /does not resolve under a trusted system prefix/
    );

    realpathSpy.mockRestore();
    accessSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// resolveTrustedSqlitePath — env-var override
// ---------------------------------------------------------------------------

describe('resolveTrustedSqlitePath with CCS_SQLITE_BIN', () => {
  afterEach(() => {
    mock.restore();
  });

  it('uses CCS_SQLITE_BIN when set and valid', () => {
    if (process.platform === 'win32') return;

    const nixPath = '/nix/store/xyz-sqlite/bin/sqlite3';
    const realpathSpy = spyOn(fs, 'realpathSync').mockImplementation(() => nixPath as string);
    const accessSpy = spyOn(fs, 'accessSync').mockImplementation(() => undefined);

    const result = resolveTrustedSqlitePath({ CCS_SQLITE_BIN: nixPath });
    expect(result).toBe(nixPath);

    realpathSpy.mockRestore();
    accessSpy.mockRestore();
  });

  it('throws when CCS_SQLITE_BIN points to /tmp', () => {
    if (process.platform === 'win32') return;

    const tmpBin = '/tmp/sqlite3';
    const realpathSpy = spyOn(fs, 'realpathSync').mockImplementation(() => tmpBin as string);
    const accessSpy = spyOn(fs, 'accessSync').mockImplementation(() => undefined);

    expect(() => resolveTrustedSqlitePath({ CCS_SQLITE_BIN: tmpBin })).toThrow(
      /does not resolve under a trusted system prefix/
    );

    realpathSpy.mockRestore();
    accessSpy.mockRestore();
  });

  it('ignores CCS_SQLITE_BIN when set to empty string and falls through to platform list', () => {
    if (process.platform === 'win32') return;

    // No accessible paths on platform list → should throw "not available"
    const accessSpy = spyOn(fs, 'accessSync').mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const realpathSpy = spyOn(fs, 'realpathSync').mockImplementation((p: fs.PathLike) => p as string);

    expect(() => resolveTrustedSqlitePath({ CCS_SQLITE_BIN: '' })).toThrow(
      'sqlite3 command not available'
    );

    accessSpy.mockRestore();
    realpathSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// resolveTrustedSqlitePath — platform trusted-path list
// ---------------------------------------------------------------------------

describe('resolveTrustedSqlitePath platform path list', () => {
  afterEach(() => {
    mock.restore();
  });

  it('returns the first accessible Unix trusted path', () => {
    if (process.platform === 'win32') return;

    // Simulate /usr/bin/sqlite3 missing, /usr/local/bin/sqlite3 present
    let callCount = 0;
    const realpathSpy = spyOn(fs, 'realpathSync').mockImplementation((p: fs.PathLike) => p as string);
    const accessSpy = spyOn(fs, 'accessSync').mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw new Error('ENOENT'); // /usr/bin/sqlite3 missing
      // /usr/local/bin/sqlite3 accessible
    });

    const result = resolveTrustedSqlitePath({});
    expect(result).toBe('/usr/local/bin/sqlite3');

    accessSpy.mockRestore();
    realpathSpy.mockRestore();
  });

  it('throws "not available" when no trusted path exists and no env override', () => {
    if (process.platform === 'win32') return;

    const realpathSpy = spyOn(fs, 'realpathSync').mockImplementation((p: fs.PathLike) => p as string);
    const accessSpy = spyOn(fs, 'accessSync').mockImplementation(() => {
      throw new Error('ENOENT');
    });

    expect(() => resolveTrustedSqlitePath({})).toThrow('sqlite3 command not available');

    accessSpy.mockRestore();
    realpathSpy.mockRestore();
  });

  it('Windows: returns via CCS_SQLITE_BIN since hardcoded list is empty', () => {
    if (process.platform !== 'win32') return;

    const winPath = 'C:\\Program Files\\SQLite\\sqlite3.exe';
    const realpathSpy = spyOn(fs, 'realpathSync').mockImplementation(() => winPath as string);
    const accessSpy = spyOn(fs, 'accessSync').mockImplementation(() => undefined);

    const result = resolveTrustedSqlitePath({ CCS_SQLITE_BIN: winPath });
    expect(result.toLowerCase()).toContain('program files');

    realpathSpy.mockRestore();
    accessSpy.mockRestore();
  });

  it('Windows: throws "not available" when no env override provided', () => {
    if (process.platform !== 'win32') return;

    // On Windows, TRUSTED_SQLITE_PATHS_WINDOWS is empty, so without env var it throws.
    expect(() => resolveTrustedSqlitePath({})).toThrow('sqlite3 command not available');
  });
});

// ---------------------------------------------------------------------------
// getPlatformTrustedPrefixes
// ---------------------------------------------------------------------------

describe('getPlatformTrustedPrefixes', () => {
  it('returns non-empty array', () => {
    const prefixes = getPlatformTrustedPrefixes();
    expect(prefixes.length).toBeGreaterThan(0);
  });

  it('all prefixes end with a separator to prevent prefix-spoofing', () => {
    // e.g. "/nix/store" without trailing slash would match "/nix/store-evil/"
    const prefixes = getPlatformTrustedPrefixes();
    for (const prefix of prefixes) {
      const endsWithSep =
        process.platform === 'win32' ? prefix.endsWith('\\') : prefix.endsWith('/');
      expect(endsWithSep).toBe(true);
    }
  });
});
