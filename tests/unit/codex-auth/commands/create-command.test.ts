/**
 * Tests for codex-auth create command.
 * Mocks detectCodexCli and child_process.spawn to avoid real codex binary.
 */
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as childProcess from 'child_process';

let tempDir: string;
let ccsHome: string;
const ORIG_CCS_HOME = process.env.CCS_HOME;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-create-test-'));
  ccsHome = path.join(tempDir, 'ccs');
  fs.mkdirSync(path.join(ccsHome, '.ccs'), { recursive: true });
  process.env.CCS_HOME = ccsHome;
});

afterEach(() => {
  if (ORIG_CCS_HOME === undefined) delete process.env.CCS_HOME;
  else process.env.CCS_HOME = ORIG_CCS_HOME;
  fs.rmSync(tempDir, { recursive: true, force: true });
  mock.restore();
});

async function makeCtx() {
  const { CodexProfileRegistry } = await import(
    '../../../../src/codex-auth/codex-profile-registry'
  );
  const reg = new CodexProfileRegistry();
  return { registry: reg, version: '0.0.0-test' };
}

function buildToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fakesig`;
}

/** Suppress console output during test. */
function silenceConsole(): () => void {
  const origLog = console.log;
  const origErr = console.error;
  const origWarn = console.warn;
  const origWrite = process.stderr.write.bind(process.stderr);
  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};
  process.stderr.write = () => true;
  return () => {
    console.log = origLog;
    console.error = origErr;
    console.warn = origWarn;
    process.stderr.write = origWrite;
  };
}

function mockDetectCodexReturns(value: string | null) {
  // We need to mock before importing the command module
  // Use a global environment approach instead
  if (value === null) {
    process.env._TEST_CODEX_PATH = '';
  } else {
    process.env._TEST_CODEX_PATH = value;
  }
}

describe('handleCreateCodex — happy path', () => {
  it('creates profile dir and registry entry (no codex binary)', async () => {
    const detectorMod = await import('../../../../src/targets/codex-detector');
    spyOn(detectorMod, 'detectCodexCli').mockReturnValue(null);

    const { handleCreateCodex } = await import(
      '../../../../src/codex-auth/commands/create-command'
    );
    const ctx = await makeCtx();
    const restore = silenceConsole();
    try {
      await handleCreateCodex(ctx, ['myprofile']);
    } finally {
      restore();
    }

    expect(ctx.registry.hasProfile('myprofile')).toBe(true);
    const instancesDir = path.join(ccsHome, '.ccs', 'codex-instances', 'myprofile');
    expect(fs.existsSync(instancesDir)).toBe(true);
  });
});

describe('handleCreateCodex — idempotent re-run', () => {
  it('repairs config.toml and preserves auth.json when profile already exists (no --force)', async () => {
    const detectorMod = await import('../../../../src/targets/codex-detector');
    spyOn(detectorMod, 'detectCodexCli').mockReturnValue(null);

    const { handleCreateCodex } = await import(
      '../../../../src/codex-auth/commands/create-command'
    );
    const ctx = await makeCtx();

    const restore = silenceConsole();
    try {
      await handleCreateCodex(ctx, ['dupprofile']);
    } finally {
      restore();
    }

    const profileDir = path.join(ccsHome, '.ccs', 'codex-instances', 'dupprofile');
    const configPath = path.join(profileDir, 'config.toml');
    const authJsonPath = path.join(profileDir, 'auth.json');
    const authJson = JSON.stringify({ tokens: { id_token: buildToken({ email: 'idempotent@test' }) } });
    fs.writeFileSync(authJsonPath, authJson);
    fs.rmSync(configPath, { force: true });

    const restore2 = silenceConsole();
    try {
      await handleCreateCodex(ctx, ['dupprofile']); // second call is idempotent and self-healing
    } finally {
      restore2();
    }

    // Profile still has exactly one entry
    expect(ctx.registry.listProfiles().filter((n) => n === 'dupprofile').length).toBe(1);
    expect(fs.existsSync(configPath)).toBe(true);
    expect(fs.readFileSync(authJsonPath, 'utf8')).toBe(authJson);
  });
});

describe('handleCreateCodex — --force re-links symlink only', () => {
  it('--force on existing profile does not wipe auth.json (D9)', async () => {
    const detectorMod = await import('../../../../src/targets/codex-detector');
    spyOn(detectorMod, 'detectCodexCli').mockReturnValue(null);

    const { handleCreateCodex } = await import(
      '../../../../src/codex-auth/commands/create-command'
    );
    const ctx = await makeCtx();

    const restore = silenceConsole();
    try {
      await handleCreateCodex(ctx, ['forceprofile']);
    } finally {
      restore();
    }

    // Write a fake auth.json to simulate logged-in state
    const profileDir = path.join(ccsHome, '.ccs', 'codex-instances', 'forceprofile');
    const authJsonPath = path.join(profileDir, 'auth.json');
    fs.writeFileSync(authJsonPath, JSON.stringify({ tokens: {} }));

    const restore2 = silenceConsole();
    try {
      await handleCreateCodex(ctx, ['forceprofile', '--force']);
    } finally {
      restore2();
    }

    // auth.json must still exist (D9: preserve, re-link only)
    expect(fs.existsSync(authJsonPath)).toBe(true);
  });
});

describe('handleCreateCodex — validation', () => {
  it('refuses reserved name "default"', async () => {
    const detectorMod = await import('../../../../src/targets/codex-detector');
    spyOn(detectorMod, 'detectCodexCli').mockReturnValue(null);

    const { handleCreateCodex } = await import(
      '../../../../src/codex-auth/commands/create-command'
    );
    const ctx = await makeCtx();

    let exitCalled = false;
    const origExit = process.exit;
    process.exit = (code?: number) => {
      exitCalled = true;
      void code;
      throw new Error(`process.exit(${code})`);
    };
    const restore = silenceConsole();
    try {
      await handleCreateCodex(ctx, ['default']);
    } catch (e) {
      // expected — process.exit throws
      expect(String(e)).toContain('process.exit');
    } finally {
      restore();
      process.exit = origExit;
    }

    expect(ctx.registry.hasProfile('default')).toBe(false);
  });

  it('refuses name with path separator', async () => {
    const detectorMod = await import('../../../../src/targets/codex-detector');
    spyOn(detectorMod, 'detectCodexCli').mockReturnValue(null);

    const { handleCreateCodex } = await import(
      '../../../../src/codex-auth/commands/create-command'
    );
    const ctx = await makeCtx();

    let exitCalled = false;
    const origExit = process.exit;
    process.exit = () => {
      exitCalled = true;
      throw new Error('exit');
    };
    const restore = silenceConsole();
    try {
      await handleCreateCodex(ctx, ['foo/bar']);
    } catch {
      /* expected */
    } finally {
      restore();
      process.exit = origExit;
    }

    expect(exitCalled).toBe(true);
    expect(ctx.registry.hasProfile('foo/bar')).toBe(false);
  });

  it('refuses empty name', async () => {
    const detectorMod = await import('../../../../src/targets/codex-detector');
    spyOn(detectorMod, 'detectCodexCli').mockReturnValue(null);

    const { handleCreateCodex } = await import(
      '../../../../src/codex-auth/commands/create-command'
    );
    const ctx = await makeCtx();

    let exitCalled = false;
    const origExit = process.exit;
    process.exit = () => {
      exitCalled = true;
      throw new Error('exit');
    };
    const restore = silenceConsole();
    try {
      await handleCreateCodex(ctx, []);
    } catch {
      /* expected */
    } finally {
      restore();
      process.exit = origExit;
    }

    expect(exitCalled).toBe(true);
  });

  it('rejects command-specific flags that create does not support', async () => {
    const detectorMod = await import('../../../../src/targets/codex-detector');
    spyOn(detectorMod, 'detectCodexCli').mockReturnValue(null);

    const { handleCreateCodex } = await import(
      '../../../../src/codex-auth/commands/create-command'
    );
    const ctx = await makeCtx();

    let exitCalled = false;
    const origExit = process.exit;
    process.exit = () => {
      exitCalled = true;
      throw new Error('exit');
    };
    const restore = silenceConsole();
    try {
      await handleCreateCodex(ctx, ['flagleak', '--shell', 'fish']);
    } catch {
      /* expected */
    } finally {
      restore();
      process.exit = origExit;
    }

    expect(exitCalled).toBe(true);
    expect(ctx.registry.hasProfile('flagleak')).toBe(false);
  });
});

describe('handleCreateCodex — auto-spawn login (D11)', () => {
  it('invokes spawn with CODEX_HOME set to profile dir', async () => {
    const detectorMod = await import('../../../../src/targets/codex-detector');
    spyOn(detectorMod, 'detectCodexCli').mockReturnValue('/usr/bin/codex');

    // Mock spawn to emit exit(0) and write auth.json
    spyOn(childProcess, 'spawn').mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_cmd: string, _args: string[], opts: any) => {
        const dir = (opts?.env?.CODEX_HOME as string) ?? '';
        if (dir) {
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(
            path.join(dir, 'auth.json'),
            JSON.stringify({ tokens: { id_token: 'h.e30K.s' } })
          );
        }
        const ee = {
          on: (evt: string, cb: (n: number) => void) => {
            if (evt === 'exit') setImmediate(() => cb(0));
            return ee;
          },
        };
        return ee as ReturnType<typeof childProcess.spawn>;
      }
    );

    const { handleCreateCodex } = await import(
      '../../../../src/codex-auth/commands/create-command'
    );
    const ctx = await makeCtx();

    const restore = silenceConsole();
    try {
      await handleCreateCodex(ctx, ['logintest']);
    } finally {
      restore();
    }

    expect(childProcess.spawn).toHaveBeenCalled();
    const spawnArgs = (childProcess.spawn as ReturnType<typeof spyOn>).mock.calls[0];
    expect(String(spawnArgs[2]?.env?.CODEX_HOME)).toContain('logintest');
  });

  it('login failure leaves profile dir created (retry-able)', async () => {
    const detectorMod = await import('../../../../src/targets/codex-detector');
    spyOn(detectorMod, 'detectCodexCli').mockReturnValue('/usr/bin/codex');

    spyOn(childProcess, 'spawn').mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_cmd: string, _args: string[], _opts: any) => {
        const ee = {
          on: (evt: string, cb: (n: number) => void) => {
            if (evt === 'exit') setImmediate(() => cb(1));
            return ee;
          },
        };
        return ee as ReturnType<typeof childProcess.spawn>;
      }
    );

    const { handleCreateCodex } = await import(
      '../../../../src/codex-auth/commands/create-command'
    );
    const ctx = await makeCtx();
    let exitCode = -1;
    const origExit = process.exit;
    process.exit = (code?: number) => {
      exitCode = code ?? 0;
      throw new Error('exit');
    };

    const restore = silenceConsole();
    try {
      await handleCreateCodex(ctx, ['faillogin']);
    } catch {
      /* expected */
    } finally {
      restore();
      process.exit = origExit;
    }

    const profileDir = path.join(ccsHome, '.ccs', 'codex-instances', 'faillogin');
    expect(fs.existsSync(profileDir)).toBe(true);
    expect(ctx.registry.hasProfile('faillogin')).toBe(true);
    expect(exitCode).toBe(4);
  });

  it('persists last_used and account_id when login token has account_id only', async () => {
    const detectorMod = await import('../../../../src/targets/codex-detector');
    spyOn(detectorMod, 'detectCodexCli').mockReturnValue('/usr/bin/codex');

    spyOn(childProcess, 'spawn').mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_cmd: string, _args: string[], opts: any) => {
        const dir = (opts?.env?.CODEX_HOME as string) ?? '';
        if (dir) {
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(
            path.join(dir, 'auth.json'),
            JSON.stringify({
              tokens: {
                id_token: buildToken({
                  'https://api.openai.com/auth': {
                    chatgpt_account_id: 'acct-account-only',
                  },
                }),
              },
            })
          );
        }
        const ee = {
          on: (evt: string, cb: (n: number) => void) => {
            if (evt === 'exit') setImmediate(() => cb(0));
            return ee;
          },
        };
        return ee as ReturnType<typeof childProcess.spawn>;
      }
    );

    const { handleCreateCodex } = await import(
      '../../../../src/codex-auth/commands/create-command'
    );
    const ctx = await makeCtx();

    const restore = silenceConsole();
    try {
      await handleCreateCodex(ctx, ['accountonly']);
    } finally {
      restore();
    }

    const meta = ctx.registry.getProfile('accountonly');
    expect(meta.last_used).toBeTruthy();
    expect(meta.account_id).toBe('acct-account-only');
  });
});
