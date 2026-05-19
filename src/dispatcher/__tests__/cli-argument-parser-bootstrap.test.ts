/**
 * Tests for bootstrapAndParseEarlyCli() — Phase A extraction.
 *
 * Uses a real temp dir for --config-dir validation tests.
 * Mocks process.exit to assert error paths without terminating the test runner.
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import {
  bootstrapAndParseEarlyCli,
  CODEX_NATIVE_PASSTHROUGH_SUBCOMMANDS,
  getNativeCodexPassthroughArgs,
} from '../cli-argument-parser';
import { setGlobalConfigDir } from '../../utils/config-manager';

const EXPECTED_NATIVE_CODEX_SUBCOMMANDS = [
  'a',
  'app',
  'app-server',
  'apply',
  'cloud',
  'completion',
  'debug',
  'e',
  'exec',
  'exec-server',
  'features',
  'fork',
  'help',
  'login',
  'logout',
  'mcp',
  'mcp-server',
  'plugin',
  'remote-control',
  'resume',
  'review',
  'sandbox',
];

// ========== Helpers ==========

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-bootstrap-test-'));
}

function cleanupDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

// ========== Tests ==========

describe('bootstrapAndParseEarlyCli', () => {
  let originalArgv: string[];
  let originalStdoutIsTTY: boolean | undefined;
  let exitSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    originalArgv = process.argv.slice();
    originalStdoutIsTTY = process.stdout.isTTY;
    // Non-TTY so initUI and update checks don't fire
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    // Suppress CI to ensure TTY branches are testable separately
    process.env['CI'] = '1';

    // Mock process.exit so error paths don't terminate test runner
    exitSpy = spyOn(process, 'exit').mockImplementation((_code?: number | string) => {
      throw new Error(`process.exit(${_code})`);
    });
  });

  afterEach(() => {
    process.argv = originalArgv;
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalStdoutIsTTY,
      configurable: true,
    });
    delete process.env['CI'];
    setGlobalConfigDir(undefined);
    exitSpy.mockRestore();
  });

  // ---------- completion command ----------

  it('returns isCompletionCommand=true and exitNow=true for __complete args', async () => {
    const result = await bootstrapAndParseEarlyCli(['__complete', 'some', 'arg']);
    expect(result.isCompletionCommand).toBe(true);
    expect(result.exitNow).toBe(true);
  });

  // ---------- --config-dir flag ----------

  it('accepts a valid --config-dir and strips it from args', async () => {
    const tmpDir = makeTempDir();
    try {
      const result = await bootstrapAndParseEarlyCli(['--config-dir', tmpDir, 'gemini']);
      expect(result.exitNow).toBe(false);
      // --config-dir and its value must be stripped
      expect(result.args).not.toContain('--config-dir');
      expect(result.args).not.toContain(tmpDir);
      expect(result.args).toContain('gemini');
    } finally {
      cleanupDir(tmpDir);
    }
  });

  it('accepts --config-dir=<path> (= syntax) and strips it from args', async () => {
    const tmpDir = makeTempDir();
    try {
      const result = await bootstrapAndParseEarlyCli([`--config-dir=${tmpDir}`, 'gemini']);
      expect(result.exitNow).toBe(false);
      expect(result.args.some((a) => a.startsWith('--config-dir'))).toBe(false);
      expect(result.args).toContain('gemini');
    } finally {
      cleanupDir(tmpDir);
    }
  });

  it('calls process.exit when --config-dir has no value', async () => {
    await expect(bootstrapAndParseEarlyCli(['--config-dir'])).rejects.toThrow('process.exit(1)');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('calls process.exit when --config-dir value is a flag', async () => {
    await expect(bootstrapAndParseEarlyCli(['--config-dir', '--other-flag'])).rejects.toThrow(
      'process.exit(1)'
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('calls process.exit when --config-dir points to non-existent path', async () => {
    await expect(
      bootstrapAndParseEarlyCli(['--config-dir', '/tmp/does-not-exist-ccs-test-xyz'])
    ).rejects.toThrow('process.exit(1)');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('calls process.exit when --config-dir points to a file (not dir)', async () => {
    const tmpDir = makeTempDir();
    const filePath = path.join(tmpDir, 'notadir.txt');
    fs.writeFileSync(filePath, 'content');
    try {
      await expect(bootstrapAndParseEarlyCli(['--config-dir', filePath])).rejects.toThrow(
        'process.exit(1)'
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      cleanupDir(tmpDir);
    }
  });

  // ---------- legacy cursor args ----------

  it('normalizes legacy cursor args (legacy cursor → legacy-cursor profile)', async () => {
    const result = await bootstrapAndParseEarlyCli(['legacy', 'cursor', '--auth']);
    expect(result.exitNow).toBe(false);
    // normalizeLegacyCursorArgs transforms ['legacy', 'cursor', '--auth'] → ['legacy-cursor', '--auth']
    expect(result.args[0]).toBe('legacy-cursor');
    expect(result.args).toContain('--auth');
  });

  // ---------- normal passthrough ----------

  it('returns exitNow=false and preserves args for normal invocation', async () => {
    const result = await bootstrapAndParseEarlyCli(['gemini', '-p', 'hello']);
    expect(result.exitNow).toBe(false);
    expect(result.args).toContain('gemini');
    expect(result.args).toContain('-p');
    expect(result.args).toContain('hello');
  });

  it('returns browserLaunchOverride=undefined when no browser flags are present', async () => {
    const result = await bootstrapAndParseEarlyCli(['gemini']);
    expect(result.browserLaunchOverride).toBeUndefined();
  });
});

describe('native Codex passthrough parsing', () => {
  it('keeps the native Codex passthrough subcommand list explicit', () => {
    expect([...CODEX_NATIVE_PASSTHROUGH_SUBCOMMANDS].sort()).toEqual(
      EXPECTED_NATIVE_CODEX_SUBCOMMANDS
    );

    for (const subcommand of EXPECTED_NATIVE_CODEX_SUBCOMMANDS) {
      expect(getNativeCodexPassthroughArgs(['--target', 'codex', subcommand, '--help'])).toEqual([
        subcommand,
        '--help',
      ]);
      expect(
        getNativeCodexPassthroughArgs(['--target', 'codex', 'codex', subcommand, '--help'])
      ).toEqual([subcommand, '--help']);
    }
  });

  it('keeps CCS-owned codex runtime commands out of native passthrough', () => {
    for (const subcommand of ['auth', 'doctor', 'update']) {
      expect(getNativeCodexPassthroughArgs(['--target', 'codex', subcommand, '--help'])).toBeNull();
      expect(
        getNativeCodexPassthroughArgs(['--target', 'codex', 'codex', subcommand, '--help'])
      ).toBeNull();
    }
  });
});
