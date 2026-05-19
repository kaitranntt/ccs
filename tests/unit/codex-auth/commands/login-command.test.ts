/**
 * Tests for codex-auth login command.
 */
import { afterEach, beforeEach, describe, expect, it, spyOn, mock } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as childProcess from 'child_process';

let tempDir: string;
let ccsHome: string;
const ORIG_CCS_HOME = process.env.CCS_HOME;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-login-test-'));
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
  return { registry: new CodexProfileRegistry(), version: '0.0.0-test' };
}

function spawnReturnsCode(code: number, writeAuth = false) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  spyOn(childProcess, 'spawn').mockImplementation((_cmd: string, _args: string[], opts: any) => {
    if (writeAuth && opts?.env?.CODEX_HOME) {
      const dir = opts.env.CODEX_HOME as string;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'auth.json'),
        JSON.stringify({ tokens: { id_token: 'h.e30K.s' } })
      );
    }
    const ee = {
      on: (evt: string, cb: (code: number) => void) => {
        if (evt === 'exit') setTimeout(() => cb(code), 0);
        return ee;
      },
    };
    return ee as ReturnType<typeof childProcess.spawn>;
  });
}

function buildToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fakesig`;
}

describe('handleLoginCodex — binary missing', () => {
  it('exits with BINARY_ERROR when codex not found', async () => {
    const detectorMod = await import('../../../../src/targets/codex-detector');
    spyOn(detectorMod, 'detectCodexCli').mockReturnValue(null);
    const { handleLoginCodex } = await import('../../../../src/codex-auth/commands/login-command');
    const ctx = await makeCtx();

    let exitCode = -1;
    const origExit = process.exit;
    process.exit = (code?: number) => {
      exitCode = code ?? 0;
      throw new Error('process.exit');
    };
    try {
      await handleLoginCodex(ctx, ['myprofile']);
    } catch {
      /* process.exit throws */
    } finally {
      process.exit = origExit;
    }
    expect(exitCode).toBe(5); // ExitCode.BINARY_ERROR
  });
});

describe('handleLoginCodex — missing profile auto-creates', () => {
  it('auto-creates profile entry when not in registry', async () => {
    const detectorMod = await import('../../../../src/targets/codex-detector');
    spyOn(detectorMod, 'detectCodexCli').mockReturnValue('/usr/bin/codex');
    spawnReturnsCode(0, true);

    const { handleLoginCodex } = await import('../../../../src/codex-auth/commands/login-command');
    const ctx = await makeCtx();

    const out: string[] = [];
    const origLog = console.log;
    console.log = (...a: unknown[]) => out.push(a.join(' '));
    try {
      await handleLoginCodex(ctx, ['newprofile']);
    } finally {
      console.log = origLog;
    }

    expect(ctx.registry.hasProfile('newprofile')).toBe(true);
    expect(out.some((l) => l.includes('Auto-creating'))).toBe(true);
  });

  it('does not create an orphan registry entry when profile dir setup fails', async () => {
    const detectorMod = await import('../../../../src/targets/codex-detector');
    spyOn(detectorMod, 'detectCodexCli').mockReturnValue('/usr/bin/codex');

    const originalMkdirSync = fs.mkdirSync;
    spyOn(fs, 'mkdirSync').mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (target: fs.PathLike, options?: any): string | undefined => {
        if (String(target).includes('codex-instances')) {
          throw Object.assign(new Error('simulated mkdir failure'), { code: 'EACCES' });
        }
        return originalMkdirSync(target, options);
      }
    );

    const { handleLoginCodex } = await import('../../../../src/codex-auth/commands/login-command');
    const ctx = await makeCtx();

    let exitCode = -1;
    const origExit = process.exit;
    process.exit = (code?: number) => {
      exitCode = code ?? 0;
      throw new Error('exit');
    };
    const origLog = console.log;
    console.log = () => {};
    try {
      await handleLoginCodex(ctx, ['orphan']);
    } catch {
      /* expected */
    } finally {
      console.log = origLog;
      process.exit = origExit;
    }

    expect(exitCode).toBe(2);
    expect(ctx.registry.hasProfile('orphan')).toBe(false);
  });

  it('rejects command-specific flags that login does not support', async () => {
    const { handleLoginCodex } = await import('../../../../src/codex-auth/commands/login-command');
    const ctx = await makeCtx();

    let exitCalled = false;
    const origExit = process.exit;
    process.exit = () => {
      exitCalled = true;
      throw new Error('exit');
    };
    try {
      await handleLoginCodex(ctx, ['flagleak', '--json']);
    } catch {
      /* expected */
    } finally {
      process.exit = origExit;
    }

    expect(exitCalled).toBe(true);
    expect(ctx.registry.hasProfile('flagleak')).toBe(false);
  });
});

describe('handleLoginCodex — spawn called with CODEX_HOME pinned', () => {
  it('passes CODEX_HOME env to spawn', async () => {
    const detectorMod = await import('../../../../src/targets/codex-detector');
    spyOn(detectorMod, 'detectCodexCli').mockReturnValue('/usr/bin/codex');
    spawnReturnsCode(0, true);

    const { handleLoginCodex } = await import('../../../../src/codex-auth/commands/login-command');
    const ctx = await makeCtx();
    ctx.registry.createProfile('pintest', { created: new Date().toISOString(), last_used: null });

    const origLog = console.log;
    console.log = () => {};
    try {
      await handleLoginCodex(ctx, ['pintest']);
    } finally {
      console.log = origLog;
    }

    expect(childProcess.spawn).toHaveBeenCalled();
    const call = (childProcess.spawn as ReturnType<typeof spyOn>).mock.calls[0];
    expect(call[2]?.env?.CODEX_HOME).toContain('pintest');
  });
});

describe('handleLoginCodex — clean exit updates registry', () => {
  it('updates email/plan in registry after successful login', async () => {
    const detectorMod = await import('../../../../src/targets/codex-detector');
    spyOn(detectorMod, 'detectCodexCli').mockReturnValue('/usr/bin/codex');
    spawnReturnsCode(0, true); // writes auth.json with minimal JWT

    const { handleLoginCodex } = await import('../../../../src/codex-auth/commands/login-command');
    const ctx = await makeCtx();
    ctx.registry.createProfile('updatetest', {
      created: new Date().toISOString(),
      last_used: null,
    });

    const origLog = console.log;
    console.log = () => {};
    try {
      await handleLoginCodex(ctx, ['updatetest']);
    } finally {
      console.log = origLog;
    }

    const meta = ctx.registry.getProfile('updatetest');
    // last_used should now be set
    expect(meta.last_used).toBeTruthy();
  });

  it('preserves cached identity metadata when a re-login token is sparse', async () => {
    const detectorMod = await import('../../../../src/targets/codex-detector');
    spyOn(detectorMod, 'detectCodexCli').mockReturnValue('/usr/bin/codex');
    spawnReturnsCode(0, true); // writes auth.json with a valid but sparse JWT payload

    const { handleLoginCodex } = await import('../../../../src/codex-auth/commands/login-command');
    const ctx = await makeCtx();
    ctx.registry.createProfile('preservemeta', {
      created: new Date().toISOString(),
      last_used: null,
      email: 'cached@example.com',
      plan_type: 'pro',
      account_id: 'acct-cached',
    });

    const origLog = console.log;
    console.log = () => {};
    try {
      await handleLoginCodex(ctx, ['preservemeta']);
    } finally {
      console.log = origLog;
    }

    const meta = ctx.registry.getProfile('preservemeta');
    expect(meta.last_used).toBeTruthy();
    expect(meta.email).toBe('cached@example.com');
    expect(meta.plan_type).toBe('pro');
    expect(meta.account_id).toBe('acct-cached');
  });

  it('persists account_id when login token has account_id only', async () => {
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
                    chatgpt_account_id: 'acct-login-only',
                  },
                }),
              },
            })
          );
        }
        const ee = {
          on: (evt: string, cb: (code: number) => void) => {
            if (evt === 'exit') setTimeout(() => cb(0), 0);
            return ee;
          },
        };
        return ee as ReturnType<typeof childProcess.spawn>;
      }
    );

    const { handleLoginCodex } = await import('../../../../src/codex-auth/commands/login-command');
    const ctx = await makeCtx();
    ctx.registry.createProfile('accountonly', {
      created: new Date().toISOString(),
      last_used: null,
    });

    const origLog = console.log;
    console.log = () => {};
    try {
      await handleLoginCodex(ctx, ['accountonly']);
    } finally {
      console.log = origLog;
    }

    const meta = ctx.registry.getProfile('accountonly');
    expect(meta.last_used).toBeTruthy();
    expect(meta.account_id).toBe('acct-login-only');
  });
});
