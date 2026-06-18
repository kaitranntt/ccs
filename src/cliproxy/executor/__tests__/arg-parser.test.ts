/**
 * Unit tests for arg-parser.ts (Phase 02)
 *
 * Tests cover:
 * - readOptionValue: --flag value and --flag=value forms
 * - hasGitLabTokenLoginFlag
 * - filterCcsFlags / CCS_FLAGS
 * - parseExecutorFlags: parse output and early-exit behavior
 * - validateFlagCombinations: pass and fail cases
 */

import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test';
import {
  readOptionValue,
  hasGitLabTokenLoginFlag,
  CCS_FLAGS,
  filterCcsFlags,
  parseExecutorFlags,
  validateFlagCombinations,
  type ParsedExecutorFlags,
} from '../arg-parser';
import type { UnifiedConfig } from '../../../config/unified-config-types';

/** Minimal stub for UnifiedConfig — avoids loading js-yaml via the full loader. */
function makeEmptyUnifiedConfig(): UnifiedConfig {
  return {} as UnifiedConfig;
}

// ── readOptionValue ────────────────────────────────────────────────────────────

describe('readOptionValue', () => {
  it('parses space-separated form: --flag value', () => {
    expect(
      readOptionValue(
        ['--kiro-idc-start-url', 'https://d-123.awsapps.com/start'],
        '--kiro-idc-start-url'
      )
    ).toEqual({
      present: true,
      value: 'https://d-123.awsapps.com/start',
      missingValue: false,
    });
  });

  it('parses equals form: --flag=value', () => {
    expect(readOptionValue(['--kiro-idc-flow=device'], '--kiro-idc-flow')).toEqual({
      present: true,
      value: 'device',
      missingValue: false,
    });
  });

  it('returns missingValue=true when flag present but no value (next is a flag)', () => {
    expect(readOptionValue(['--kiro-idc-region', '--other-flag'], '--kiro-idc-region')).toEqual({
      present: true,
      value: undefined,
      missingValue: true,
    });
  });

  it('returns missingValue=true when flag is last arg', () => {
    expect(readOptionValue(['--kiro-idc-region'], '--kiro-idc-region')).toEqual({
      present: true,
      value: undefined,
      missingValue: true,
    });
  });

  it('returns missingValue=true for empty equals form: --flag=', () => {
    expect(readOptionValue(['--kiro-idc-flow='], '--kiro-idc-flow')).toEqual({
      present: true,
      value: undefined,
      missingValue: true,
    });
  });

  it('returns present=false when flag not in args', () => {
    expect(readOptionValue(['--other', 'val'], '--kiro-idc-region')).toEqual({
      present: false,
      missingValue: false,
    });
  });

  it('trims surrounding whitespace from the value', () => {
    const result = readOptionValue(
      ['--gitlab-url', '  https://gitlab.example.com  '],
      '--gitlab-url'
    );
    expect(result.value).toBe('https://gitlab.example.com');
  });
});

// ── hasGitLabTokenLoginFlag ────────────────────────────────────────────────────

describe('hasGitLabTokenLoginFlag', () => {
  it('detects --gitlab-token-login', () => {
    expect(hasGitLabTokenLoginFlag(['--gitlab-token-login'])).toBe(true);
  });

  it('detects --token-login', () => {
    expect(hasGitLabTokenLoginFlag(['--token-login'])).toBe(true);
  });

  it('returns false when neither flag present', () => {
    expect(hasGitLabTokenLoginFlag(['--gitlab-url', 'https://gitlab.example.com'])).toBe(false);
    expect(hasGitLabTokenLoginFlag([])).toBe(false);
  });
});

// ── CCS_FLAGS / filterCcsFlags ─────────────────────────────────────────────────

describe('CCS_FLAGS and filterCcsFlags', () => {
  it('CCS_FLAGS includes known CCS-specific flags', () => {
    expect(CCS_FLAGS).toContain('--auth');
    expect(CCS_FLAGS).toContain('--accounts');
    expect(CCS_FLAGS).toContain('--use');
    expect(CCS_FLAGS).toContain('--kiro-auth-method');
    expect(CCS_FLAGS).toContain('--thinking');
    expect(CCS_FLAGS).toContain('--1m');
    expect(CCS_FLAGS).toContain('--no-1m');
    expect(CCS_FLAGS).toContain('--proxy-host');
  });

  it('filterCcsFlags strips known flags and their values', () => {
    const args = ['--use', 'myaccount', '--print', 'hello'];
    expect(filterCcsFlags(args)).toEqual(['--print', 'hello']);
  });

  it('filterCcsFlags strips --auth (no value)', () => {
    expect(filterCcsFlags(['--auth', '--some-claude-flag'])).toEqual(['--some-claude-flag']);
  });

  it('filterCcsFlags strips equals-form flags', () => {
    const args = ['--kiro-auth-method=aws', '--model', 'claude-3'];
    expect(filterCcsFlags(args)).toEqual(['--model', 'claude-3']);
  });

  it('filterCcsFlags strips --thinking=value', () => {
    expect(filterCcsFlags(['--thinking=high', '--dangerously-skip-permissions'])).toEqual([
      '--dangerously-skip-permissions',
    ]);
  });

  it('filterCcsFlags preserves non-CCS args untouched', () => {
    const args = ['--model', 'claude-opus-4-5', '--verbose'];
    expect(filterCcsFlags(args)).toEqual(args);
  });

  it('filterCcsFlags strips --effort and its value', () => {
    const args = ['--effort', 'xhigh', '--print'];
    expect(filterCcsFlags(args)).toEqual(['--print']);
  });

  it('filterCcsFlags strips --1m= and --no-1m= inline forms', () => {
    expect(filterCcsFlags(['--1m=true'])).toEqual([]);
    expect(filterCcsFlags(['--no-1m=true'])).toEqual([]);
  });
});

