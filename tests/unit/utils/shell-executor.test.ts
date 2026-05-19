import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { stripAnthropicEnv } from '../../../src/utils/shell-executor';

// We need to mock process.platform for cross-platform testing
const originalPlatform = process.platform;

describe('escapeShellArg', () => {
  describe('Unix (non-Windows)', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
    });
    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('wraps argument in double quotes', async () => {
      const { escapeShellArg } = await import('../../../src/utils/shell-executor');
      expect(escapeShellArg('arg')).toBe('"arg"');
    });

    it('escapes inner double quotes with backslash', async () => {
      const { escapeShellArg } = await import('../../../src/utils/shell-executor');
      expect(escapeShellArg('say "hello"')).toBe('"say \\"hello\\""');
    });

    it('handles paths with spaces', async () => {
      const { escapeShellArg } = await import('../../../src/utils/shell-executor');
      expect(escapeShellArg('/path/to/my file')).toBe('"/path/to/my file"');
    });

    it('handles empty string', async () => {
      const { escapeShellArg } = await import('../../../src/utils/shell-executor');
      expect(escapeShellArg('')).toBe('""');
    });
  });

  describe('Windows (cmd.exe)', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
    });
    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('wraps argument in double quotes', async () => {
      const { escapeShellArg } = await import('../../../src/utils/shell-executor');
      expect(escapeShellArg('arg')).toBe('"arg"');
    });

    it('escapes inner double quotes by doubling them', async () => {
      const { escapeShellArg } = await import('../../../src/utils/shell-executor');
      expect(escapeShellArg('say "hello"')).toBe('"say ""hello"""');
    });

    it('escapes percent signs', async () => {
      const { escapeShellArg } = await import('../../../src/utils/shell-executor');
      expect(escapeShellArg('%PATH%')).toBe('"%%PATH%%"');
    });

    it('escapes caret characters', async () => {
      const { escapeShellArg } = await import('../../../src/utils/shell-executor');
      expect(escapeShellArg('a^b')).toBe('"a^^b"');
    });

    it('replaces newlines with spaces', async () => {
      const { escapeShellArg } = await import('../../../src/utils/shell-executor');
      expect(escapeShellArg('line1\nline2')).toBe('"line1 line2"');
    });

    it('replaces tabs with spaces', async () => {
      const { escapeShellArg } = await import('../../../src/utils/shell-executor');
      expect(escapeShellArg('col1\tcol2')).toBe('"col1 col2"');
    });

    it('handles Windows paths with spaces', async () => {
      const { escapeShellArg } = await import('../../../src/utils/shell-executor');
      expect(escapeShellArg('C:\\Program Files\\App')).toBe('"C:\\Program Files\\App"');
    });

    it('escapes exclamation marks for delayed expansion', async () => {
      const { escapeShellArg } = await import('../../../src/utils/shell-executor');
      expect(escapeShellArg('hello!')).toBe('"hello^^!"');
    });

    it('accepts ComSpec only when it resolves to the trusted system cmd.exe', async () => {
      const originalComSpec = process.env.ComSpec;
      const originalCOMSPEC = process.env.COMSPEC;
      const originalSystemRoot = process.env.SystemRoot;

      try {
        process.env.SystemRoot = 'C:\\Windows';
        process.env.ComSpec = 'C:\\Windows\\System32\\cmd.exe';
        delete process.env.COMSPEC;
        const { getWindowsEscapedCommandShell } = await import('../../../src/utils/shell-executor');
        expect(getWindowsEscapedCommandShell()).toBe('C:\\Windows\\System32\\cmd.exe');
      } finally {
        if (originalComSpec === undefined) delete process.env.ComSpec;
        else process.env.ComSpec = originalComSpec;
        if (originalCOMSPEC === undefined) delete process.env.COMSPEC;
        else process.env.COMSPEC = originalCOMSPEC;
        if (originalSystemRoot === undefined) delete process.env.SystemRoot;
        else process.env.SystemRoot = originalSystemRoot;
      }
    });

    it('rejects relative or non-system ComSpec values', async () => {
      const originalComSpec = process.env.ComSpec;
      const originalCOMSPEC = process.env.COMSPEC;
      const originalSystemRoot = process.env.SystemRoot;

      try {
        process.env.SystemRoot = 'C:\\Windows';
        process.env.ComSpec = 'cmd.exe';
        process.env.COMSPEC = 'C:\\Temp\\cmd.exe';
        const { getWindowsEscapedCommandShell } = await import('../../../src/utils/shell-executor');
        expect(getWindowsEscapedCommandShell()).toBe('C:\\Windows\\System32\\cmd.exe');
      } finally {
        if (originalComSpec === undefined) delete process.env.ComSpec;
        else process.env.ComSpec = originalComSpec;
        if (originalCOMSPEC === undefined) delete process.env.COMSPEC;
        else process.env.COMSPEC = originalCOMSPEC;
        if (originalSystemRoot === undefined) delete process.env.SystemRoot;
        else process.env.SystemRoot = originalSystemRoot;
      }
    });

    it('rejects relative Windows root environment values', async () => {
      const originalComSpec = process.env.ComSpec;
      const originalCOMSPEC = process.env.COMSPEC;
      const originalSystemRoot = process.env.SystemRoot;
      const originalSYSTEMROOT = process.env.SYSTEMROOT;
      const originalWindir = process.env.windir;

      try {
        process.env.SystemRoot = 'Windows';
        delete process.env.SYSTEMROOT;
        delete process.env.windir;
        process.env.ComSpec = 'Windows\\System32\\cmd.exe';
        process.env.COMSPEC = 'C:\\Temp\\cmd.exe';
        const { getWindowsEscapedCommandShell } = await import('../../../src/utils/shell-executor');
        expect(getWindowsEscapedCommandShell()).toBe('C:\\Windows\\System32\\cmd.exe');
      } finally {
        if (originalComSpec === undefined) delete process.env.ComSpec;
        else process.env.ComSpec = originalComSpec;
        if (originalCOMSPEC === undefined) delete process.env.COMSPEC;
        else process.env.COMSPEC = originalCOMSPEC;
        if (originalSystemRoot === undefined) delete process.env.SystemRoot;
        else process.env.SystemRoot = originalSystemRoot;
        if (originalSYSTEMROOT === undefined) delete process.env.SYSTEMROOT;
        else process.env.SYSTEMROOT = originalSYSTEMROOT;
        if (originalWindir === undefined) delete process.env.windir;
        else process.env.windir = originalWindir;
      }
    });

    it('falls back to the absolute default system cmd.exe when Windows root env is unavailable', async () => {
      const originalComSpec = process.env.ComSpec;
      const originalCOMSPEC = process.env.COMSPEC;
      const originalSystemRoot = process.env.SystemRoot;
      const originalSYSTEMROOT = process.env.SYSTEMROOT;
      const originalWindir = process.env.windir;

      try {
        delete process.env.ComSpec;
        delete process.env.COMSPEC;
        delete process.env.SystemRoot;
        delete process.env.SYSTEMROOT;
        delete process.env.windir;
        const { getWindowsEscapedCommandShell } = await import('../../../src/utils/shell-executor');
        expect(getWindowsEscapedCommandShell()).toBe('C:\\Windows\\System32\\cmd.exe');
      } finally {
        if (originalComSpec === undefined) delete process.env.ComSpec;
        else process.env.ComSpec = originalComSpec;
        if (originalCOMSPEC === undefined) delete process.env.COMSPEC;
        else process.env.COMSPEC = originalCOMSPEC;
        if (originalSystemRoot === undefined) delete process.env.SystemRoot;
        else process.env.SystemRoot = originalSystemRoot;
        if (originalSYSTEMROOT === undefined) delete process.env.SYSTEMROOT;
        else process.env.SYSTEMROOT = originalSYSTEMROOT;
        if (originalWindir === undefined) delete process.env.windir;
        else process.env.windir = originalWindir;
      }
    });
  });
});

