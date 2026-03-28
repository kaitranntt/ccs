import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { detectCodexCli, getCodexBinaryInfo } from '../../../src/targets/codex-detector';

describe('codex-detector', () => {
  let tmpDir: string;
  let originalPath: string | undefined;
  let originalCodexPath: string | undefined;
  const originalPlatform = process.platform;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-codex-detector-test-'));
    originalPath = process.env.PATH;
    originalCodexPath = process.env.CCS_CODEX_PATH;
    process.env.PATH = '';
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });

    if (originalPath !== undefined) process.env.PATH = originalPath;
    else delete process.env.PATH;

    if (originalCodexPath !== undefined) process.env.CCS_CODEX_PATH = originalCodexPath;
    else delete process.env.CCS_CODEX_PATH;

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should prefer CCS_CODEX_PATH when it points to a file', () => {
    const fakeCodex = path.join(tmpDir, 'codex');
    fs.writeFileSync(fakeCodex, '#!/bin/sh\necho codex\n');
    process.env.CCS_CODEX_PATH = fakeCodex;

    expect(detectCodexCli()).toBe(fakeCodex);
  });

  it('should return null when CCS_CODEX_PATH points to a directory', () => {
    process.env.CCS_CODEX_PATH = tmpDir;
    expect(detectCodexCli()).toBeNull();
  });

  it('should return binary info without throwing when help probing fails', () => {
    const fakeCodex = path.join(tmpDir, 'codex');
    fs.writeFileSync(fakeCodex, '');
    process.env.CCS_CODEX_PATH = fakeCodex;

    expect(() => getCodexBinaryInfo()).not.toThrow();
  });

  it('probes Windows cmd wrappers through the shell so config override support is detected', () => {
    const fakeCodex = path.join(tmpDir, 'codex.cmd');
    fs.writeFileSync(fakeCodex, '');
    process.env.CCS_CODEX_PATH = fakeCodex;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    const execFileSyncSpy = spyOn(childProcess, 'execFileSync').mockImplementation((command, args) => {
      return String(command).includes('cmd.exe') && Array.isArray(args) && args.join(' ').includes('--help')
        ? 'Codex CLI\n  -c, --config <key=value>\n'
        : 'codex-cli 0.118.0-alpha.3';
    });

    const info = getCodexBinaryInfo();

    expect(execFileSyncSpy).toHaveBeenCalled();
    expect(info?.needsShell).toBe(true);
    expect(info?.features).toContain('config-overrides');

    execFileSyncSpy.mockRestore();
  });
});
