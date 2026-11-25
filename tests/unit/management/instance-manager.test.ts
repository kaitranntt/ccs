import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import InstanceManager from '../../../src/management/instance-manager';
import ProfileContextSyncLock from '../../../src/management/profile-context-sync-lock';

describe('InstanceManager and ProfileContextSyncLock', () => {
  let tempRoot = '';
  let originalCcsHome: string | undefined;
  let originalCcsDir: string | undefined;

  const ccsDir = () => path.join(tempRoot, '.ccs');
  const claudeDir = () => path.join(tempRoot, '.claude');
  const instancesDir = () => path.join(ccsDir(), 'instances');

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-instance-manager-test-'));
    originalCcsHome = process.env.CCS_HOME;
    originalCcsDir = process.env.CCS_DIR;

    process.env.CCS_HOME = tempRoot;
    delete process.env.CCS_DIR;

    spyOn(os, 'homedir').mockReturnValue(tempRoot);
    spyOn(console, 'log').mockImplementation(() => {});
    spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    mock.restore();

    if (originalCcsHome !== undefined) process.env.CCS_HOME = originalCcsHome;
    else delete process.env.CCS_HOME;

    if (originalCcsDir !== undefined) process.env.CCS_DIR = originalCcsDir;
    else delete process.env.CCS_DIR;

    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  describe('InstanceManager', () => {
    it('normalizes profile names in getInstancePath', () => {
      const manager = new InstanceManager();
      expect(manager.getInstancePath('Work Profile!')).toBe(
        path.join(instancesDir(), 'work-profile-')
      );
      expect(manager.getInstancePath('personal')).toBe(path.join(instancesDir(), 'personal'));
    });

    it('creates required subdirectories and shared links on ensureInstance', async () => {
      fs.mkdirSync(claudeDir(), { recursive: true });
      fs.writeFileSync(path.join(claudeDir(), 'settings.json'), '{"theme":"dark"}\n', 'utf8');

      const manager = new InstanceManager();
      const instancePath = await manager.ensureInstance('work');

      expect(instancePath).toBe(path.join(instancesDir(), 'work'));
      expect(manager.hasInstance('work')).toBe(true);
      expect(manager.listInstances()).toEqual(['work']);

      for (const subdir of [
        'session-env',
        'todos',
        'logs',
        'file-history',
        'shell-snapshots',
        'debug',
        '.anthropic',
      ]) {
        expect(fs.statSync(path.join(instancePath, subdir)).isDirectory()).toBe(true);
      }

      const instanceSettings = path.join(instancePath, 'settings.json');
      expect(fs.lstatSync(instanceSettings).isSymbolicLink()).toBe(true);
    });

    it('auto-heals missing subdirectories on existing instances', async () => {
      const manager = new InstanceManager();
      const instancePath = await manager.ensureInstance('personal');

      fs.rmSync(path.join(instancePath, 'debug'), { recursive: true, force: true });
      fs.rmSync(path.join(instancePath, '.anthropic'), { recursive: true, force: true });

      await manager.ensureInstance('personal');

      expect(fs.statSync(path.join(instancePath, 'debug')).isDirectory()).toBe(true);
      expect(fs.statSync(path.join(instancePath, '.anthropic')).isDirectory()).toBe(true);
    });

    it('supports bare mode by detaching shared directories and skipping MCP sync', async () => {
      fs.mkdirSync(claudeDir(), { recursive: true });
      fs.writeFileSync(
        path.join(tempRoot, '.claude.json'),
        JSON.stringify({ mcpServers: { custom: { command: 'node' } } }),
        'utf8'
      );

      const manager = new InstanceManager();
      const instancePath = await manager.ensureInstance('bare-prof', undefined, { bare: true });

      expect(fs.existsSync(path.join(instancePath, '.claude.json'))).toBe(false);
      expect(fs.existsSync(path.join(instancePath, 'commands'))).toBe(false);
    });

    it('deletes instances cleanly and ignores missing profiles', async () => {
      const manager = new InstanceManager();
      await manager.deleteInstance('nonexistent');
      expect(manager.listInstances()).toEqual([]);

      await manager.ensureInstance('ephemeral');
      expect(manager.hasInstance('ephemeral')).toBe(true);

      await manager.deleteInstance('ephemeral');
      expect(manager.hasInstance('ephemeral')).toBe(false);
      expect(manager.listInstances()).toEqual([]);
    });

    it('rejects escaped symlinked instances directory during ensureInstance', async () => {
      const externalDir = path.join(tempRoot, 'outside-instances');
      fs.mkdirSync(externalDir, { recursive: true });
      fs.mkdirSync(ccsDir(), { recursive: true });
      fs.symlinkSync(externalDir, instancesDir(), 'dir');

      const manager = new InstanceManager();
      await expect(manager.ensureInstance('work')).rejects.toThrow(
        /Unsafe account instance path/
      );
    });

    describe('syncMcpServers', () => {
      it('returns false when global ~/.claude.json is missing or has no mcpServers', () => {
        const manager = new InstanceManager();
        const instancePath = path.join(instancesDir(), 'work');
        fs.mkdirSync(instancePath, { recursive: true });

        expect(manager.syncMcpServers(instancePath)).toBe(false);

        fs.writeFileSync(path.join(tempRoot, '.claude.json'), JSON.stringify({ mcpServers: {} }));
        expect(manager.syncMcpServers(instancePath)).toBe(false);

        fs.writeFileSync(path.join(tempRoot, '.claude.json'), JSON.stringify({ mcpServers: [] }));
        expect(manager.syncMcpServers(instancePath)).toBe(false);
      });

      it('merges global MCP servers while preserving instance overrides except CCS-managed ones', () => {
        const manager = new InstanceManager();
        const instancePath = path.join(instancesDir(), 'work');
        fs.mkdirSync(instancePath, { recursive: true });

        fs.writeFileSync(
          path.join(tempRoot, '.claude.json'),
          JSON.stringify({
            oauthAccount: { email: 'should-not-copy@example.com' },
            mcpServers: {
              github: { command: 'global-github' },
              'ccs-websearch': { command: 'global-websearch', args: ['--v2'] },
              'ccs-browser': { command: 'global-browser' },
            },
          }),
          'utf8'
        );

        fs.writeFileSync(
          path.join(instancePath, '.claude.json'),
          JSON.stringify({
            localFlag: true,
            mcpServers: {
              github: { command: 'instance-github-override' },
              'ccs-websearch': { command: 'stale-websearch' },
              customLocal: { command: 'local-only' },
            },
          }),
          'utf8'
        );

        const synced = manager.syncMcpServers(instancePath);
        expect(synced).toBe(true);

        const result = JSON.parse(
          fs.readFileSync(path.join(instancePath, '.claude.json'), 'utf8')
        ) as {
          localFlag?: boolean;
          oauthAccount?: unknown;
          mcpServers?: Record<string, unknown>;
        };

        expect(result.localFlag).toBe(true);
        expect(result.oauthAccount).toBeUndefined();
        expect(result.mcpServers).toEqual({
          github: { command: 'instance-github-override' },
          'ccs-websearch': { command: 'global-websearch', args: ['--v2'] },
          'ccs-browser': { command: 'global-browser' },
          customLocal: { command: 'local-only' },
        });
      });

      it('skips and warns when instance .claude.json is malformed without overwriting it', () => {
        const manager = new InstanceManager();
        const instancePath = path.join(instancesDir(), 'broken');
        fs.mkdirSync(instancePath, { recursive: true });

        fs.writeFileSync(
          path.join(tempRoot, '.claude.json'),
          JSON.stringify({ mcpServers: { linear: { command: 'linear' } } })
        );
        const instanceFile = path.join(instancePath, '.claude.json');
        fs.writeFileSync(instanceFile, '{not valid json', 'utf8');

        const synced = manager.syncMcpServers(instancePath);

        expect(synced).toBe(false);
        expect(fs.readFileSync(instanceFile, 'utf8')).toBe('{not valid json');
      });
    });
  });

  describe('ProfileContextSyncLock', () => {
    function expectedLockFile(root: string, name: string): string {
      const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
      const hash = createHash('sha1').update(name).digest('hex').slice(0, 8);
      return path.join(root, '.locks', `${safeName}-${hash}.lock`);
    }

    it('acquires and releases async and sync locks around callbacks', async () => {
      const lock = new ProfileContextSyncLock(instancesDir());
      const lockPath = expectedLockFile(instancesDir(), 'work');

      const asyncResult = await lock.withLock('work', async () => {
        expect(fs.existsSync(lockPath)).toBe(true);
        return 42;
      });
      expect(asyncResult).toBe(42);
      expect(fs.existsSync(lockPath)).toBe(false);

      const syncResult = lock.withLockSync('work', () => {
        expect(fs.existsSync(lockPath)).toBe(true);
        return 'ok';
      });
      expect(syncResult).toBe('ok');
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it('cleans up locks left behind by dead PIDs in both async and sync paths', async () => {
      const lock = new ProfileContextSyncLock(instancesDir());
      const lockPath = expectedLockFile(instancesDir(), 'stale-pid');
      fs.mkdirSync(path.dirname(lockPath), { recursive: true });

      fs.writeFileSync(
        lockPath,
        JSON.stringify({ version: 1, pid: 99999999, nonce: 'dead', acquiredAtMs: Date.now() }),
        'utf8'
      );
      const value = await lock.withLock('stale-pid', async () => 'recovered-async');
      expect(value).toBe('recovered-async');
      expect(fs.existsSync(lockPath)).toBe(false);

      fs.writeFileSync(
        lockPath,
        JSON.stringify({ version: 1, pid: 99999999, nonce: 'dead-sync', acquiredAtMs: Date.now() }),
        'utf8'
      );
      const syncValue = lock.withLockSync('stale-pid', () => 'recovered-sync');
      expect(syncValue).toBe('recovered-sync');
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it('cleans up malformed locks older than staleLockMs', async () => {
      const lock = new ProfileContextSyncLock(instancesDir());
      const lockPath = expectedLockFile(instancesDir(), 'corrupt');
      fs.mkdirSync(path.dirname(lockPath), { recursive: true });
      fs.writeFileSync(lockPath, 'garbage-lock-payload', 'utf8');

      const oldTime = new Date(Date.now() - 40_000);
      fs.utimesSync(lockPath, oldTime, oldTime);

      const value = await lock.withNamedLock('corrupt', async () => 'cleared');
      expect(value).toBe('cleared');
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it('serializes concurrent async callers on the same profile name', async () => {
      const lock = new ProfileContextSyncLock(instancesDir());
      const events: string[] = [];

      const first = lock.withLock('shared-profile', async () => {
        events.push('first:start');
        await new Promise((resolve) => setTimeout(resolve, 40));
        events.push('first:end');
        return 1;
      });

      const second = lock.withLock('shared-profile', async () => {
        events.push('second:start');
        events.push('second:end');
        return 2;
      });

      const results = await Promise.all([first, second]);
      expect(results).toEqual([1, 2]);
      expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
    });
  });
});
