/**
 * Unit tests for codex-auth import-default command.
 *
 * Covers:
 *  - missing legacy auth.json → clean error
 *  - profile exists no --force → refuses with hint
 *  - profile exists --force → backup created, overwrite
 *  - cliproxy-format source → rejects with clear message
 *  - torn-write retry: truncated JSON twice then full → succeeds on 3rd read
 *  - persistent torn state → clean error, not silent corruption
 *  - process-table Codex PID → warns + refuses without --force-while-running
 *  - --force-while-running bypasses pgrep check
 *  - --with-history copies history.jsonl + sessions/
 *  - --with-history default false → not copied
 *  - atomic write: tmp file gone after rename
 */
import { afterEach, beforeEach, describe, expect, it, spyOn, mock } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as childProcess from 'child_process';
// Note: spyOn(fs, 'readFileSync') crashes Bun's process due to native module binding.
// Torn-write retry tests use real file replacement via timer instead.

// Build a minimal valid JWT with given payload for test fixtures
function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fakesig`;
}

const VALID_JWT = makeJwt({
  email: 'test@example.com',
  'https://api.openai.com/auth': {
    chatgpt_plan_type: 'plus',
    chatgpt_account_id: 'acct-123',
  },
});

const VALID_AUTH_JSON = JSON.stringify({ tokens: { id_token: VALID_JWT } });

let tempDir: string;
let ccsHome: string;
let legacyCodexHome: string;
const ORIG_CCS_HOME = process.env.CCS_HOME;
const ORIG_LEGACY_CODEX_HOME = process.env.LEGACY_CODEX_HOME;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-import-default-test-'));
  ccsHome = path.join(tempDir, 'ccs');
  legacyCodexHome = path.join(tempDir, 'legacy-codex');
  fs.mkdirSync(path.join(ccsHome, '.ccs'), { recursive: true });
  fs.mkdirSync(legacyCodexHome, { recursive: true });
  process.env.CCS_HOME = ccsHome;
  process.env.LEGACY_CODEX_HOME = legacyCodexHome;

  // Default: process-table lookup finds nothing (no Codex running). Tests that
  // need a positive result override this per-test. This keeps local developer
  // processes from affecting import-default tests.
  spyOn(childProcess, 'spawnSync').mockReturnValue({
    status: 1,
    stdout: '',
    stderr: '',
    pid: 0,
    output: [],
    signal: null,
    error: undefined,
  });
});

afterEach(() => {
  if (ORIG_CCS_HOME === undefined) delete process.env.CCS_HOME;
  else process.env.CCS_HOME = ORIG_CCS_HOME;
  if (ORIG_LEGACY_CODEX_HOME === undefined) delete process.env.LEGACY_CODEX_HOME;
  else process.env.LEGACY_CODEX_HOME = ORIG_LEGACY_CODEX_HOME;
  fs.rmSync(tempDir, { recursive: true, force: true });
  mock.restore();
});

async function makeCtx() {
  const { CodexProfileRegistry } =
    await import('../../../../src/codex-auth/codex-profile-registry');
  return {
    registry: new CodexProfileRegistry(),
    version: '0.0.0-test',
  };
}

function silenceConsole(): () => void {
  const origLog = console.log;
  const origErr = console.error;
  const origWarn = console.warn;
  const origStdErr = process.stderr.write.bind(process.stderr);
  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};
  process.stderr.write = () => true;
  return () => {
    console.log = origLog;
    console.error = origErr;
    console.warn = origWarn;
    process.stderr.write = origStdErr;
  };
}

function captureOutput(): { stderr: string[]; restore: () => void } {
  const stderr: string[] = [];
  const origStdErr = process.stderr.write.bind(process.stderr);
  const origLog = console.log;
  const origErr = console.error;
  console.log = () => {};
  console.error = (...args: unknown[]) => {
    stderr.push(args.join(' '));
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (chunk: any) => {
    stderr.push(String(chunk));
    return true;
  };
  return {
    stderr,
    restore: () => {
      console.log = origLog;
      console.error = origErr;
      process.stderr.write = origStdErr;
    },
  };
}

function mockProcessTable(psStdout: string) {
  spyOn(childProcess, 'spawnSync').mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cmd: string, _args: string[]): any => {
      if (cmd === 'ps') {
        return {
          status: psStdout.trim().length > 0 ? 0 : 1,
          stdout: psStdout,
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
          error: undefined,
        };
      }
      return {
        status: 1,
        stdout: '',
        stderr: '',
        pid: 0,
        output: [],
        signal: null,
        error: undefined,
      };
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────

describe('import-default — missing legacy auth.json', () => {
  it('exits with clear error when ~/.codex/auth.json does not exist', async () => {
    const { handleImportDefaultCodex } =
      await import('../../../../src/codex-auth/commands/import-default-command');
    const ctx = await makeCtx();

    let exitCalled = false;
    const origExit = process.exit;
    process.exit = () => {
      exitCalled = true;
      throw new Error('exit');
    };
    const restore = silenceConsole();
    try {
      await handleImportDefaultCodex(ctx, ['myprofile']);
    } catch {
      /* expected */
    } finally {
      restore();
      process.exit = origExit;
    }

    expect(exitCalled).toBe(true);
    expect(ctx.registry.hasProfile('myprofile')).toBe(false);
  });
});

describe('import-default — option validation', () => {
  it('rejects unsupported flags before importing legacy auth', async () => {
    fs.writeFileSync(path.join(legacyCodexHome, 'auth.json'), VALID_AUTH_JSON);

    const { handleImportDefaultCodex } =
      await import('../../../../src/codex-auth/commands/import-default-command');
    const ctx = await makeCtx();

    let exitCount = 0;
    const origExit = process.exit;
    process.exit = () => {
      exitCount++;
      throw new Error('exit');
    };
    const captured = captureOutput();
    try {
      await handleImportDefaultCodex(ctx, ['typo', '--with-historyy']);
    } catch {
      /* expected */
    }
    try {
      await handleImportDefaultCodex(ctx, ['shellleak', '--shell', 'fish']);
    } catch {
      /* expected */
    }
    try {
      await handleImportDefaultCodex(ctx, ['jsonleak', '--json']);
    } catch {
      /* expected */
    }
    try {
      await handleImportDefaultCodex(ctx, ['yesleak', '--yes']);
    } catch {
      /* expected */
    } finally {
      captured.restore();
      process.exit = origExit;
    }

    expect(exitCount).toBe(4);
    expect(ctx.registry.hasProfile('typo')).toBe(false);
    expect(ctx.registry.hasProfile('shellleak')).toBe(false);
    expect(ctx.registry.hasProfile('jsonleak')).toBe(false);
    expect(ctx.registry.hasProfile('yesleak')).toBe(false);
    expect(captured.stderr.join('')).toContain('Usage:');
    expect(captured.stderr.join('')).toContain('--shell');
  });
});

describe('import-default — profile collision without --force', () => {
  it('refuses when profile exists without --force', async () => {
    // Write valid legacy auth
    fs.writeFileSync(path.join(legacyCodexHome, 'auth.json'), VALID_AUTH_JSON);

    const { handleImportDefaultCodex } =
      await import('../../../../src/codex-auth/commands/import-default-command');
    const ctx = await makeCtx();
    // Pre-create the profile
    ctx.registry.createProfile('myprofile');

    let exitCalled = false;
    const origExit = process.exit;
    process.exit = () => {
      exitCalled = true;
      throw new Error('exit');
    };
    const restore = silenceConsole();
    try {
      await handleImportDefaultCodex(ctx, ['myprofile']);
    } catch {
      /* expected */
    } finally {
      restore();
      process.exit = origExit;
    }

    expect(exitCalled).toBe(true);
  });
});

describe('import-default — --force overwrites and creates backup', () => {
  it('creates .bak file and overwrites auth.json when --force passed', async () => {
    // Write valid legacy auth
    fs.writeFileSync(path.join(legacyCodexHome, 'auth.json'), VALID_AUTH_JSON);

    const { handleImportDefaultCodex } =
      await import('../../../../src/codex-auth/commands/import-default-command');
    const ctx = await makeCtx();

    // First import (no --force needed since profile doesn't exist)
    const restore1 = silenceConsole();
    try {
      await handleImportDefaultCodex(ctx, ['backuptest']);
    } finally {
      restore1();
    }

    // Verify profile was created
    const profileDir = path.join(ccsHome, '.ccs', 'codex-instances', 'backuptest');
    const destAuth = path.join(profileDir, 'auth.json');
    expect(fs.existsSync(destAuth)).toBe(true);

    // Update legacy with different data
    const newJwt = makeJwt({ email: 'new@example.com' });
    fs.writeFileSync(
      path.join(legacyCodexHome, 'auth.json'),
      JSON.stringify({ tokens: { id_token: newJwt } })
    );

    // Re-run with --force
    const restore2 = silenceConsole();
    try {
      await handleImportDefaultCodex(ctx, ['backuptest', '--force']);
    } finally {
      restore2();
    }

    // Backup file should exist
    const files = fs.readdirSync(profileDir);
    const bakFile = files.find((f) => f.startsWith('auth.json.bak-'));
    expect(bakFile).toBeDefined();

    // New auth.json should contain the new JWT (which encodes new@example.com)
    // Verify by checking registry metadata which decodes the JWT
    const meta = ctx.registry.getProfile('backuptest');
    expect(meta.email).toBe('new@example.com');
  });
});

describe('import-default — cliproxy-format rejection', () => {
  it('rejects auth files with type field (CLIProxy wrapper format)', async () => {
    const cliproxyAuth = JSON.stringify({
      type: 'codex',
      account_id: 'abc',
      tokens: { id_token: VALID_JWT },
    });
    fs.writeFileSync(path.join(legacyCodexHome, 'auth.json'), cliproxyAuth);

    const { handleImportDefaultCodex } =
      await import('../../../../src/codex-auth/commands/import-default-command');
    const ctx = await makeCtx();

    let exitCalled = false;
    const origExit = process.exit;
    process.exit = () => {
      exitCalled = true;
      throw new Error('exit');
    };
    const restore = silenceConsole();
    try {
      await handleImportDefaultCodex(ctx, ['cliptest']);
    } catch {
      /* expected */
    } finally {
      restore();
      process.exit = origExit;
    }

    expect(exitCalled).toBe(true);
    expect(ctx.registry.hasProfile('cliptest')).toBe(false);
  });
});

describe('import-default — torn-write retry', () => {
  it('retries on truncated JSON and succeeds after file is fixed', async () => {
    const authPath = path.join(legacyCodexHome, 'auth.json');
    // Write truncated JSON initially — simulates torn write mid-file
    fs.writeFileSync(authPath, '{truncated');

    const { handleImportDefaultCodex } =
      await import('../../../../src/codex-auth/commands/import-default-command');
    const ctx = await makeCtx();

    // After 50ms (before 2nd retry at 100ms) replace with valid JSON
    const fixTimer = setTimeout(() => {
      fs.writeFileSync(authPath, VALID_AUTH_JSON);
    }, 50);

    const restore = silenceConsole();
    try {
      await handleImportDefaultCodex(ctx, ['retrytest']);
    } finally {
      restore();
      clearTimeout(fixTimer);
    }

    // The retry succeeded once file was repaired
    expect(ctx.registry.hasProfile('retrytest')).toBe(true);
  });

  it('fails cleanly on persistent torn state (all retries fail)', async () => {
    const authPath = path.join(legacyCodexHome, 'auth.json');
    // Write persistently invalid JSON — all retries will fail
    fs.writeFileSync(authPath, '{always-truncated');

    const { handleImportDefaultCodex } =
      await import('../../../../src/codex-auth/commands/import-default-command');
    const ctx = await makeCtx();

    let exitCalled = false;
    const origExit = process.exit;
    process.exit = () => {
      exitCalled = true;
      throw new Error('exit');
    };
    const restore = silenceConsole();
    try {
      await handleImportDefaultCodex(ctx, ['torntest']);
    } catch {
      /* expected */
    } finally {
      restore();
      process.exit = origExit;
    }

    expect(exitCalled).toBe(true);
    expect(ctx.registry.hasProfile('torntest')).toBe(false);
  });

  it('rejects a malformed 3-segment id_token payload', async () => {
    const authPath = path.join(legacyCodexHome, 'auth.json');
    fs.writeFileSync(authPath, JSON.stringify({ tokens: { id_token: 'header.not-json.sig' } }));

    const { handleImportDefaultCodex } =
      await import('../../../../src/codex-auth/commands/import-default-command');
    const ctx = await makeCtx();

    let exitCalled = false;
    const origExit = process.exit;
    process.exit = () => {
      exitCalled = true;
      throw new Error('exit');
    };
    const restore = silenceConsole();
    try {
      await handleImportDefaultCodex(ctx, ['badjwt']);
    } catch {
      /* expected */
    } finally {
      restore();
      process.exit = origExit;
    }

    expect(exitCalled).toBe(true);
    expect(ctx.registry.hasProfile('badjwt')).toBe(false);
  });

  it('rejects an id_token payload with invalid base64url characters', async () => {
    const authPath = path.join(legacyCodexHome, 'auth.json');
    fs.writeFileSync(authPath, JSON.stringify({ tokens: { id_token: 'h.e30$.s' } }));

    const { handleImportDefaultCodex } =
      await import('../../../../src/codex-auth/commands/import-default-command');
    const ctx = await makeCtx();

    let exitCalled = false;
    const origExit = process.exit;
    process.exit = () => {
      exitCalled = true;
      throw new Error('exit');
    };
    const restore = silenceConsole();
    try {
      await handleImportDefaultCodex(ctx, ['bad-base64url']);
    } catch {
      /* expected */
    } finally {
      restore();
      process.exit = origExit;
    }

    expect(exitCalled).toBe(true);
    expect(ctx.registry.hasProfile('bad-base64url')).toBe(false);
  });

  it('rejects an id_token signature with impossible base64url length', async () => {
    const authPath = path.join(legacyCodexHome, 'auth.json');
    const [header, payload] = VALID_JWT.split('.');
    fs.writeFileSync(authPath, JSON.stringify({ tokens: { id_token: `${header}.${payload}.a` } }));

    const { handleImportDefaultCodex } =
      await import('../../../../src/codex-auth/commands/import-default-command');
    const ctx = await makeCtx();

    let exitCalled = false;
    const origExit = process.exit;
    process.exit = () => {
      exitCalled = true;
      throw new Error('exit');
    };
    const restore = silenceConsole();
    try {
      await handleImportDefaultCodex(ctx, ['bad-signature']);
    } catch {
      /* expected */
    } finally {
      restore();
      process.exit = origExit;
    }

    expect(exitCalled).toBe(true);
    expect(ctx.registry.hasProfile('bad-signature')).toBe(false);
  });
});

describe('import-default — Codex running detection', () => {
  it('warns and refuses when process table finds a same-user Codex PID', async () => {
    fs.writeFileSync(path.join(legacyCodexHome, 'auth.json'), VALID_AUTH_JSON);

    mockProcessTable(`12345 ${process.getuid()} /usr/local/bin/codex login\n`);

    const { handleImportDefaultCodex } =
      await import('../../../../src/codex-auth/commands/import-default-command');
    const ctx = await makeCtx();

    let exitCalled = false;
    const origExit = process.exit;
    process.exit = () => {
      exitCalled = true;
      throw new Error('exit');
    };
    const captured = captureOutput();
    try {
      await handleImportDefaultCodex(ctx, ['runningtest']);
    } catch {
      /* expected */
    } finally {
      captured.restore();
      process.exit = origExit;
    }

    expect(exitCalled).toBe(true);
    const stderrMsg = captured.stderr.join('');
    expect(stderrMsg).toContain('12345');
  });

  it('proceeds with --force-while-running even when Codex is running', async () => {
    fs.writeFileSync(path.join(legacyCodexHome, 'auth.json'), VALID_AUTH_JSON);

    mockProcessTable(`12345 ${process.getuid()} /usr/local/bin/codex login\n`);

    const { handleImportDefaultCodex } =
      await import('../../../../src/codex-auth/commands/import-default-command');
    const ctx = await makeCtx();

    const restore = silenceConsole();
    try {
      await handleImportDefaultCodex(ctx, ['forcerunning', '--force-while-running']);
    } finally {
      restore();
    }

    // Should have proceeded and created the profile
    expect(ctx.registry.hasProfile('forcerunning')).toBe(true);
  });

  it('warns and refuses when Codex is running through a node shim', async () => {
    fs.writeFileSync(path.join(legacyCodexHome, 'auth.json'), VALID_AUTH_JSON);

    mockProcessTable(`12345 ${process.getuid()} /usr/bin/node /usr/local/bin/codex login\n`);

    const { handleImportDefaultCodex } =
      await import('../../../../src/codex-auth/commands/import-default-command');
    const ctx = await makeCtx();

    let exitCalled = false;
    const origExit = process.exit;
    process.exit = () => {
      exitCalled = true;
      throw new Error('exit');
    };
    const captured = captureOutput();
    try {
      await handleImportDefaultCodex(ctx, ['nodeshim']);
    } catch {
      /* expected */
    } finally {
      captured.restore();
      process.exit = origExit;
    }

    expect(exitCalled).toBe(true);
    expect(captured.stderr.join('')).toContain('12345');
    expect(ctx.registry.hasProfile('nodeshim')).toBe(false);
  });

  it('ignores process-table false positives that are not Codex executables', async () => {
    fs.writeFileSync(path.join(legacyCodexHome, 'auth.json'), VALID_AUTH_JSON);

    mockProcessTable(`11111 ${process.getuid()} /usr/bin/node /tmp/codex-auth-helper.js\n`);

    const { handleImportDefaultCodex } =
      await import('../../../../src/codex-auth/commands/import-default-command');
    const ctx = await makeCtx();

    const restore = silenceConsole();
    try {
      await handleImportDefaultCodex(ctx, ['falsepositive']);
    } finally {
      restore();
    }

    expect(ctx.registry.hasProfile('falsepositive')).toBe(true);
  });

  it('ignores same-process codex-runtime invocation paths', async () => {
    fs.writeFileSync(path.join(legacyCodexHome, 'auth.json'), VALID_AUTH_JSON);

    mockProcessTable(
      `${process.pid} ${process.getuid()} node /workspace/ccs/dist/bin/codex-runtime.js auth import-default self\n`
    );

    const { handleImportDefaultCodex } =
      await import('../../../../src/codex-auth/commands/import-default-command');
    const ctx = await makeCtx();

    const restore = silenceConsole();
    try {
      await handleImportDefaultCodex(ctx, ['selfmatch']);
    } finally {
      restore();
    }

    expect(ctx.registry.hasProfile('selfmatch')).toBe(true);
  });

  it('ignores Codex processes owned by another uid', async () => {
    fs.writeFileSync(path.join(legacyCodexHome, 'auth.json'), VALID_AUTH_JSON);

    const otherUid = process.getuid() + 1;
    mockProcessTable(`22222 ${otherUid} /usr/local/bin/codex login\n`);

    const { handleImportDefaultCodex } =
      await import('../../../../src/codex-auth/commands/import-default-command');
    const ctx = await makeCtx();

    const restore = silenceConsole();
    try {
      await handleImportDefaultCodex(ctx, ['otheruid']);
    } finally {
      restore();
    }

    expect(ctx.registry.hasProfile('otheruid')).toBe(true);
  });
});

describe('import-default — --with-history', () => {
  it('copies history.jsonl and sessions/ when --with-history passed', async () => {
    fs.writeFileSync(path.join(legacyCodexHome, 'auth.json'), VALID_AUTH_JSON);
    fs.writeFileSync(path.join(legacyCodexHome, 'history.jsonl'), '{"prompt":"hello"}\n');
    const sessionsDir = path.join(legacyCodexHome, 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(path.join(sessionsDir, 'sess1.json'), '{}');

    const { handleImportDefaultCodex } =
      await import('../../../../src/codex-auth/commands/import-default-command');
    const ctx = await makeCtx();

    const restore = silenceConsole();
    try {
      await handleImportDefaultCodex(ctx, ['withhistory', '--with-history']);
    } finally {
      restore();
    }

    const profileDir = path.join(ccsHome, '.ccs', 'codex-instances', 'withhistory');
    expect(fs.existsSync(path.join(profileDir, 'history.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(profileDir, 'sessions', 'sess1.json'))).toBe(true);
  });

  it('does NOT copy history.jsonl by default (D8: false default)', async () => {
    fs.writeFileSync(path.join(legacyCodexHome, 'auth.json'), VALID_AUTH_JSON);
    fs.writeFileSync(path.join(legacyCodexHome, 'history.jsonl'), '{"prompt":"hello"}\n');

    const { handleImportDefaultCodex } =
      await import('../../../../src/codex-auth/commands/import-default-command');
    const ctx = await makeCtx();

    const restore = silenceConsole();
    try {
      await handleImportDefaultCodex(ctx, ['nohistory']);
    } finally {
      restore();
    }

    const profileDir = path.join(ccsHome, '.ccs', 'codex-instances', 'nohistory');
    expect(fs.existsSync(path.join(profileDir, 'history.jsonl'))).toBe(false);
  });
});

describe('import-default — atomic write', () => {
  it('leaves no tmp file after successful import', async () => {
    fs.writeFileSync(path.join(legacyCodexHome, 'auth.json'), VALID_AUTH_JSON);

    const { handleImportDefaultCodex } =
      await import('../../../../src/codex-auth/commands/import-default-command');
    const ctx = await makeCtx();

    const restore = silenceConsole();
    try {
      await handleImportDefaultCodex(ctx, ['atomictest']);
    } finally {
      restore();
    }

    const profileDir = path.join(ccsHome, '.ccs', 'codex-instances', 'atomictest');
    const files = fs.readdirSync(profileDir);
    const tmpFiles = files.filter((f) => f.includes('.tmp.'));
    expect(tmpFiles.length).toBe(0);
  });
});

describe('import-default — happy path end-to-end', () => {
  it('registers profile with decoded email in registry', async () => {
    fs.writeFileSync(path.join(legacyCodexHome, 'auth.json'), VALID_AUTH_JSON);

    const { handleImportDefaultCodex } =
      await import('../../../../src/codex-auth/commands/import-default-command');
    const ctx = await makeCtx();

    const restore = silenceConsole();
    try {
      await handleImportDefaultCodex(ctx, ['happypath']);
    } finally {
      restore();
    }

    expect(ctx.registry.hasProfile('happypath')).toBe(true);
    const meta = ctx.registry.getProfile('happypath');
    expect(meta.email).toBe('test@example.com');
    expect(meta.plan_type).toBe('plus');
  });
});