describe('getWindowsEscapedCommandShell', () => {
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('returns shell=true outside Windows if called defensively', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const { getWindowsEscapedCommandShell } = await import('../../../src/utils/shell-executor');
    expect(getWindowsEscapedCommandShell()).toBe(true);
  });
});

describe('stripAnthropicEnv', () => {
  it('removes all ANTHROPIC_* keys', () => {
    const input = {
      PATH: '/usr/bin',
      ANTHROPIC_BASE_URL: 'http://localhost:3000',
      ANTHROPIC_MODEL: 'claude-3',
      HOME: '/home/user',
    };
    const result = stripAnthropicEnv(input);
    expect(result).toEqual({ PATH: '/usr/bin', HOME: '/home/user' });
  });

  it('preserves non-ANTHROPIC keys', () => {
    const input = { FOO: 'bar', ANTHROPIC_KEY: 'secret' };
    const result = stripAnthropicEnv(input);
    expect(result).toEqual({ FOO: 'bar' });
  });

  it('handles empty object', () => {
    expect(stripAnthropicEnv({})).toEqual({});
  });

  it('preserves undefined values', () => {
    const input: NodeJS.ProcessEnv = { FOO: 'bar', BAZ: undefined };
    const result = stripAnthropicEnv(input);
    expect(result.FOO).toBe('bar');
    expect(result.BAZ).toBeUndefined();
    expect('BAZ' in result).toBe(true);
  });

  it('is case-sensitive (only uppercase ANTHROPIC_)', () => {
    const input = {
      anthropic_base_url: 'lowercase',
      Anthropic_Model: 'mixed',
      ANTHROPIC_API_KEY: 'uppercase',
    };
    const result = stripAnthropicEnv(input);
    expect(result).toEqual({
      anthropic_base_url: 'lowercase',
      Anthropic_Model: 'mixed',
    });
  });

  it('strips all ANTHROPIC_ prefixed vars including nested names', () => {
    const input = {
      ANTHROPIC_: 'empty suffix',
      ANTHROPIC_V2_SETTING: 'v2',
      ANTHROPIC_INTERNAL_DEBUG: 'internal',
      PATH: '/bin',
    };
    const result = stripAnthropicEnv(input);
    expect(result).toEqual({ PATH: '/bin' });
  });
});
