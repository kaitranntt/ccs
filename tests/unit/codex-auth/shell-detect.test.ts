import { describe, expect, it } from 'bun:test';
import { detectShell, formatExport } from '../../../src/codex-auth/shell-detect';
import type { Shell } from '../../../src/codex-auth/shell-detect';

// ── detectShell ───────────────────────────────────────────────────────────────

describe('detectShell — Unix', () => {
  it('returns bash for /bin/bash', () => {
    expect(detectShell({ SHELL: '/bin/bash' }, 'linux')).toBe('bash');
  });

  it('returns zsh for /usr/bin/zsh', () => {
    expect(detectShell({ SHELL: '/usr/bin/zsh' }, 'darwin')).toBe('zsh');
  });

  it('returns fish for /usr/local/bin/fish', () => {
    expect(detectShell({ SHELL: '/usr/local/bin/fish' }, 'linux')).toBe('fish');
  });

  it('returns bash for /bin/sh (generic POSIX)', () => {
    expect(detectShell({ SHELL: '/bin/sh' }, 'linux')).toBe('bash');
  });

  it('returns bash when SHELL is unset', () => {
    expect(detectShell({}, 'linux')).toBe('bash');
  });

  it('returns bash for /usr/local/bin/bash (Homebrew)', () => {
    expect(detectShell({ SHELL: '/usr/local/bin/bash' }, 'darwin')).toBe('bash');
  });
});

describe('detectShell — Windows', () => {
  it('does not treat PSModulePath alone as PowerShell', () => {
    expect(
      detectShell(
        { PSModulePath: 'C:\\Windows\\system32\\...', ComSpec: 'C:\\Windows\\System32\\cmd.exe' },
        'win32'
      )
    ).toBe('cmd');
  });

  it('returns pwsh when SHELL points to PowerShell', () => {
    expect(
      detectShell(
        {
          SHELL: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
          PSModulePath: 'C:\\Windows\\system32\\...',
        },
        'win32'
      )
    ).toBe('pwsh');
  });

  it('returns pwsh when the parent process is PowerShell and ComSpec points to cmd', () => {
    expect(
      detectShell(
        { PSModulePath: 'C:\\Windows\\system32\\...', ComSpec: 'C:\\Windows\\System32\\cmd.exe' },
        'win32',
        'pwsh.exe'
      )
    ).toBe('pwsh');
  });

  it('honors Git Bash style SHELL on Windows', () => {
    expect(detectShell({ SHELL: '/usr/bin/bash', PSModulePath: 'C:\\ps' }, 'win32')).toBe('bash');
  });

  it('returns cmd when no explicit shell hint is available', () => {
    expect(detectShell({ PSModulePath: 'C:\\ps' }, 'win32')).toBe('cmd');
  });
});

// ── formatExport ──────────────────────────────────────────────────────────────

describe('formatExport — bash', () => {
  it('wraps value in single quotes', () => {
    expect(formatExport('bash', 'CODEX_HOME', '/home/user/.ccs/codex-instances/work')).toBe(
      "export CODEX_HOME='/home/user/.ccs/codex-instances/work'"
    );
  });

  it('escapes single quotes in value', () => {
    const result = formatExport('bash', 'X', "it's");
    expect(result).toBe("export X='it'\\''s'");
  });
});

describe('formatExport — zsh', () => {
  it('uses same syntax as bash', () => {
    expect(formatExport('zsh', 'CCS_CODEX_PROFILE', 'work')).toBe(
      "export CCS_CODEX_PROFILE='work'"
    );
  });
});

describe('formatExport — fish', () => {
  it('uses set -gx syntax with semicolon', () => {
    expect(formatExport('fish', 'CODEX_HOME', '/path/to/dir')).toBe(
      "set -gx CODEX_HOME '/path/to/dir';"
    );
  });

  it('escapes single quotes', () => {
    const result = formatExport('fish', 'X', "a'b");
    expect(result).toContain('set -gx X');
    expect(result).toContain("'a'\\''b'");
  });
});

describe('formatExport — pwsh', () => {
  it('uses $env: assignment with double quotes', () => {
    expect(formatExport('pwsh', 'CODEX_HOME', 'C:\\Users\\foo')).toBe(
      '$env:CODEX_HOME = "C:\\Users\\foo"'
    );
  });

  it('doubles internal double quotes', () => {
    const result = formatExport('pwsh', 'X', 'say "hello"');
    expect(result).toBe('$env:X = "say ""hello"""');
  });

  it('escapes backticks before interpolation-sensitive characters', () => {
    const result = formatExport('pwsh', 'CODEX_HOME', 'C:\\Users\\kai`$tmp');
    expect(result).toBe('$env:CODEX_HOME = "C:\\Users\\kai```$tmp"');
  });
});

describe('formatExport — cmd', () => {
  it('uses quoted set assignment syntax', () => {
    expect(formatExport('cmd', 'CODEX_HOME', 'C:\\Users\\foo\\.ccs\\codex-instances\\work')).toBe(
      'set "CODEX_HOME=C:\\Users\\foo\\.ccs\\codex-instances\\work"'
    );
  });

  it('keeps cmd metacharacters inside the quoted set assignment', () => {
    expect(formatExport('cmd', 'CODEX_HOME', 'C:\\Users\\Kai & Co\\x|y<z>')).toBe(
      'set "CODEX_HOME=C:\\Users\\Kai & Co\\x|y<z>"'
    );
  });

  it('escapes cmd expansion-sensitive characters', () => {
    expect(formatExport('cmd', 'CODEX_HOME', 'C:\\Users\\100% ^ "quoted" !bang!')).toBe(
      'set "CODEX_HOME=C:\\Users\\100%% ^^ ^"quoted^" ^^!bang^^!"'
    );
  });
});

describe('formatExport — each shell produces distinct syntax', () => {
  const shells: Shell[] = ['bash', 'zsh', 'fish', 'pwsh', 'cmd'];
  it('all shells produce different output for same input', () => {
    const outputs = shells.map((s) => formatExport(s, 'K', 'val'));
    const unique = new Set(outputs);
    // fish and bash differ; pwsh and cmd differ; bash and zsh are identical by design
    expect(unique.size).toBeGreaterThanOrEqual(4);
  });
});
