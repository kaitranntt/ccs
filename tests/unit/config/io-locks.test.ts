import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  acquireLock,
  CONFIG_LOCK,
  LOCK_STALE_MS,
  releaseLock,
  withConfigWriteLock,
} from '../../../src/config/loader/io-locks';

describe('config io-locks hardening', () => {
  let tempHome = '';
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    originalCcsHome = process.env.CCS_HOME;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-io-locks-'));
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
    return path.join(tempHome, '.ccs', CONFIG_LOCK);
  }

  it('acquires and releases lockfile using owner token verification', () => {
    const token = acquireLock();
    expect(token).toBeTruthy();
    expect(fs.existsSync(getLockPath())).toBe(true);
    expect(fs.existsSync(`${getLockPath()}.cleanup`)).toBe(false);

    // Mismatched token must not release another owner's lock
    releaseLock('wrong-token');
    expect(fs.existsSync(getLockPath())).toBe(true);

    releaseLock(token as string);
    expect(fs.existsSync(getLockPath())).toBe(false);
  });

  it('refuses to break a lock held by a live process', () => {
    const lockPath = getLockPath();
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    const staleTimestamp = Date.now() - LOCK_STALE_MS - 5000;
    fs.writeFileSync(lockPath, `${process.pid}\n${staleTimestamp}\nlive-owner-token`, 'utf8');

    expect(acquireLock()).toBeNull();
    expect(fs.readFileSync(lockPath, 'utf8')).toContain('live-owner-token');
  });

  it('reclaims a stale lock from a dead PID and cleans up guard file', () => {
    const lockPath = getLockPath();
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    const deadPid = 999999;
    const staleTimestamp = Date.now() - LOCK_STALE_MS - 5000;
    fs.writeFileSync(lockPath, `${deadPid}\n${staleTimestamp}\ndead-owner-token`, 'utf8');

    const token = acquireLock();
    expect(token).toBeTruthy();
    expect(fs.existsSync(`${lockPath}.cleanup`)).toBe(false);
    expect(fs.readFileSync(lockPath, 'utf8')).toContain(token as string);

    releaseLock(token as string);
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('does not unlink a newly-acquired lock while a concurrent cleanup guard is active', () => {
    const lockPath = getLockPath();
    const cleanupPath = `${lockPath}.cleanup`;
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    // Simulate a freshly acquired lock + an active cleanup guard held by another live process
    fs.writeFileSync(lockPath, `999999\n${Date.now() - LOCK_STALE_MS - 1000}\nstale`, 'utf8');
    fs.writeFileSync(cleanupPath, `${process.pid}\n${Date.now()}\nguard-token`, 'utf8');

    expect(acquireLock()).toBeNull();
    // Stale lock was NOT unlinked without holding the cleanup guard
    expect(fs.existsSync(lockPath)).toBe(true);
  });

  it('treats a newly-created empty lockfile within grace window as active', () => {
    const lockPath = getLockPath();
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, '', 'utf8');

    expect(acquireLock()).toBeNull();
    expect(fs.existsSync(lockPath)).toBe(true);
  });

  it('runs callback with withConfigWriteLock and releases lock on completion', () => {
    const result = withConfigWriteLock(() => {
      expect(fs.existsSync(getLockPath())).toBe(true);
      return 42;
    });
    expect(result).toBe(42);
    expect(fs.existsSync(getLockPath())).toBe(false);
  });
});
