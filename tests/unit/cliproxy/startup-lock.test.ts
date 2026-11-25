import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { acquireStartupLock, withStartupLock } from '../../../src/cliproxy/services/startup-lock';

describe('cliproxy startup-lock hardening', () => {
  let tempHome = '';
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    originalCcsHome = process.env.CCS_HOME;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-startup-lock-'));
    process.env.CCS_HOME = tempHome;
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  function getLockPath(): string {
    return path.join(tempHome, '.ccs', 'cliproxy', '.startup.lock');
  }

  it('acquires and releases startup lock with token verification', async () => {
    const lock = await acquireStartupLock({ retries: 0 });
    expect(lock.acquired).toBe(true);
    expect(fs.existsSync(lock.lockPath)).toBe(true);
    expect(fs.existsSync(`${lock.lockPath}.cleanup`)).toBe(false);

    const parsed = JSON.parse(fs.readFileSync(lock.lockPath, 'utf8')) as {
      pid: number;
      token?: string;
    };
    expect(parsed.pid).toBe(process.pid);
    expect(typeof parsed.token).toBe('string');

    lock.release();
    expect(fs.existsSync(lock.lockPath)).toBe(false);
  });

  it('does not allow stale release handle to delete another owner lock with same PID', async () => {
    const first = await acquireStartupLock({ retries: 0 });
    expect(first.acquired).toBe(true);

    // Replace lock file as if a concurrent reaper replaced an expired lock for the same PID
    fs.writeFileSync(
      first.lockPath,
      JSON.stringify({
        pid: process.pid,
        timestamp: Date.now(),
        hostname: os.hostname(),
        token: 'newer-owner-token',
      }),
      'utf8'
    );

    first.release();
    expect(fs.existsSync(first.lockPath)).toBe(true);
    const current = JSON.parse(fs.readFileSync(first.lockPath, 'utf8')) as { token?: string };
    expect(current.token).toBe('newer-owner-token');
  });

  it('reclaims a stale startup lock and guards against concurrent cleanup race', async () => {
    const lockPath = getLockPath();
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        pid: 999999,
        timestamp: Date.now() - 20_000,
        hostname: os.hostname(),
        token: 'stale-token',
      }),
      'utf8'
    );

    const value = await withStartupLock(
      async () => {
        expect(fs.existsSync(lockPath)).toBe(true);
        expect(fs.existsSync(`${lockPath}.cleanup`)).toBe(false);
        return 'ok';
      },
      { retries: 0 }
    );

    expect(value).toBe('ok');
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('does not unlink lock when cleanup guard is already held by another live process', async () => {
    const lockPath = getLockPath();
    const cleanupPath = `${lockPath}.cleanup`;
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        pid: 999999,
        timestamp: Date.now() - 20_000,
        hostname: os.hostname(),
        token: 'stale-token',
      }),
      'utf8'
    );
    fs.writeFileSync(cleanupPath, `${process.pid}\n${Date.now()}\nactive-guard`, 'utf8');

    await expect(acquireStartupLock({ retries: 0, retryInterval: 1 })).rejects.toThrow(
      'Failed to acquire startup lock'
    );
    expect(fs.existsSync(lockPath)).toBe(true);
  });
});
