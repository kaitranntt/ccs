import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as os from 'os';
import * as path from 'path';

const wrapperPath = require.resolve('../../../src/bin/ccsxp-runtime.ts');
const ccsPath = require.resolve('../../../src/ccs.ts');

describe('ccsxp runtime wrapper', () => {
  const originalArgv = process.argv;
    const originalEntryTarget = process.env.CCS_INTERNAL_ENTRY_TARGET;
    const originalCodexHome = process.env.CODEX_HOME;
    const originalCcsCodexProfile = process.env.CCS_CODEX_PROFILE;
    const originalCcsxpCodexHome = process.env.CCSXP_CODEX_HOME;

  beforeEach(() => {
    delete require.cache[wrapperPath];
    delete require.cache[ccsPath];
  });

  afterEach(() => {
    process.argv = originalArgv;

    if (originalEntryTarget === undefined) {
      delete process.env.CCS_INTERNAL_ENTRY_TARGET;
    } else {
      process.env.CCS_INTERNAL_ENTRY_TARGET = originalEntryTarget;
    }
    if (originalCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = originalCodexHome;
    }
    if (originalCcsCodexProfile === undefined) {
      delete process.env.CCS_CODEX_PROFILE;
    } else {
      process.env.CCS_CODEX_PROFILE = originalCcsCodexProfile;
    }
    if (originalCcsxpCodexHome === undefined) {
      delete process.env.CCSXP_CODEX_HOME;
    } else {
      process.env.CCSXP_CODEX_HOME = originalCcsxpCodexHome;
    }

    delete require.cache[wrapperPath];
    delete require.cache[ccsPath];
  });

  it('prepends the cliproxy provider override before loading CCS', () => {
    process.argv = ['node', wrapperPath, 'fix failing tests'];
    require.cache[ccsPath] = { exports: {} } as NodeJS.Module;

    require(wrapperPath);

    expect(process.env.CCS_INTERNAL_ENTRY_TARGET).toBe('codex');
    expect(process.env.CODEX_HOME).toBe(path.join(os.homedir(), '.codex'));
    expect(process.argv.slice(2)).toEqual([
      '--config',
      'model_provider="cliproxy"',
      'fix failing tests',
    ]);
  });

  it('pins ccsxp history to native Codex default instead of inherited CODEX_HOME', () => {
    process.env.CODEX_HOME = '/tmp/inherited-managed-codex-home';
    process.argv = ['node', wrapperPath, '--version'];
    require.cache[ccsPath] = { exports: {} } as NodeJS.Module;

    require(wrapperPath);

    expect(process.env.CODEX_HOME).toBe(path.join(os.homedir(), '.codex'));
  });

  it('allows an explicit ccsxp Codex home override', () => {
    process.env.CODEX_HOME = '/tmp/inherited-managed-codex-home';
    process.env.CCSXP_CODEX_HOME = '/tmp/explicit-ccsxp-codex-home';
    process.argv = ['node', wrapperPath, '--version'];
    require.cache[ccsPath] = { exports: {} } as NodeJS.Module;

    require(wrapperPath);

    expect(process.env.CODEX_HOME).toBe('/tmp/explicit-ccsxp-codex-home');
  });

  it('emits a notice when CCS_CODEX_PROFILE is ignored by ccsxp', () => {
    process.env.CCS_CODEX_PROFILE = 'work';
    process.argv = ['node', wrapperPath, '--version'];
    require.cache[ccsPath] = { exports: {} } as NodeJS.Module;

    const stderrChunks: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk: string | Uint8Array): boolean => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    };
    try {
      require(wrapperPath);
    } finally {
      process.stderr.write = origWrite;
    }

    expect(process.env.CODEX_HOME).toBe(path.join(os.homedir(), '.codex'));
    expect(stderrChunks.join('')).toContain('CCS_CODEX_PROFILE is ignored by ccsxp');
  });

  it('keeps flag-only invocations routed through the native cliproxy shortcut', () => {
    process.argv = ['node', wrapperPath, '--version'];
    require.cache[ccsPath] = { exports: {} } as NodeJS.Module;

    require(wrapperPath);

    expect(process.argv.slice(2)).toEqual(['--config', 'model_provider="cliproxy"', '--version']);
  });

  it('strips user-supplied target overrides before forcing the codex shortcut target', () => {
    process.argv = ['node', wrapperPath, '--target', 'claude', '--version'];
    require.cache[ccsPath] = { exports: {} } as NodeJS.Module;

    require(wrapperPath);

    expect(process.argv.slice(2)).toEqual(['--config', 'model_provider="cliproxy"', '--version']);
  });
});
