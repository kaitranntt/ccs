import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { InstanceManager } from '../../src/management/instance-manager';
import SharedManager from '../../src/management/shared-manager';

describe('InstanceManager MCP sync', () => {
  let tempRoot = '';
  let originalHome: string | undefined;
  let originalCcsHome: string | undefined;
  let originalCcsDir: string | undefined;

  const claudeDir = () => path.join(tempRoot, '.claude');
  const marketplacePath = (configDir: string, name = 'claude-code-plugins') =>
    path.join(configDir, 'plugins', 'marketplaces', name);
  const readJson = (filePath: string) =>
    JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;

  function ensureMarketplacePayload(configDir: string, name = 'claude-code-plugins'): void {
    fs.mkdirSync(marketplacePath(configDir, name), { recursive: true });
  }

  function writeMarketplaceRegistry(registryPath: string, installLocation: string): void {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(
      registryPath,
      JSON.stringify(
        {
          'claude-code-plugins': {
            installLocation,
          },
        },
        null,
        2
      ),
      'utf8'
    );
  }

  function writeMarketplaceRegistryWithMetadata(
    registryPath: string,
    installLocation: string,
    metadata: Record<string, unknown>
  ): void {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(
      registryPath,
      JSON.stringify(
        {
          'claude-code-plugins': {
            installLocation,
            ...metadata,
          },
        },
        null,
        2
      ),
      'utf8'
    );
  }

  function expectMarketplaceLocation(registryPath: string, expectedLocation: string): void {
    const parsed = readJson(registryPath) as Record<string, { installLocation?: string }>;
    expect(parsed['claude-code-plugins']?.installLocation).toBe(expectedLocation);
  }

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-instance-mcp-test-'));
    originalHome = process.env.HOME;
    originalCcsHome = process.env.CCS_HOME;
    originalCcsDir = process.env.CCS_DIR;

    spyOn(os, 'homedir').mockReturnValue(tempRoot);
    process.env.HOME = tempRoot;
    process.env.CCS_HOME = tempRoot;
    delete process.env.CCS_DIR;
  });

  afterEach(() => {
    mock.restore();

    if (originalHome !== undefined) process.env.HOME = originalHome;
    else delete process.env.HOME;

    if (originalCcsHome !== undefined) process.env.CCS_HOME = originalCcsHome;
    else delete process.env.CCS_HOME;

    if (originalCcsDir !== undefined) process.env.CCS_DIR = originalCcsDir;
    else delete process.env.CCS_DIR;

    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('merges global MCP servers and preserves instance-specific overrides', () => {
    fs.writeFileSync(
      path.join(tempRoot, '.claude.json'),
      JSON.stringify(
        {
          mcpServers: {
            globalOnly: { command: 'global-cmd' },
            shared: { command: 'global-shared' },
          },
        },
        null,
        2
      ),
      'utf8'
    );

    const manager = new InstanceManager();
    const instancePath = manager.getInstancePath('work');
    fs.mkdirSync(instancePath, { recursive: true });
    fs.writeFileSync(
      path.join(instancePath, '.claude.json'),
      JSON.stringify(
        {
          mcpServers: {
            shared: { command: 'instance-shared' },
            instanceOnly: { command: 'instance-only' },
          },
          otherKey: 'keep-me',
        },
        null,
        2
      ),
      'utf8'
    );

    const synced = manager.syncMcpServers(instancePath);
    expect(synced).toBe(true);

    const instanceContent = readJson(path.join(instancePath, '.claude.json')) as {
      otherKey: string;
      mcpServers: Record<string, { command: string }>;
    };
    expect(instanceContent.otherKey).toBe('keep-me');
    expect(instanceContent.mcpServers).toEqual({
      globalOnly: { command: 'global-cmd' },
      shared: { command: 'instance-shared' },
      instanceOnly: { command: 'instance-only' },
    });
  });

  it('repairs managed ccs-websearch and ccs-browser entries from global config while preserving other instance MCP overrides', () => {
    fs.writeFileSync(
      path.join(tempRoot, '.claude.json'),
      JSON.stringify(
        {
          mcpServers: {
            'ccs-websearch': {
              type: 'stdio',
              command: 'node',
              args: ['/global/server.cjs'],
              env: {},
            },
            'ccs-browser': {
              type: 'stdio',
              command: 'node',
              args: ['/global/browser-server.cjs'],
              env: {},
            },
            shared: { command: 'global-shared' },
          },
        },
        null,
        2
      ),
      'utf8'
    );

    const manager = new InstanceManager();
    const instancePath = manager.getInstancePath('work');
    fs.mkdirSync(instancePath, { recursive: true });
    fs.writeFileSync(
      path.join(instancePath, '.claude.json'),
      JSON.stringify(
        {
          mcpServers: {
            'ccs-websearch': {
              type: 'stdio',
              command: 'node',
              args: ['/old/server.cjs'],
              env: {},
            },
            'ccs-browser': {
              type: 'stdio',
              command: 'node',
              args: ['/old/browser-server.cjs'],
              env: {},
            },
            shared: { command: 'instance-shared' },
            instanceOnly: { command: 'instance-only' },
          },
        },
        null,
        2
      ),
      'utf8'
    );

    expect(manager.syncMcpServers(instancePath)).toBe(true);

    const instanceContent = readJson(path.join(instancePath, '.claude.json')) as {
      mcpServers: Record<string, unknown>;
    };
    expect(instanceContent.mcpServers).toEqual({
      'ccs-websearch': {
        type: 'stdio',
        command: 'node',
        args: ['/global/server.cjs'],
        env: {},
      },
      'ccs-browser': {
        type: 'stdio',
        command: 'node',
        args: ['/global/browser-server.cjs'],
        env: {},
      },
      shared: { command: 'instance-shared' },
      instanceOnly: { command: 'instance-only' },
    });
  });

  it('preserves existing instance .claude.json permissions when syncing managed MCP servers', () => {
    fs.writeFileSync(
      path.join(tempRoot, '.claude.json'),
      JSON.stringify(
        {
          mcpServers: {
            'ccs-browser': {
              type: 'stdio',
              command: 'node',
              args: ['/global/browser.cjs'],
              env: {},
            },
          },
        },
        null,
        2
      ),
      'utf8'
    );

    const manager = new InstanceManager();
    const instancePath = manager.getInstancePath('work');
    fs.mkdirSync(instancePath, { recursive: true });
    const instanceClaudeJson = path.join(instancePath, '.claude.json');
    fs.writeFileSync(instanceClaudeJson, JSON.stringify({ existing: true }, null, 2) + '\n', {
      encoding: 'utf8',
      mode: 0o640,
    });
    fs.chmodSync(instanceClaudeJson, 0o640);

    expect(manager.syncMcpServers(instancePath)).toBe(true);
    expect(fs.statSync(instanceClaudeJson).mode & 0o777).toBe(0o640);
  });

  /** Seed only temporary config files; exercise the production MCP sync entry point. */
  function seedPublication(instanceBytes = '{"existing":true,"authSentinel":"keep"}\n') {
    fs.writeFileSync(
      path.join(tempRoot, '.claude.json'),
      JSON.stringify({ mcpServers: { globalOnly: { command: 'global-cmd' } } })
    );
    const manager = new InstanceManager();
    const instancePath = manager.getInstancePath('publication');
    fs.mkdirSync(instancePath, { recursive: true });
    const configPath = path.join(instancePath, '.claude.json');
    fs.writeFileSync(configPath, instanceBytes, { mode: 0o640 });
    fs.chmodSync(configPath, 0o640);
    return { manager, instancePath, configPath, instanceBytes };
  }

  it('publishes via rename while readers retain the previous complete config', () => {
    const { manager, instancePath, configPath, instanceBytes } = seedPublication();
    const originalWrite = fs.writeFileSync;
    const originalRename = fs.renameSync;
    const directWrites: unknown[] = [];
    let publications = 0;
    spyOn(fs, 'writeFileSync').mockImplementation((target, data, options) => {
      if (target === configPath) directWrites.push(target);
      return originalWrite(target, data, options);
    });
    spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      if (destination === configPath) {
        publications++;
        expect(path.dirname(String(source))).toBe(instancePath);
        expect(fs.readFileSync(configPath, 'utf8')).toBe(instanceBytes);
        expect(JSON.parse(fs.readFileSync(source, 'utf8')).authSentinel).toBe('keep');
        expect(fs.statSync(source).mode & 0o777).toBe(0o640);
      }
      return originalRename(source, destination);
    });

    expect(manager.syncMcpServers(instancePath)).toBe(true);
    expect(directWrites).toEqual([]);
    expect(publications).toBe(1);
    expect(readJson(configPath)).toEqual({
      existing: true,
      authSentinel: 'keep',
      mcpServers: { globalOnly: { command: 'global-cmd' } },
    });
  });

  for (const bytes of ['{"unfinished":', 'null', '[]', '"scalar"', '42']) {
    it(`does not replace an existing invalid object config: ${bytes}`, () => {
      const { manager, instancePath, configPath } = seedPublication(bytes);
      spyOn(console, 'warn').mockImplementation(() => {});
      expect(manager.syncMcpServers(instancePath)).toBe(false);
      expect(fs.readFileSync(configPath, 'utf8')).toBe(bytes);
    });
  }

  for (const existing of [true, false]) {
    it(`preserves destination after a partial write failure (existing=${existing})`, () => {
      const { manager, instancePath, configPath, instanceBytes } = seedPublication();
      if (!existing) fs.unlinkSync(configPath);
      spyOn(console, 'warn').mockImplementation(() => {});
      const originalWrite = fs.writeFileSync;
      let failed = false;
      spyOn(fs, 'writeFileSync').mockImplementation((target, data, options) => {
        // The failpoint writes partial bytes to the REAL writer's chosen destination.
        // A safe writer corrupts only its temp; the old implementation corrupts config.
        if (
          !failed &&
          (typeof target === 'number' || String(target).includes('.tmp-') || target === configPath)
        ) {
          failed = true;
          originalWrite(target, '{"partial":', options);
          throw Object.assign(new Error('injected partial write'), { code: 'EIO' });
        }
        return originalWrite(target, data, options);
      });
      expect(manager.syncMcpServers(instancePath)).toBe(false);
      expect(failed).toBe(true);
      if (existing) expect(fs.readFileSync(configPath, 'utf8')).toBe(instanceBytes);
      else expect(fs.existsSync(configPath)).toBe(false);
      expect(fs.readdirSync(instancePath).filter((entry) => entry.includes('.tmp-'))).toEqual([]);
    });
  }

  for (const code of ['EXDEV', 'EPERM', 'EEXIST', 'EBUSY']) {
    it(`never falls back to the live config when rename fails with ${code}`, () => {
      const { manager, instancePath, configPath, instanceBytes } = seedPublication();
      spyOn(console, 'warn').mockImplementation(() => {});
      const originalRename = fs.renameSync;
      spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
        if (destination === configPath) throw Object.assign(new Error(code), { code });
        return originalRename(source, destination);
      });
      expect(manager.syncMcpServers(instancePath)).toBe(false);
      expect(fs.readFileSync(configPath, 'utf8')).toBe(instanceBytes);
      expect(fs.statSync(configPath).mode & 0o777).toBe(0o640);
      expect(fs.readdirSync(instancePath).filter((entry) => entry.includes('.tmp-'))).toEqual([]);
    });
  }

  it('preserves config when setting staged file permissions fails', () => {
    const { manager, instancePath, configPath, instanceBytes } = seedPublication();
    spyOn(console, 'warn').mockImplementation(() => {});
    spyOn(fs, 'fchmodSync').mockImplementation(() => {
      throw Object.assign(new Error('injected chmod failure'), { code: 'EPERM' });
    });
    expect(manager.syncMcpServers(instancePath)).toBe(false);
    expect(fs.readFileSync(configPath, 'utf8')).toBe(instanceBytes);
    expect(fs.readdirSync(instancePath).filter((entry) => entry.includes('.tmp-'))).toEqual([]);
  });

  it('serializes cooperating subprocess writers and rereads the first publication', async () => {
    const { instancePath, configPath } = seedPublication();
    const worker = path.join(__dirname, 'instance-manager-mcp-sync-worker.ts');
    const start = (role: string) =>
      Bun.spawn([process.execPath, worker, instancePath, role], {
        env: { ...process.env, HOME: tempRoot, CCS_HOME: tempRoot },
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
      });
    const first = start('first');
    const firstReader = first.stdout.getReader();
    let second: ReturnType<typeof start> | undefined;
    try {
      expect(new TextDecoder().decode((await firstReader.read()).value)).toContain('read-first');
      second = start('second');
      const secondReader = second.stdout.getReader();
      expect(new TextDecoder().decode((await secondReader.read()).value)).toContain('contended');
      first.stdin.write('x');
      first.stdin.end();
      expect(await first.exited).toBe(0);
      second.stdin.write('x');
      second.stdin.end();
      expect(await second.exited).toBe(0);
      expect(readJson(configPath)).toMatchObject({
        first: true,
        second: true,
        authSentinel: 'keep',
      });
    } finally {
      first.kill();
      second?.kill();
      await first.exited;
      if (second) await second.exited;
    }
  }, 10000);

  it('releases its config lock after a failed publication', () => {
    const { manager, instancePath } = seedPublication();
    spyOn(console, 'warn').mockImplementation(() => {});
    const rename = fs.renameSync;
    const renameSpy = spyOn(fs, 'renameSync').mockImplementation(() => {
      throw Object.assign(new Error('injected failure'), { code: 'EPERM' });
    });
    expect(manager.syncMcpServers(instancePath)).toBe(false);
    renameSpy.mockImplementation(rename);
    expect(manager.syncMcpServers(instancePath)).toBe(true);
  });

  it('logs warning when global MCP sync fails', () => {
    fs.writeFileSync(path.join(tempRoot, '.claude.json'), '{invalid-json', 'utf8');
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

    const manager = new InstanceManager();
    const instancePath = manager.getInstancePath('work');
    fs.mkdirSync(instancePath, { recursive: true });

    const synced = manager.syncMcpServers(instancePath);

    expect(synced).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0] || '')).toContain('MCP sync skipped');
  });

  it('does not list lock housekeeping as an instance', async () => {
    spyOn(SharedManager.prototype, 'syncProjectContext').mockResolvedValue(undefined);
    spyOn(SharedManager.prototype, 'syncAdvancedContinuityArtifacts').mockResolvedValue(undefined);
    spyOn(InstanceManager.prototype, 'syncMcpServers').mockImplementation(() => false);

    const manager = new InstanceManager();
    await manager.ensureInstance('work', { mode: 'isolated' });

    expect(manager.listInstances()).toEqual(['work']);
  });

  for (const testCase of [
    {
      label: 'isolated bare',
      policy: { mode: 'isolated' as const },
      options: { bare: true },
    },
    {
      label: 'shared context',
      policy: { mode: 'shared' as const, group: 'review-safety' },
      options: {},
    },
  ]) {
    it(`rejects an existing symlink instance root before ${testCase.label} mutation`, async () => {
      const externalInstance = path.join(tempRoot, `external-${testCase.label.replace(' ', '-')}`);
      const instancesDir = path.join(tempRoot, '.ccs', 'instances');
      fs.mkdirSync(externalInstance, { recursive: true });
      fs.writeFileSync(path.join(externalInstance, 'sentinel.txt'), 'unchanged', 'utf8');
      fs.mkdirSync(instancesDir, { recursive: true });
      fs.symlinkSync(externalInstance, path.join(instancesDir, 'work'), 'dir');

      const manager = new InstanceManager();
      await expect(
        manager.ensureInstance('work', testCase.policy, testCase.options)
      ).rejects.toThrow('Unsafe account instance path');

      expect(fs.readdirSync(externalInstance)).toEqual(['sentinel.txt']);
      expect(fs.readFileSync(path.join(externalInstance, 'sentinel.txt'), 'utf8')).toBe(
        'unchanged'
      );
      expect(fs.readdirSync(instancesDir)).toEqual(['work']);
    });
  }

  it('rejects a symlinked instances parent before creating a new instance or lock', async () => {
    const externalInstances = path.join(tempRoot, 'external-instances');
    const managedInstances = path.join(tempRoot, '.ccs', 'instances');
    fs.mkdirSync(externalInstances, { recursive: true });
    fs.mkdirSync(path.dirname(managedInstances), { recursive: true });
    fs.symlinkSync(externalInstances, managedInstances, 'dir');

    const manager = new InstanceManager();
    await expect(
      manager.ensureInstance('new-profile', { mode: 'shared', group: 'review-safety' })
    ).rejects.toThrow('Unsafe account instance path');

    expect(fs.readdirSync(externalInstances)).toEqual([]);
  });

  it('detects parent replacement and leaves only an empty redirected artifact', async () => {
    const managedCcsDir = path.join(tempRoot, '.ccs');
    const managedInstances = path.join(managedCcsDir, 'instances');
    const displacedCcsDir = path.join(tempRoot, 'displaced-ccs');
    const externalTarget = path.join(tempRoot, 'parent-race-target');
    fs.mkdirSync(managedCcsDir, { recursive: true });
    fs.mkdirSync(externalTarget, { recursive: true });
    fs.writeFileSync(path.join(externalTarget, 'sentinel.txt'), 'unchanged', 'utf8');

    const originalMkdirSync = fs.mkdirSync;
    let replacedParent = false;
    spyOn(fs, 'mkdirSync').mockImplementation((directoryPath, options) => {
      if (directoryPath === managedInstances && !replacedParent) {
        replacedParent = true;
        fs.renameSync(managedCcsDir, displacedCcsDir);
        fs.symlinkSync(externalTarget, managedCcsDir, 'dir');
      }
      return originalMkdirSync(directoryPath, options);
    });

    const manager = new InstanceManager();
    await expect(
      manager.ensureInstance('new-profile', { mode: 'isolated' }, { bare: true })
    ).rejects.toThrow('Unsafe account instance path');

    expect(replacedParent).toBe(true);
    expect(fs.readdirSync(externalTarget).sort()).toEqual(['instances', 'sentinel.txt']);
    expect(fs.readdirSync(path.join(externalTarget, 'instances'))).toEqual([]);
    expect(fs.existsSync(path.join(externalTarget, 'instances', '.locks'))).toBe(false);
    expect(fs.existsSync(path.join(externalTarget, 'instances', 'new-profile'))).toBe(false);
    expect(fs.readdirSync(displacedCcsDir)).toEqual([]);
  });

  it('preserves created and unrelated directories when the redirected path is replaced', async () => {
    const managedCcsDir = path.join(tempRoot, '.ccs');
    const managedInstances = path.join(managedCcsDir, 'instances');
    const displacedCcsDir = path.join(tempRoot, 'displaced-ccs-cleanup-race');
    const externalTarget = path.join(tempRoot, 'cleanup-race-target');
    const createdDirectory = path.join(externalTarget, 'created-instances');
    const redirectedInstances = path.join(externalTarget, 'instances');
    fs.mkdirSync(managedCcsDir, { recursive: true });
    fs.mkdirSync(externalTarget, { recursive: true });

    const originalMkdirSync = fs.mkdirSync;
    const originalLstatSync = fs.lstatSync;
    let replacedParent = false;
    let createdIdentityObserved = false;
    let substitutedUnrelatedDirectory = false;

    spyOn(fs, 'mkdirSync').mockImplementation((directoryPath, options) => {
      if (directoryPath === managedInstances && !replacedParent) {
        replacedParent = true;
        fs.renameSync(managedCcsDir, displacedCcsDir);
        fs.symlinkSync(externalTarget, managedCcsDir, 'dir');
      }
      return originalMkdirSync(directoryPath, options);
    });
    spyOn(fs, 'lstatSync').mockImplementation((targetPath, options) => {
      if (
        targetPath === managedCcsDir &&
        createdIdentityObserved &&
        !substitutedUnrelatedDirectory
      ) {
        substitutedUnrelatedDirectory = true;
        fs.renameSync(redirectedInstances, createdDirectory);
        originalMkdirSync(redirectedInstances);
      }
      const stats = originalLstatSync(targetPath, options);
      if (targetPath === managedInstances && replacedParent && stats.isDirectory()) {
        createdIdentityObserved = true;
      }
      return stats;
    });

    const manager = new InstanceManager();
    await expect(
      manager.ensureInstance('new-profile', { mode: 'isolated' }, { bare: true })
    ).rejects.toThrow('Unsafe account instance path');

    expect(substitutedUnrelatedDirectory).toBe(true);
    expect(fs.existsSync(redirectedInstances)).toBe(true);
    expect(fs.readdirSync(redirectedInstances)).toEqual([]);
    expect(fs.existsSync(createdDirectory)).toBe(true);
    expect(fs.readdirSync(createdDirectory)).toEqual([]);
    expect(fs.existsSync(path.join(redirectedInstances, '.locks'))).toBe(false);
    expect(fs.existsSync(path.join(redirectedInstances, 'new-profile'))).toBe(false);
    expect(fs.existsSync(path.join(createdDirectory, '.locks'))).toBe(false);
    expect(fs.existsSync(path.join(createdDirectory, 'new-profile'))).toBe(false);
  });

  it('revalidates a newly created instance root before initializing its contents', async () => {
    const externalInstance = path.join(tempRoot, 'post-create-race-target');
    fs.mkdirSync(externalInstance, { recursive: true });
    fs.writeFileSync(path.join(externalInstance, 'sentinel.txt'), 'unchanged', 'utf8');

    const manager = new InstanceManager();
    const instancePath = manager.getInstancePath('new-profile');
    const originalMkdirSync = fs.mkdirSync;
    spyOn(fs, 'mkdirSync').mockImplementation((directoryPath, options) => {
      if (directoryPath === instancePath) {
        fs.symlinkSync(externalInstance, instancePath, 'dir');
        return undefined;
      }
      return originalMkdirSync(directoryPath, options);
    });

    await expect(
      manager.ensureInstance('new-profile', { mode: 'isolated' }, { bare: true })
    ).rejects.toThrow('Unsafe account instance path');

    expect(fs.readdirSync(externalInstance)).toEqual(['sentinel.txt']);
    expect(fs.readFileSync(path.join(externalInstance, 'sentinel.txt'), 'utf8')).toBe('unchanged');
  });

  it('skips shared symlinks and MCP sync for bare instance creation', async () => {
    const linkSharedSpy = spyOn(
      SharedManager.prototype,
      'linkSharedDirectories'
    ).mockImplementation(() => {});
    spyOn(SharedManager.prototype, 'syncProjectContext').mockResolvedValue(undefined);
    spyOn(SharedManager.prototype, 'syncAdvancedContinuityArtifacts').mockResolvedValue(undefined);
    const syncMcpSpy = spyOn(InstanceManager.prototype, 'syncMcpServers').mockImplementation(
      () => false
    );

    const manager = new InstanceManager();
    const instancePath = manager.getInstancePath('sandbox');
    const globalRegistryPath = path.join(claudeDir(), 'plugins', 'known_marketplaces.json');
    ensureMarketplacePayload(claudeDir());
    writeMarketplaceRegistry(
      globalRegistryPath,
      path.join(
        tempRoot,
        '.ccs',
        'instances',
        'work',
        'plugins',
        'marketplaces',
        'claude-code-plugins'
      )
    );

    await manager.ensureInstance('sandbox', { mode: 'isolated' }, { bare: true });

    expect(linkSharedSpy).not.toHaveBeenCalled();
    expect(fs.existsSync(instancePath)).toBe(true);
    expectMarketplaceLocation(globalRegistryPath, marketplacePath(claudeDir()));
    expect(fs.existsSync(path.join(instancePath, 'plugins', 'known_marketplaces.json'))).toBe(
      false
    );
    expect(syncMcpSpy).not.toHaveBeenCalled();
  });

  it('detaches existing shared layout when an instance is reopened as bare', async () => {
    spyOn(SharedManager.prototype, 'syncProjectContext').mockResolvedValue(undefined);
    spyOn(SharedManager.prototype, 'syncAdvancedContinuityArtifacts').mockResolvedValue(undefined);
    const syncMcpSpy = spyOn(InstanceManager.prototype, 'syncMcpServers').mockImplementation(
      () => false
    );

    const manager = new InstanceManager();
    const instancePath = await manager.ensureInstance('work', { mode: 'isolated' });
    syncMcpSpy.mockClear();

    await manager.ensureInstance('work', { mode: 'isolated' }, { bare: true });

    expect(fs.existsSync(path.join(instancePath, 'settings.json'))).toBe(false);
    expect(fs.existsSync(path.join(instancePath, 'commands'))).toBe(false);
    expect(fs.existsSync(path.join(instancePath, 'skills'))).toBe(false);
    expect(fs.existsSync(path.join(instancePath, 'agents'))).toBe(false);
    expect(fs.existsSync(path.join(instancePath, 'plugins'))).toBe(false);
    expect(syncMcpSpy).not.toHaveBeenCalled();
  });

  it('restores the shared layout when a bare-reopened instance is switched back to non-bare', async () => {
    spyOn(SharedManager.prototype, 'syncProjectContext').mockResolvedValue(undefined);
    spyOn(SharedManager.prototype, 'syncAdvancedContinuityArtifacts').mockResolvedValue(undefined);
    const syncMcpSpy = spyOn(InstanceManager.prototype, 'syncMcpServers').mockImplementation(
      () => false
    );

    const globalRegistryPath = path.join(claudeDir(), 'plugins', 'known_marketplaces.json');
    ensureMarketplacePayload(claudeDir());
    writeMarketplaceRegistry(globalRegistryPath, marketplacePath(claudeDir()));

    const manager = new InstanceManager();
    const instancePath = await manager.ensureInstance('work', { mode: 'isolated' });
    await manager.ensureInstance('work', { mode: 'isolated' }, { bare: true });
    syncMcpSpy.mockClear();

    await manager.ensureInstance('work', { mode: 'isolated' });

    expect(fs.lstatSync(path.join(instancePath, 'settings.json')).isSymbolicLink()).toBe(true);
    expectMarketplaceLocation(
      path.join(instancePath, 'plugins', 'known_marketplaces.json'),
      marketplacePath(instancePath)
    );
    expect(syncMcpSpy).toHaveBeenCalledWith(instancePath);
  });

  it('preserves genuine bare-local content when re-ensuring a bare instance', async () => {
    spyOn(SharedManager.prototype, 'syncProjectContext').mockResolvedValue(undefined);
    spyOn(SharedManager.prototype, 'syncAdvancedContinuityArtifacts').mockResolvedValue(undefined);
    const syncMcpSpy = spyOn(InstanceManager.prototype, 'syncMcpServers').mockImplementation(
      () => false
    );

    const manager = new InstanceManager();
    const instancePath = manager.getInstancePath('sandbox');
    fs.mkdirSync(path.join(instancePath, 'plugins', 'marketplaces', 'custom-market'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(instancePath, 'commands'), { recursive: true });
    fs.writeFileSync(
      path.join(instancePath, 'settings.json'),
      JSON.stringify({ local: true }, null, 2),
      'utf8'
    );
    fs.writeFileSync(path.join(instancePath, 'commands', 'local.md'), '# local', 'utf8');
    writeMarketplaceRegistry(
      path.join(instancePath, 'plugins', 'known_marketplaces.json'),
      marketplacePath(instancePath, 'custom-market')
    );

    await manager.ensureInstance('sandbox', { mode: 'isolated' }, { bare: true });

    expect(readJson(path.join(instancePath, 'settings.json'))).toEqual({ local: true });
    expect(fs.readFileSync(path.join(instancePath, 'commands', 'local.md'), 'utf8')).toBe(
      '# local'
    );
    expectMarketplaceLocation(
      path.join(instancePath, 'plugins', 'known_marketplaces.json'),
      marketplacePath(instancePath, 'custom-market')
    );
    expect(syncMcpSpy).not.toHaveBeenCalled();
  });

  it('rewrites existing non-bare instance marketplace metadata to the instance-local plugin dir', async () => {
    spyOn(SharedManager.prototype, 'syncProjectContext').mockResolvedValue(undefined);
    spyOn(SharedManager.prototype, 'syncAdvancedContinuityArtifacts').mockResolvedValue(undefined);
    const syncMcpSpy = spyOn(InstanceManager.prototype, 'syncMcpServers').mockImplementation(
      () => false
    );

    const manager = new InstanceManager();
    const instancePath = manager.getInstancePath('work');
    ensureMarketplacePayload(claudeDir());
    writeMarketplaceRegistry(
      path.join(instancePath, 'plugins', 'known_marketplaces.json'),
      path.join(tempRoot, '.claude', 'plugins', 'marketplaces', 'claude-code-plugins')
    );

    await manager.ensureInstance('work', { mode: 'isolated' });

    expectMarketplaceLocation(
      path.join(instancePath, 'plugins', 'known_marketplaces.json'),
      marketplacePath(instancePath)
    );
    expect(syncMcpSpy).toHaveBeenCalledWith(instancePath);
  });

  it('writes new non-bare instance marketplace metadata without clobbering the global copy', async () => {
    spyOn(SharedManager.prototype, 'syncProjectContext').mockResolvedValue(undefined);
    spyOn(SharedManager.prototype, 'syncAdvancedContinuityArtifacts').mockResolvedValue(undefined);
    const syncMcpSpy = spyOn(InstanceManager.prototype, 'syncMcpServers').mockImplementation(
      () => false
    );

    const globalRegistryPath = path.join(claudeDir(), 'plugins', 'known_marketplaces.json');
    ensureMarketplacePayload(claudeDir());
    writeMarketplaceRegistry(
      globalRegistryPath,
      path.join(
        tempRoot,
        '.ccs',
        'instances',
        'work',
        'plugins',
        'marketplaces',
        'claude-code-plugins'
      )
    );

    const manager = new InstanceManager();
    const instancePath = await manager.ensureInstance('work', { mode: 'isolated' });

    expectMarketplaceLocation(globalRegistryPath, marketplacePath(claudeDir()));
    expectMarketplaceLocation(
      path.join(instancePath, 'plugins', 'known_marketplaces.json'),
      marketplacePath(instancePath)
    );
    expect(syncMcpSpy).toHaveBeenCalledWith(instancePath);
  });

  it('reconciles marketplace metadata across isolated instances without losing refresh fields', async () => {
    spyOn(SharedManager.prototype, 'syncProjectContext').mockResolvedValue(undefined);
    spyOn(SharedManager.prototype, 'syncAdvancedContinuityArtifacts').mockResolvedValue(undefined);

    const manager = new InstanceManager();
    ensureMarketplacePayload(claudeDir());
    const workPath = await manager.ensureInstance('work', { mode: 'isolated' });
    const workRegistryPath = path.join(workPath, 'plugins', 'known_marketplaces.json');
    writeMarketplaceRegistryWithMetadata(workRegistryPath, marketplacePath(workPath), {
      label: 'Official marketplace',
      refreshToken: 'refresh-token',
      metadata: {
        source: 'refresh-flow',
        lastSyncedAt: '2026-03-18T00:00:00Z',
      },
    });

    const personalPath = await manager.ensureInstance('personal', { mode: 'isolated' });
    const workRegistry = readJson(workRegistryPath) as Record<
      string,
      {
        installLocation?: string;
        label?: string;
        refreshToken?: string;
        metadata?: Record<string, unknown>;
      }
    >;
    const personalRegistry = readJson(
      path.join(personalPath, 'plugins', 'known_marketplaces.json')
    ) as Record<
      string,
      {
        installLocation?: string;
        label?: string;
        refreshToken?: string;
        metadata?: Record<string, unknown>;
      }
    >;

    expect(workRegistry['claude-code-plugins']).toMatchObject({
      installLocation: marketplacePath(workPath),
      label: 'Official marketplace',
      refreshToken: 'refresh-token',
      metadata: {
        source: 'refresh-flow',
        lastSyncedAt: '2026-03-18T00:00:00Z',
      },
    });
    expect(personalRegistry['claude-code-plugins']).toMatchObject({
      installLocation: marketplacePath(personalPath),
      label: 'Official marketplace',
      refreshToken: 'refresh-token',
      metadata: {
        source: 'refresh-flow',
        lastSyncedAt: '2026-03-18T00:00:00Z',
      },
    });
  });

  it('upgrades a legacy shared plugins symlink to an instance-local layout', async () => {
    spyOn(SharedManager.prototype, 'syncProjectContext').mockResolvedValue(undefined);
    spyOn(SharedManager.prototype, 'syncAdvancedContinuityArtifacts').mockResolvedValue(undefined);

    const manager = new InstanceManager();
    const legacyPath = manager.getInstancePath('legacy');
    const sharedPluginsPath = path.join(tempRoot, '.ccs', 'shared', 'plugins');
    fs.mkdirSync(sharedPluginsPath, { recursive: true });
    fs.mkdirSync(legacyPath, { recursive: true });
    fs.symlinkSync(sharedPluginsPath, path.join(legacyPath, 'plugins'), 'dir');

    ensureMarketplacePayload(claudeDir());
    writeMarketplaceRegistryWithMetadata(
      path.join(claudeDir(), 'plugins', 'known_marketplaces.json'),
      path.join(tempRoot, '.ccs', 'shared', 'plugins', 'marketplaces', 'claude-code-plugins'),
      {
        label: 'Legacy marketplace',
        refreshToken: 'legacy-refresh-token',
      }
    );

    await manager.ensureInstance('legacy', { mode: 'isolated' });

    expect(fs.lstatSync(path.join(legacyPath, 'plugins')).isSymbolicLink()).toBe(false);
    expectMarketplaceLocation(
      path.join(legacyPath, 'plugins', 'known_marketplaces.json'),
      marketplacePath(legacyPath)
    );

    const legacyRegistry = readJson(
      path.join(legacyPath, 'plugins', 'known_marketplaces.json')
    ) as Record<string, { installLocation?: string; label?: string; refreshToken?: string }>;
    expect(legacyRegistry['claude-code-plugins']).toMatchObject({
      installLocation: marketplacePath(legacyPath),
      label: 'Legacy marketplace',
      refreshToken: 'legacy-refresh-token',
    });
  });
});
