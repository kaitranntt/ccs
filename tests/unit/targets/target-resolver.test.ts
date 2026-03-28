/**
 * Unit tests for target resolver
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { resolveTargetType, stripTargetFlag } from '../../../src/targets/target-resolver';

describe('resolveTargetType', () => {
  const originalArgv = process.argv;
  const originalDroidAliases = process.env.CCS_DROID_ALIASES;
  const originalCodexAliases = process.env.CCS_CODEX_ALIASES;
  const originalTargetAliases = process.env.CCS_TARGET_ALIASES;
  const originalInternalEntryTarget = process.env.CCS_INTERNAL_ENTRY_TARGET;

  afterEach(() => {
    process.argv = originalArgv;
    if (originalDroidAliases === undefined) {
      delete process.env.CCS_DROID_ALIASES;
    } else {
      process.env.CCS_DROID_ALIASES = originalDroidAliases;
    }

    if (originalCodexAliases === undefined) {
      delete process.env.CCS_CODEX_ALIASES;
    } else {
      process.env.CCS_CODEX_ALIASES = originalCodexAliases;
    }

    if (originalTargetAliases === undefined) {
      delete process.env.CCS_TARGET_ALIASES;
    } else {
      process.env.CCS_TARGET_ALIASES = originalTargetAliases;
    }

    if (originalInternalEntryTarget === undefined) {
      delete process.env.CCS_INTERNAL_ENTRY_TARGET;
    } else {
      process.env.CCS_INTERNAL_ENTRY_TARGET = originalInternalEntryTarget;
    }
  });

  it('should return claude as default', () => {
    process.argv = ['node', 'ccs'];
    expect(resolveTargetType([])).toBe('claude');
  });

  it('should detect --target flag', () => {
    process.argv = ['node', 'ccs'];
    expect(resolveTargetType(['--target', 'droid'])).toBe('droid');
  });

  it('should detect --target codex', () => {
    process.argv = ['node', 'ccs'];
    expect(resolveTargetType(['--target', 'codex'])).toBe('codex');
  });

  it('should detect --target claude', () => {
    process.argv = ['node', 'ccs'];
    expect(resolveTargetType(['--target', 'claude'])).toBe('claude');
  });

  it('should use per-profile config when no flag', () => {
    process.argv = ['node', 'ccs'];
    expect(resolveTargetType([], { target: 'droid' })).toBe('droid');
  });

  it('should fallback to claude when persisted profile target is invalid', () => {
    process.argv = ['node', 'ccs'];
    expect(resolveTargetType([], { target: 'invalid-target' as never })).toBe('claude');
  });

  it('should ignore runtime-only codex target when it appears in persisted profile config', () => {
    process.argv = ['node', 'ccs'];
    expect(resolveTargetType([], { target: 'codex' })).toBe('claude');
  });

  it('should prioritize --target flag over profile config', () => {
    process.argv = ['node', 'ccs'];
    expect(resolveTargetType(['--target', 'claude'], { target: 'droid' })).toBe('claude');
  });

  it('should detect ccsd argv[0] (busybox pattern)', () => {
    process.argv = ['node', 'ccsd'];
    expect(resolveTargetType([])).toBe('droid');
  });

  it('should detect built-in ccs-droid argv[0] alias', () => {
    process.argv = ['node', 'ccs-droid'];
    expect(resolveTargetType([])).toBe('droid');
  });

  it('should detect built-in ccs-codex argv[0] alias', () => {
    process.argv = ['node', 'ccs-codex'];
    expect(resolveTargetType([])).toBe('codex');
  });

  it('should detect built-in ccsx argv[0] alias', () => {
    process.argv = ['node', 'ccsx'];
    expect(resolveTargetType([])).toBe('codex');
  });

  it('should detect custom target aliases from CCS_TARGET_ALIASES', () => {
    process.env.CCS_TARGET_ALIASES = 'droid=droidx,my-droid';
    process.argv = ['node', 'my-droid'];
    expect(resolveTargetType([])).toBe('droid');
  });

  it('should detect codex aliases from CCS_TARGET_ALIASES', () => {
    process.env.CCS_TARGET_ALIASES = 'codex=codexx,team-codex';
    process.argv = ['node', 'team-codex'];
    expect(resolveTargetType([])).toBe('codex');
  });

  it('should ignore unsupported targets in CCS_TARGET_ALIASES', () => {
    process.env.CCS_TARGET_ALIASES = 'not-a-target=mystery-codex;droid=ccs-droid-custom';
    process.argv = ['node', 'mystery-codex'];
    expect(resolveTargetType([])).toBe('claude');
  });

  it('should detect custom argv[0] aliases from CCS_DROID_ALIASES', () => {
    process.env.CCS_DROID_ALIASES = 'droidx,my-droid';
    process.argv = ['node', 'my-droid'];
    expect(resolveTargetType([])).toBe('droid');
  });

  it('should detect custom argv[0] aliases from CCS_CODEX_ALIASES', () => {
    process.env.CCS_CODEX_ALIASES = 'codexx,my-codex';
    process.argv = ['node', 'my-codex'];
    expect(resolveTargetType([])).toBe('codex');
  });

  it('should merge CCS_TARGET_ALIASES and CCS_DROID_ALIASES', () => {
    process.env.CCS_TARGET_ALIASES = 'droid=team-droid';
    process.env.CCS_DROID_ALIASES = 'legacy-droid';

    process.argv = ['node', 'team-droid'];
    expect(resolveTargetType([])).toBe('droid');

    process.argv = ['node', 'legacy-droid'];
    expect(resolveTargetType([])).toBe('droid');
  });

  it('should merge CCS_TARGET_ALIASES and CCS_CODEX_ALIASES', () => {
    process.env.CCS_TARGET_ALIASES = 'codex=team-codex';
    process.env.CCS_CODEX_ALIASES = 'legacy-codex';

    process.argv = ['node', 'team-codex'];
    expect(resolveTargetType([])).toBe('codex');

    process.argv = ['node', 'legacy-codex'];
    expect(resolveTargetType([])).toBe('codex');
  });

  it('should ignore invalid custom alias entries', () => {
    process.env.CCS_DROID_ALIASES = 'valid_alias,../bad,';
    process.argv = ['node', '../bad'];
    expect(resolveTargetType([])).toBe('claude');
  });

  it('should detect internal entry target for dedicated package bin entrypoints', () => {
    process.env.CCS_INTERNAL_ENTRY_TARGET = 'droid';
    process.argv = ['node', 'ccs'];
    expect(resolveTargetType([])).toBe('droid');
  });

  it('should detect internal entry target for codex runtime bins', () => {
    process.env.CCS_INTERNAL_ENTRY_TARGET = 'codex';
    process.argv = ['node', 'ccs'];
    expect(resolveTargetType([])).toBe('codex');
  });

  it('should normalize argv[0] and custom aliases case-insensitively', () => {
    process.env.CCS_DROID_ALIASES = 'DroidCaps';
    process.argv = ['node', 'DROIDCAPS'];
    expect(resolveTargetType([])).toBe('droid');
  });

  it('should strip .cmd extension on Windows argv[0]', () => {
    process.argv = ['node', 'ccsd.cmd'];
    expect(resolveTargetType([])).toBe('droid');
  });

  it('should strip .cmd extension on built-in explicit alias', () => {
    process.argv = ['node', 'ccs-droid.cmd'];
    expect(resolveTargetType([])).toBe('droid');
  });

  it('should strip .cmd extension on built-in codex alias', () => {
    process.argv = ['node', 'ccs-codex.cmd'];
    expect(resolveTargetType([])).toBe('codex');
  });

  it('should strip .bat extension on Windows argv[0]', () => {
    process.argv = ['node', 'ccsd.bat'];
    expect(resolveTargetType([])).toBe('droid');
  });

  it('should strip .bat extension on codex shortcut alias', () => {
    process.argv = ['node', 'ccsx.bat'];
    expect(resolveTargetType([])).toBe('codex');
  });

  it('should strip .ps1 extension on Windows argv[0]', () => {
    process.argv = ['node', 'ccsd.ps1'];
    expect(resolveTargetType([])).toBe('droid');
  });

  it('should strip .exe extension on Windows argv[0]', () => {
    process.argv = ['node', 'ccsd.exe'];
    expect(resolveTargetType([])).toBe('droid');
  });

  it('should handle full path argv[0]', () => {
    process.argv = ['node', '/usr/local/bin/ccsd'];
    expect(resolveTargetType([])).toBe('droid');
  });

  it('should handle full path argv[0] for ccs-droid', () => {
    process.argv = ['node', '/usr/local/bin/ccs-droid'];
    expect(resolveTargetType([])).toBe('droid');
  });

  it('should handle full path argv[0] for ccs-codex', () => {
    process.argv = ['node', '/usr/local/bin/ccs-codex'];
    expect(resolveTargetType([])).toBe('codex');
  });

  it('should prioritize --target over argv[0]', () => {
    process.argv = ['node', 'ccsd'];
    expect(resolveTargetType(['--target', 'claude'])).toBe('claude');
  });

  it('should prioritize --target over internal entry target', () => {
    process.env.CCS_INTERNAL_ENTRY_TARGET = 'droid';
    process.argv = ['node', 'ccs'];
    expect(resolveTargetType(['--target', 'claude'])).toBe('claude');
  });

  it('should prioritize runtime alias over profile config', () => {
    process.argv = ['node', 'ccsd'];
    expect(resolveTargetType([], { target: 'claude' })).toBe('droid');
  });

  it('should prioritize internal entry target over profile config', () => {
    process.env.CCS_INTERNAL_ENTRY_TARGET = 'droid';
    process.argv = ['node', 'ccs'];
    expect(resolveTargetType([], { target: 'claude' })).toBe('droid');
  });

  it('should keep reserved command names authoritative', () => {
    process.env.CCS_TARGET_ALIASES =
      'claude=ccs,ccs-droid,ccsd,ccs-codex,ccsx;droid=mydroid;codex=mycodex';
    process.env.CCS_DROID_ALIASES = 'ccs,ccs-droid,ccsd,legacy-droid';
    process.env.CCS_CODEX_ALIASES = 'ccs,ccs-codex,ccsx,legacy-codex';

    process.argv = ['node', 'ccs'];
    expect(resolveTargetType([])).toBe('claude');

    process.argv = ['node', 'ccs-droid'];
    expect(resolveTargetType([])).toBe('droid');

    process.argv = ['node', 'ccsd'];
    expect(resolveTargetType([])).toBe('droid');

    process.argv = ['node', 'ccs-codex'];
    expect(resolveTargetType([])).toBe('codex');

    process.argv = ['node', 'ccsx'];
    expect(resolveTargetType([])).toBe('codex');

    process.argv = ['node', 'mydroid'];
    expect(resolveTargetType([])).toBe('droid');

    process.argv = ['node', 'legacy-droid'];
    expect(resolveTargetType([])).toBe('droid');

    process.argv = ['node', 'mycodex'];
    expect(resolveTargetType([])).toBe('codex');

    process.argv = ['node', 'legacy-codex'];
    expect(resolveTargetType([])).toBe('codex');
  });

  it('should throw for invalid --target value', () => {
    process.argv = ['node', 'ccs'];
    expect(() => resolveTargetType(['--target', 'invalid'])).toThrow(/Unknown target "invalid"/);
  });

  it('should support --target=<value> form', () => {
    process.argv = ['node', 'ccs'];
    expect(resolveTargetType(['--target=droid'])).toBe('droid');
  });

  it('should throw when --target is missing value', () => {
    process.argv = ['node', 'ccs'];
    expect(() => resolveTargetType(['--target'])).toThrow(/--target requires a value/);
  });

  it('should throw when --target value is another flag', () => {
    process.argv = ['node', 'ccs'];
    expect(() => resolveTargetType(['--target', '--help'])).toThrow(/--target requires a value/);
  });

  it('should use last --target flag when repeated', () => {
    process.argv = ['node', 'ccs'];
    expect(resolveTargetType(['--target', 'droid', '--target=claude'])).toBe('claude');
  });

  it('should ignore --target after option terminator', () => {
    process.argv = ['node', 'ccs'];
    expect(resolveTargetType(['--', '--target', 'droid'])).toBe('claude');
  });
});

describe('stripTargetFlag', () => {
  it('should remove --target and its value', () => {
    expect(stripTargetFlag(['gemini', '--target', 'droid'])).toEqual(['gemini']);
  });

  it('should handle --target at start', () => {
    expect(stripTargetFlag(['--target', 'droid', 'gemini'])).toEqual(['gemini']);
  });

  it('should return args unchanged if no --target', () => {
    const args = ['gemini', '-p', 'hello'];
    expect(stripTargetFlag(args)).toEqual(['gemini', '-p', 'hello']);
  });

  it('should remove --target=<value> form', () => {
    expect(stripTargetFlag(['gemini', '--target=droid', '--verbose'])).toEqual([
      'gemini',
      '--verbose',
    ]);
  });

  it('should remove repeated --target flags', () => {
    expect(
      stripTargetFlag(['--target', 'droid', 'gemini', '--target=claude', '--verbose'])
    ).toEqual(['gemini', '--verbose']);
  });

  it('should throw when --target has no value', () => {
    expect(() => stripTargetFlag(['gemini', '--target'])).toThrow(/--target requires a value/);
  });

  it('should throw when --target value is another flag', () => {
    expect(() => stripTargetFlag(['gemini', '--target', '--help'])).toThrow(
      /--target requires a value/
    );
  });

  it('should not modify the original array', () => {
    const args = ['--target', 'droid', 'gemini'];
    stripTargetFlag(args);
    expect(args).toEqual(['--target', 'droid', 'gemini']);
  });

  it('should preserve args after option terminator', () => {
    expect(stripTargetFlag(['glm', '--', '--target', 'droid', '-p'])).toEqual([
      'glm',
      '--',
      '--target',
      'droid',
      '-p',
    ]);
  });
});