// ── parseExecutorFlags ─────────────────────────────────────────────────────────

describe('parseExecutorFlags', () => {
  let originalExitCode: number | undefined;
  let errorSpy: ReturnType<typeof jest.spyOn>;
  let exitSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    originalExitCode = process.exitCode as number | undefined;
    process.exitCode = 0;
    errorSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined as never) as typeof process.exit);
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  function makeCtx(provider = 'gemini', compositeProviders: string[] = []) {
    return { provider, compositeProviders, unifiedConfig: makeEmptyUnifiedConfig() };
  }

  it('returns default false/undefined for bare args', () => {
    const result = parseExecutorFlags([], makeCtx());
    expect(result.forceAuth).toBe(false);
    expect(result.showAccounts).toBe(false);
    expect(result.useAccount).toBeUndefined();
    expect(result.kiroAuthMethod).toBeUndefined();
    expect(result.extendedContextOverride).toBeUndefined();
  });

  it('detects --auth flag', () => {
    const result = parseExecutorFlags(['--auth'], makeCtx());
    expect(result.forceAuth).toBe(true);
  });

  it('detects --accounts flag', () => {
    const result = parseExecutorFlags(['--accounts'], makeCtx());
    expect(result.showAccounts).toBe(true);
  });

  it('parses --use value', () => {
    const result = parseExecutorFlags(['--use', 'myaccount'], makeCtx());
    expect(result.useAccount).toBe('myaccount');
  });

  it('parses --nickname value', () => {
    const result = parseExecutorFlags(['--nickname', 'mynick'], makeCtx());
    expect(result.setNickname).toBe('mynick');
  });

  it('parses --kiro-auth-method=aws for kiro provider', () => {
    const result = parseExecutorFlags(['--kiro-auth-method=aws'], makeCtx('kiro'));
    expect(result.kiroAuthMethod).toBe('aws');
  });

  it('sets process.exitCode=1 and returns on invalid --kiro-auth-method value', () => {
    parseExecutorFlags(['--kiro-auth-method=invalid-method'], makeCtx('kiro'));
    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('sets process.exitCode=1 and returns on missing --kiro-auth-method value', () => {
    parseExecutorFlags(['--kiro-auth-method'], makeCtx('kiro'));
    expect(process.exitCode).toBe(1);
  });

  it('parses --kiro-idc-start-url', () => {
    const result = parseExecutorFlags(
      ['--kiro-auth-method=idc', '--kiro-idc-start-url', 'https://d-xxx.awsapps.com/start'],
      makeCtx('kiro')
    );
    expect(result.kiroIDCStartUrl).toBe('https://d-xxx.awsapps.com/start');
    expect(result.kiroAuthMethod).toBe('idc');
  });

  it('auto-sets kiroAuthMethod=idc when IDC sub-flags present', () => {
    const result = parseExecutorFlags(
      ['--kiro-idc-start-url', 'https://d-xxx.awsapps.com/start'],
      makeCtx('kiro')
    );
    expect(result.kiroAuthMethod).toBe('idc');
  });

  it('parses --1m → extendedContextOverride=true', () => {
    expect(parseExecutorFlags(['--1m'], makeCtx()).extendedContextOverride).toBe(true);
  });

  it('parses --no-1m → extendedContextOverride=false', () => {
    expect(parseExecutorFlags(['--no-1m'], makeCtx()).extendedContextOverride).toBe(false);
  });

  it('calls process.exit(1) when --1m and --no-1m both present', () => {
    parseExecutorFlags(['--1m', '--no-1m'], makeCtx());
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('calls process.exit(1) when --paste-callback and --port-forward both present', () => {
    parseExecutorFlags(['--paste-callback', '--port-forward'], makeCtx());
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('kiro noIncognito defaults to true when provider=kiro and no override', () => {
    const result = parseExecutorFlags([], makeCtx('kiro'));
    expect(result.noIncognito).toBe(true);
  });

  it('--incognito overrides kiro default noIncognito', () => {
    const result = parseExecutorFlags(['--incognito'], makeCtx('kiro'));
    expect(result.noIncognito).toBe(false);
  });

  it('parses gitlabTokenLogin correctly', () => {
    expect(parseExecutorFlags(['--gitlab-token-login'], makeCtx('gitlab')).gitlabTokenLogin).toBe(
      true
    );
    expect(parseExecutorFlags(['--token-login'], makeCtx('gitlab')).gitlabTokenLogin).toBe(true);
  });
});

// ── validateFlagCombinations ───────────────────────────────────────────────────

describe('validateFlagCombinations', () => {
  let originalExitCode: number | undefined;
  let errorSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    originalExitCode = process.exitCode as number | undefined;
    process.exitCode = 0;
    errorSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    errorSpy.mockRestore();
  });

  function baseFlags() {
    return {
      forceAuth: false,
      pasteCallback: false,
      portForward: false,
      forceHeadless: false,
      forceLogout: false,
      forceConfig: false,
      addAccount: false,
      showAccounts: false,
      forceImport: false,
      gitlabTokenLogin: false,
      acceptAgyRisk: false,
      incognitoFlag: false,
      noIncognitoFlag: false,
      noIncognito: false,
      useAccount: undefined as string | undefined,
      setNickname: undefined as string | undefined,
      kiroAuthMethod: undefined as ReturnType<typeof parseExecutorFlags>['kiroAuthMethod'],
      kiroIDCStartUrl: undefined as string | undefined,
      kiroIDCRegion: undefined as string | undefined,
      kiroIDCFlow: undefined as ReturnType<typeof parseExecutorFlags>['kiroIDCFlow'],
      gitlabBaseUrl: undefined as string | undefined,
      extendedContextOverride: undefined as boolean | undefined,
      thinkingParse: {
        value: null,
        error: null,
        sourceFlag: null,
        sourceDisplay: null,
        duplicateDisplays: [],
      } as unknown as ReturnType<typeof parseExecutorFlags>['thinkingParse'],
    };
  }

  it('passes validation for clean gemini flags', () => {
    validateFlagCombinations(baseFlags(), { provider: 'gemini', compositeProviders: [] }, []);
    expect(process.exitCode).toBe(0);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('sets exitCode=1 when --kiro-auth-method used with non-kiro provider', () => {
    const flags = { ...baseFlags(), kiroAuthMethod: 'aws' as const };
    validateFlagCombinations(flags, { provider: 'gemini', compositeProviders: [] }, [
      '--kiro-auth-method=aws',
    ]);
    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('passes when kiro-auth-method used with kiro provider', () => {
    const flags = { ...baseFlags(), kiroAuthMethod: 'aws' as const };
    validateFlagCombinations(flags, { provider: 'kiro', compositeProviders: [] }, [
      '--kiro-auth-method=aws',
    ]);
    expect(process.exitCode).toBe(0);
  });

  it('sets exitCode=1 when IDC sub-flags used without kiro provider', () => {
    const flags = { ...baseFlags(), kiroIDCStartUrl: 'https://d-xxx.awsapps.com/start' };
    validateFlagCombinations(flags, { provider: 'gemini', compositeProviders: [] }, []);
    expect(process.exitCode).toBe(1);
  });

  it('sets exitCode=1 when kiro IDC method missing --kiro-idc-start-url', () => {
    const flags = { ...baseFlags(), kiroAuthMethod: 'idc' as const };
    validateFlagCombinations(flags, { provider: 'kiro', compositeProviders: [] }, []);
    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('--kiro-idc-start-url'));
  });

  it('passes when IDC method has start-url', () => {
    const flags = {
      ...baseFlags(),
      kiroAuthMethod: 'idc' as const,
      kiroIDCStartUrl: 'https://d-xxx.awsapps.com/start',
    };
    validateFlagCombinations(flags, { provider: 'kiro', compositeProviders: [] }, []);
    expect(process.exitCode).toBe(0);
  });

  it('sets exitCode=1 when non-idc method used with IDC sub-flags', () => {
    const flags = {
      ...baseFlags(),
      kiroAuthMethod: 'aws' as const,
      kiroIDCStartUrl: 'https://d-xxx.awsapps.com/start',
    };
    validateFlagCombinations(flags, { provider: 'kiro', compositeProviders: [] }, []);
    expect(process.exitCode).toBe(1);
  });

  it('sets exitCode=1 when --gitlab-token-login used with non-gitlab provider', () => {
    const flags = { ...baseFlags(), gitlabTokenLogin: true };
    validateFlagCombinations(flags, { provider: 'gemini', compositeProviders: [] }, [
      '--gitlab-token-login',
    ]);
    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('gitlab'));
  });

  it('passes --gitlab-token-login with gitlab provider', () => {
    const flags = { ...baseFlags(), gitlabTokenLogin: true };
    validateFlagCombinations(flags, { provider: 'gitlab', compositeProviders: [] }, [
      '--gitlab-token-login',
    ]);
    expect(process.exitCode).toBe(0);
  });

  it('passes kiro flags when kiro is a composite provider', () => {
    const flags = { ...baseFlags(), kiroAuthMethod: 'aws' as const };
    validateFlagCombinations(flags, { provider: 'gemini', compositeProviders: ['kiro'] }, []);
    expect(process.exitCode).toBe(0);
  });
});
