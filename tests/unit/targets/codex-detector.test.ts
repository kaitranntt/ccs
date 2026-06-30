import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { detectCodexCli, getCodexBinaryInfo } from '../../../src/targets/codex-detector';

const CCSXP_CLIPROXY_SHORTCUT_ENV = 'CCSXP_CLIPROXY_SHORTCUT';

describe('codex-detector', () => {
  let tmpDir: string;
  let originalPath: string | undefined;
  let originalCodexPath: string | undefined;
  let originalProbeEnv: Record<string, string | undefined>;
  const probeEnvKeys = [
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_API_KEY',
    'CCS_BROWSER_DEVTOOLS_URL',
    'CODEX_THREAD_ID',
    'CCS_CODEX_API_KEY',
    CCSXP_CLIPROXY_SHORTCUT_ENV,
    'CCS_SAFE_VALUE',
  ];
  const originalPlatform = process.platform;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-codex-detector-test-'));
    originalPath = process.env.PATH;
    originalCodexPath = process.env.CCS_CODEX_PATH;
    originalProbeEnv = Object.fromEntries(probeEnvKeys.map((key) => [key, process.env[key]]));
    process.env.PATH = '';
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });

    if (originalPath !== undefined) process.env.PATH = originalPath;
    else delete process.env.PATH;

    if (originalCodexPath !== undefined) process.env.CCS_CODEX_PATH = originalCodexPath;
    else delete process.env.CCS_CODEX_PATH;

    for (const key of probeEnvKeys) {
      if (originalProbeEnv[key] !== undefined) process.env[key] = originalProbeEnv[key];
      else delete process.env[key];
    }

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

    const spawnSyncSpy = spyOn(childProcess, 'spawnSync').mockImplementation((command) => {
      const commandString = String(command);
      return {
        pid: 123,
        output: ['', '', ''],
        stdout: commandString.includes('--help')
          ? 'Codex CLI\n  -c, --config <key=value>\n'
          : 'codex-cli 0.118.0-alpha.3',
        stderr: '',
        status: 0,
        signal: null,
      } as unknown as ReturnType<typeof childProcess.spawnSync>;
    });

    const info = getCodexBinaryInfo();
    const calls = spawnSyncSpy.mock.calls;
    const cmdWrapperProbeCall = calls.find(([command]) => {
      return String(command).includes(fakeCodex);
    });

    expect(spawnSyncSpy).toHaveBeenCalled();
    expect(cmdWrapperProbeCall).toBeDefined();
    expect((cmdWrapperProbeCall?.[1] as Record<string, unknown> | undefined)?.shell).toBe(
      'C:\\Windows\\System32\\cmd.exe'
    );
    expect(info?.needsShell).toBe(true);
    expect(info?.features).toContain('config-overrides');

    spawnSyncSpy.mockRestore();
  });

  it('keeps the cmd wrapper when Windows PATH exposes codex.cmd and a sibling ps1 also exists', () => {
    const fakeCmdCodex = path.join(tmpDir, 'codex.cmd');
    const fakePsCodex = path.join(tmpDir, 'codex.ps1');
    fs.writeFileSync(fakeCmdCodex, '');
    fs.writeFileSync(fakePsCodex, '');
    Object.defineProperty(process, 'platform', { value: 'win32' });

    const execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(
      () => `${fakeCmdCodex}\n`
    );

    expect(detectCodexCli()).toBe(fakeCmdCodex);

    execSyncSpy.mockRestore();
  });

  it('replaces a Windows PowerShell wrapper with a sibling cmd shim when PATH returns codex.ps1', () => {
    const fakeCmdCodex = path.join(tmpDir, 'codex.cmd');
    const fakePsCodex = path.join(tmpDir, 'codex.ps1');
    fs.writeFileSync(fakeCmdCodex, '');
    fs.writeFileSync(fakePsCodex, '');
    Object.defineProperty(process, 'platform', { value: 'win32' });

    const execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(
      () => `${fakePsCodex}\n`
    );

    expect(detectCodexCli()).toBe(fakeCmdCodex);

    execSyncSpy.mockRestore();
  });

  it('runs Codex feature probes with the same sensitive env stripping used for Codex launches', () => {
    const fakeCodex = path.join(tmpDir, 'codex');
    fs.writeFileSync(fakeCodex, '');
    process.env.CCS_CODEX_PATH = fakeCodex;
    process.env.ANTHROPIC_AUTH_TOKEN = 'secret-auth-token';
    process.env.ANTHROPIC_API_KEY = 'secret-api-key';
    process.env.CCS_BROWSER_DEVTOOLS_URL = 'ws://127.0.0.1:9222/devtools/browser/secret';
    process.env.CODEX_THREAD_ID = 'thread-secret';
    process.env.CCS_CODEX_API_KEY = 'runtime-secret';
    process.env[CCSXP_CLIPROXY_SHORTCUT_ENV] = '1';
    process.env.CCS_SAFE_VALUE = 'safe-value';

    const execFileSyncSpy = spyOn(childProcess, 'execFileSync').mockImplementation(() => {
      return 'codex-cli 0.119.0-alpha.1';
    });

    const info = getCodexBinaryInfo();

    expect(info?.features).toContain('config-overrides');
    const probeOptions = execFileSyncSpy.mock.calls
      .map((call) => call[2] as { env?: NodeJS.ProcessEnv } | undefined)
      .find((options) => options?.env);
    expect(probeOptions?.env?.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(probeOptions?.env?.ANTHROPIC_API_KEY).toBeUndefined();
    expect(probeOptions?.env?.CCS_BROWSER_DEVTOOLS_URL).toBeUndefined();
    expect(probeOptions?.env?.CODEX_THREAD_ID).toBeUndefined();
    expect(probeOptions?.env?.CCS_CODEX_API_KEY).toBeUndefined();
    expect(probeOptions?.env?.[CCSXP_CLIPROXY_SHORTCUT_ENV]).toBeUndefined();
    expect(probeOptions?.env?.CCS_SAFE_VALUE).toBe('safe-value');

    execFileSyncSpy.mockRestore();
  });

  it('falls back to a direct -c probe when help text omits the config flag', () => {
    const fakeCodex = path.join(tmpDir, 'codex');
    fs.writeFileSync(fakeCodex, '');
    process.env.CCS_CODEX_PATH = fakeCodex;

    const execFileSyncSpy = spyOn(childProcess, 'execFileSync').mockImplementation(
      (command, args) => {
        const joinedArgs = Array.isArray(args) ? args.join(' ') : '';

        if (joinedArgs.includes('--help')) {
          return 'Codex CLI\n';
        }

        if (joinedArgs.includes('-c') && joinedArgs.includes('--version')) {
          return 'codex-cli 0.119.0-alpha.1';
        }

        return 'codex-cli 0.119.0-alpha.1';
      }
    );

    const info = getCodexBinaryInfo();

    expect(info?.features).toContain('config-overrides');

    execFileSyncSpy.mockRestore();
  });

  it('still detects support from broader help text when the direct probe fails', () => {
    const fakeCodex = path.join(tmpDir, 'codex');
    fs.writeFileSync(fakeCodex, '');
    process.env.CCS_CODEX_PATH = fakeCodex;

    const execFileSyncSpy = spyOn(childProcess, 'execFileSync').mockImplementation(
      (command, args) => {
        const joinedArgs = Array.isArray(args) ? args.join(' ') : '';

        if (joinedArgs.includes('--help')) {
          return 'Codex CLI\n  -c, --config <CONFIG_OVERRIDE>\n';
        }

        if (joinedArgs.includes('-c') && joinedArgs.includes('--version')) {
          throw new Error('unsupported');
        }

        return 'codex-cli 0.119.0-alpha.1';
      }
    );

    const info = getCodexBinaryInfo();

    expect(info?.features).toContain('config-overrides');

    execFileSyncSpy.mockRestore();
  });
});
