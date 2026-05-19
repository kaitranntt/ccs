/**
 * Tests for codex-auth use command.
 *
 * CRITICAL: stdout discipline — stdout must contain ONLY shell-eval lines.
 * All info/error/hint text must go to stderr.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let tempDir: string;
let ccsHome: string;
const ORIG_CCS_HOME = process.env.CCS_HOME;
const ORIG_NO_PRE_DISPATCH = process.env.CCS_NO_PRE_DISPATCH;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-use-test-'));
  ccsHome = path.join(tempDir, 'ccs');
  fs.mkdirSync(path.join(ccsHome, '.ccs'), { recursive: true });
  process.env.CCS_HOME = ccsHome;
  // Ensure guard is active for tests
  process.env.CCS_NO_PRE_DISPATCH = '1';
});

afterEach(() => {
  if (ORIG_CCS_HOME === undefined) delete process.env.CCS_HOME;
  else process.env.CCS_HOME = ORIG_CCS_HOME;
  if (ORIG_NO_PRE_DISPATCH === undefined) delete process.env.CCS_NO_PRE_DISPATCH;
  else process.env.CCS_NO_PRE_DISPATCH = ORIG_NO_PRE_DISPATCH;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function makeCtxWithProfile(name: string) {
  const { CodexProfileRegistry } = await import(
    '../../../../src/codex-auth/codex-profile-registry'
  );
  const reg = new CodexProfileRegistry();
  reg.createProfile(name, { created: new Date().toISOString(), last_used: null });
  return { registry: reg, version: '0.0.0-test' };
}

/** Capture stdout and stderr separately while calling fn. */
async function captureStreams(
  fn: () => Promise<void>
): Promise<{ stdout: string; stderr: string }> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  const origConsoleLog = console.log;
  const origConsoleError = console.error;
  process.stdout.write = (chunk: string | Uint8Array) => {
    stdoutChunks.push(String(chunk));
    return true;
  };
  process.stderr.write = (chunk: string | Uint8Array) => {
    stderrChunks.push(String(chunk));
    return true;
  };
  console.log = (...args: unknown[]) => {
    stdoutChunks.push(`${args.map(String).join(' ')}\n`);
  };
  console.error = (...args: unknown[]) => {
    stderrChunks.push(`${args.map(String).join(' ')}\n`);
  };
  try {
    await fn();
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
    console.log = origConsoleLog;
    console.error = origConsoleError;
  }
  return { stdout: stdoutChunks.join(''), stderr: stderrChunks.join('') };
}

// ── stdout discipline (CRITICAL) ──────────────────────────────────────────────

describe('handleUseCodex — stdout discipline', () => {
  it('stdout contains ONLY export lines for bash', async () => {
    const { handleUseCodex } = await import('../../../../src/codex-auth/commands/use-command');
    const ctx = await makeCtxWithProfile('work');

    const { stdout, stderr } = await captureStreams(() =>
      handleUseCodex(ctx, ['work', '--shell', 'bash'])
    );

    const lines = stdout.trim().split('\n').filter(Boolean);
    // Every stdout line must be a shell export statement
    for (const line of lines) {
      expect(line).toMatch(/^export [A-Z_]+=|^set -gx |^\$env:|^set [A-Z_]+=|^export [A-Z]/);
    }
    // Hint must be on stderr only
    expect(stderr).toContain('active in this shell');
    expect(stdout).not.toContain('[i]');
    expect(stdout).not.toContain('[X]');
    expect(stdout).not.toContain('[!]');
    expect(stdout).not.toContain('[OK]');
  });

  it('stdout empty, non-zero exit for unknown profile', async () => {
    const { handleUseCodex } = await import('../../../../src/codex-auth/commands/use-command');
    const ctx = await makeCtxWithProfile('work');

    let exitCode = -1;
    const origExit = process.exit;
    process.exit = (code?: number) => {
      exitCode = code ?? 0;
      throw new Error('process.exit');
    };

    const { stdout, stderr } = await captureStreams(async () => {
      try {
        await handleUseCodex(ctx, ['nonexistent', '--shell', 'bash']);
      } catch {
        /* process.exit */
      }
    }).finally(() => {
      process.exit = origExit;
    });

    expect(stdout).toBe('');
    expect(exitCode).toBeGreaterThan(0);
    expect(stderr).toContain('Profile not found');
  });
});

