import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  MIN_CLAUDE_MODS_VERSION,
  SESSION_NOTICES_MOD,
  buildSessionNoticesModArgs,
  getBundledClaudeModDir,
  getCachedClaudeCliVersion,
} from '../claude-mods';

const repoRoot = path.join(__dirname, '..', '..', '..', '..');

let tmpDir: string;
let fakeClaude: string;
let originalCcsHome: string | undefined;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-claude-mods-test-'));
  originalCcsHome = process.env.CCS_HOME;
  process.env.CCS_HOME = tmpDir;
  fakeClaude = path.join(tmpDir, 'claude');
  fs.writeFileSync(fakeClaude, '#!/bin/sh\n');
});

afterEach(() => {
  if (originalCcsHome !== undefined) process.env.CCS_HOME = originalCcsHome;
  else delete process.env.CCS_HOME;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('getBundledClaudeModDir', () => {
  it('finds the ccs-notices mod shipped in the package', () => {
    const dir = getBundledClaudeModDir(SESSION_NOTICES_MOD, repoRoot);
    expect(dir).toBe(path.join(repoRoot, 'claude-mods', SESSION_NOTICES_MOD));
  });

  it('returns null when the package lacks the mod', () => {
    expect(getBundledClaudeModDir(SESSION_NOTICES_MOD, tmpDir)).toBeNull();
  });
});

describe('buildSessionNoticesModArgs', () => {
  it('adds --plugin-dir when Claude Code supports mods', () => {
    const args = buildSessionNoticesModArgs(fakeClaude, {
      packageRoot: repoRoot,
      readVersion: () => MIN_CLAUDE_MODS_VERSION,
    });
    expect(args).toEqual(['--plugin-dir', path.join(repoRoot, 'claude-mods', SESSION_NOTICES_MOD)]);
  });

  it('adds nothing for an older or unreadable Claude Code version', () => {
    expect(
      buildSessionNoticesModArgs(fakeClaude, {
        packageRoot: repoRoot,
        readVersion: () => '2.1.289',
      })
    ).toEqual([]);
    expect(
      buildSessionNoticesModArgs(path.join(tmpDir, 'missing'), {
        packageRoot: repoRoot,
        readVersion: () => null,
      })
    ).toEqual([]);
  });

  it('adds nothing and skips the version check when the mod is not packaged', () => {
    const readVersion = jest.fn(() => '9.9.9');
    expect(buildSessionNoticesModArgs(fakeClaude, { packageRoot: tmpDir, readVersion })).toEqual(
      []
    );
    expect(readVersion).not.toHaveBeenCalled();
  });
});

describe('getCachedClaudeCliVersion', () => {
  it('reuses the cached version for the same binary', () => {
    const readVersion = jest.fn(() => '2.1.300');
    expect(getCachedClaudeCliVersion(fakeClaude, readVersion, 1_000)).toBe('2.1.300');
    expect(getCachedClaudeCliVersion(fakeClaude, readVersion, 2_000)).toBe('2.1.300');
    expect(readVersion).toHaveBeenCalledTimes(1);
  });

  it('checks again when the binary changes or the cache is a day old', () => {
    const readVersion = jest.fn(() => '2.1.300');
    getCachedClaudeCliVersion(fakeClaude, readVersion, 1_000);

    fs.appendFileSync(fakeClaude, 'echo upgraded\n');
    getCachedClaudeCliVersion(fakeClaude, readVersion, 2_000);
    expect(readVersion).toHaveBeenCalledTimes(2);

    getCachedClaudeCliVersion(fakeClaude, readVersion, 2_000 + 24 * 60 * 60 * 1000);
    expect(readVersion).toHaveBeenCalledTimes(3);
  });

  it('does not cache when the binary path cannot be resolved', () => {
    const readVersion = jest.fn(() => '2.1.300');
    const missing = path.join(tmpDir, 'not-there');
    getCachedClaudeCliVersion(missing, readVersion);
    getCachedClaudeCliVersion(missing, readVersion);
    expect(readVersion).toHaveBeenCalledTimes(2);
  });
});