// ── shell syntax variants ─────────────────────────────────────────────────────

describe('handleUseCodex — shell syntax', () => {
  it('bash: export KEY=value', async () => {
    const { handleUseCodex } = await import('../../../../src/codex-auth/commands/use-command');
    const ctx = await makeCtxWithProfile('work');
    const { stdout } = await captureStreams(() => handleUseCodex(ctx, ['work', '--shell', 'bash']));
    expect(stdout).toContain('export CODEX_HOME=');
    expect(stdout).toContain("export CCS_CODEX_PROFILE='work'");
  });

  it('fish: set -gx KEY value;', async () => {
    const { handleUseCodex } = await import('../../../../src/codex-auth/commands/use-command');
    const ctx = await makeCtxWithProfile('work');
    const { stdout } = await captureStreams(() => handleUseCodex(ctx, ['work', '--shell', 'fish']));
    expect(stdout).toContain('set -gx CODEX_HOME');
    expect(stdout).toContain("set -gx CCS_CODEX_PROFILE 'work';");
  });

  it('pwsh: $env:KEY = value', async () => {
    const { handleUseCodex } = await import('../../../../src/codex-auth/commands/use-command');
    const ctx = await makeCtxWithProfile('work');
    const { stdout } = await captureStreams(() => handleUseCodex(ctx, ['work', '--shell', 'pwsh']));
    expect(stdout).toContain('$env:CODEX_HOME');
    expect(stdout).toContain('$env:CCS_CODEX_PROFILE');
  });

  it('cmd: quoted set assignment syntax', async () => {
    const { handleUseCodex } = await import('../../../../src/codex-auth/commands/use-command');
    const ctx = await makeCtxWithProfile('work');
    const { stdout } = await captureStreams(() => handleUseCodex(ctx, ['work', '--shell', 'cmd']));
    expect(stdout).toContain('set "CODEX_HOME=');
    expect(stdout).toContain('set "CCS_CODEX_PROFILE=work"');
  });

  it('invalid --shell value → stderr error, empty stdout', async () => {
    const { handleUseCodex } = await import('../../../../src/codex-auth/commands/use-command');
    const ctx = await makeCtxWithProfile('work');

    let exitCode = -1;
    const origExit = process.exit;
    process.exit = (code?: number) => {
      exitCode = code ?? 0;
      throw new Error('exit');
    };

    const { stdout, stderr } = await captureStreams(async () => {
      try {
        await handleUseCodex(ctx, ['work', '--shell', 'ksh']);
      } catch {
        /* process.exit */
      }
    }).finally(() => {
      process.exit = origExit;
    });

    expect(stdout).toBe('');
    expect(exitCode).toBeGreaterThan(0);
    expect(stderr).toContain('Unsupported');
  });

  it('unknown option → stderr usage, empty stdout', async () => {
    const { handleUseCodex } = await import('../../../../src/codex-auth/commands/use-command');
    const ctx = await makeCtxWithProfile('work');

    let exitCode = -1;
    const origExit = process.exit;
    process.exit = (code?: number) => {
      exitCode = code ?? 0;
      throw new Error('exit');
    };

    const { stdout, stderr } = await captureStreams(async () => {
      try {
        await handleUseCodex(ctx, ['work', '--bad-flag']);
      } catch {
        /* process.exit */
      }
    }).finally(() => {
      process.exit = origExit;
    });

    expect(stdout).toBe('');
    expect(exitCode).toBeGreaterThan(0);
    expect(stderr).toContain('Usage:');
    expect(stderr).toContain('Unknown options');
  });
});

// ── missing profile → stderr only ────────────────────────────────────────────

describe('handleUseCodex — missing profile stderr only', () => {
  it('missing profile name → stderr, empty stdout', async () => {
    const { handleUseCodex } = await import('../../../../src/codex-auth/commands/use-command');
    const ctx = await makeCtxWithProfile('work');

    let exitCode = -1;
    const origExit = process.exit;
    process.exit = (code?: number) => {
      exitCode = code ?? 0;
      throw new Error('exit');
    };

    const { stdout, stderr } = await captureStreams(async () => {
      try {
        await handleUseCodex(ctx, []);
      } catch {
        /* process.exit */
      }
    }).finally(() => {
      process.exit = origExit;
    });

    expect(stdout).toBe('');
    expect(exitCode).toBeGreaterThan(0);
    expect(stderr).toContain('required');
  });
});
