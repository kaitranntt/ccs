import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import SharedManager from '../../src/management/shared-manager';

describe('shared CLAUDE.md memory', () => {
  let tempHome = '';
  let originalHome: string | undefined;
  let originalCcsHome: string | undefined;
  let originalCcsDir: string | undefined;

  const claudeFile = () => path.join(tempHome, '.claude', 'CLAUDE.md');
  const ccsDir = () => path.join(tempHome, '.ccs');
  const sharedFile = () => path.join(ccsDir(), 'shared', 'CLAUDE.md');
  const instanceDir = (name: string) => path.join(ccsDir(), 'instances', name);
  const instanceFile = (name: string) => path.join(instanceDir(name), 'CLAUDE.md');

  function writeFile(filePath: string, content: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
  }

  function conflictFiles(filePath: string): string[] {
    const prefix = `${path.basename(filePath)}.ccs-shared-conflict`;
    return fs
      .readdirSync(path.dirname(filePath))
      .filter((entry) => entry === prefix || entry.startsWith(`${prefix}-`))
      .map((entry) => path.join(path.dirname(filePath), entry));
  }

  function writeLegacyProfiles(
    profiles: Record<string, { shared_resource_mode?: string; bare?: boolean }>
  ): void {
    writeFile(
      path.join(ccsDir(), 'profiles.json'),
      JSON.stringify(
        {
          version: '2.0.0',
          default: null,
          profiles: Object.fromEntries(
            Object.entries(profiles).map(([name, metadata]) => [
              name,
              {
                type: 'account',
                created: '2026-08-08T00:00:00.000Z',
                last_used: null,
                ...metadata,
              },
            ])
          ),
        },
        null,
        2
      )
    );
  }

  function expectLinkTo(filePath: string, targetPath: string): void {
    expect(fs.lstatSync(filePath).isSymbolicLink()).toBe(true);
    expect(path.resolve(path.dirname(filePath), fs.readlinkSync(filePath))).toBe(targetPath);
  }

  function expectInvalidInstancePath(operation: () => void): void {
    let thrown: unknown;
    try {
      operation();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(TypeError);
    expect((thrown as NodeJS.ErrnoException).code).toBe('EINVAL');
  }

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-shared-claude-memory-'));
    originalHome = process.env.HOME;
    originalCcsHome = process.env.CCS_HOME;
    originalCcsDir = process.env.CCS_DIR;

    spyOn(os, 'homedir').mockReturnValue(tempHome);
    process.env.HOME = tempHome;
    process.env.CCS_HOME = tempHome;
    delete process.env.CCS_DIR;
  });

  afterEach(() => {
    mock.restore();

    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalCcsHome === undefined) delete process.env.CCS_HOME;
    else process.env.CCS_HOME = originalCcsHome;
    if (originalCcsDir === undefined) delete process.env.CCS_DIR;
    else process.env.CCS_DIR = originalCcsDir;

    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('seeds missing Markdown as empty text and links it through the shared root', () => {
    const manager = new SharedManager();
    const workInstance = instanceDir('work');
    fs.mkdirSync(workInstance, { recursive: true });

    manager.linkSharedDirectories(workInstance);

    expect(fs.readFileSync(claudeFile(), 'utf8')).toBe('');
    expectLinkTo(sharedFile(), claudeFile());
    expectLinkTo(instanceFile('work'), sharedFile());
  });

  it('preserves canonical instructions and quarantines an older instance variant', () => {
    const manager = new SharedManager();
    writeFile(claudeFile(), '# Canonical\n');
    writeFile(instanceFile('work'), '# Stale local copy\n');

    manager.linkSharedDirectories(instanceDir('work'));

    expect(fs.readFileSync(claudeFile(), 'utf8')).toBe('# Canonical\n');
    expectLinkTo(instanceFile('work'), sharedFile());
    const recoveries = conflictFiles(instanceFile('work'));
    expect(recoveries).toHaveLength(1);
    expect(fs.readFileSync(recoveries[0], 'utf8')).toBe('# Stale local copy\n');
  });

  it('adopts the only instance variant when the canonical file is absent', () => {
    const manager = new SharedManager();
    writeFile(instanceFile('work'), '# Adopt me\n');

    manager.linkSharedDirectories(instanceDir('work'));

    expect(fs.readFileSync(claudeFile(), 'utf8')).toBe('# Adopt me\n');
    expectLinkTo(instanceFile('work'), sharedFile());
  });

  it('never inventories or mutates profile-local CLAUDE.md content', () => {
    const manager = new SharedManager();
    writeLegacyProfiles({
      work: { shared_resource_mode: 'shared' },
      sandbox: { shared_resource_mode: 'profile-local', bare: true },
    });
    writeFile(instanceFile('work'), '# Shared account\n');
    writeFile(instanceFile('sandbox'), '# Isolated account\n');

    manager.linkSharedDirectories(instanceDir('work'));

    expect(fs.readFileSync(claudeFile(), 'utf8')).toBe('# Shared account\n');
    expect(fs.readFileSync(instanceFile('sandbox'), 'utf8')).toBe('# Isolated account\n');
    expect(conflictFiles(instanceFile('sandbox'))).toEqual([]);
    expectLinkTo(instanceFile('work'), sharedFile());
  });

  it('matches uppercase profile metadata to its normalized instance name', () => {
    const manager = new SharedManager();
    writeLegacyProfiles({
      work: { shared_resource_mode: 'shared' },
      Sandbox: { shared_resource_mode: 'profile-local', bare: true },
    });
    writeFile(instanceFile('work'), '# Shared account\n');
    writeFile(instanceFile('sandbox'), '# Uppercase isolated account\n');

    manager.linkSharedDirectories(instanceDir('work'));

    expect(fs.readFileSync(claudeFile(), 'utf8')).toBe('# Shared account\n');
    expect(fs.readFileSync(instanceFile('sandbox'), 'utf8')).toBe('# Uppercase isolated account\n');
    expect(conflictFiles(instanceFile('sandbox'))).toEqual([]);
  });

  it('excludes legacy profile-name normalization collisions from inventory', () => {
    const manager = new SharedManager();
    writeLegacyProfiles({
      work: { shared_resource_mode: 'shared' },
      Sandbox: { shared_resource_mode: 'profile-local', bare: true },
      sandbox: { shared_resource_mode: 'shared' },
    });
    writeFile(instanceFile('work'), '# Shared account\n');
    writeFile(instanceFile('sandbox'), '# Ambiguous legacy account\n');

    manager.linkSharedDirectories(instanceDir('work'));

    expect(fs.readFileSync(claudeFile(), 'utf8')).toBe('# Shared account\n');
    expect(fs.readFileSync(instanceFile('sandbox'), 'utf8')).toBe('# Ambiguous legacy account\n');
    expect(conflictFiles(instanceFile('sandbox'))).toEqual([]);
  });

  it('quarantines every distinct variant instead of selecting by mtime', () => {
    const manager = new SharedManager();
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    writeFile(instanceFile('work'), '# Work\n');
    writeFile(instanceFile('personal'), '# Personal\n');
    const now = Date.now();
    fs.utimesSync(instanceFile('work'), new Date(now - 60_000), new Date(now - 60_000));
    fs.utimesSync(instanceFile('personal'), new Date(now), new Date(now));

    manager.linkSharedDirectories(instanceDir('work'));

    expect(fs.readFileSync(claudeFile(), 'utf8')).toBe('');
    expect(fs.readFileSync(conflictFiles(instanceFile('work'))[0], 'utf8')).toBe('# Work\n');
    expect(fs.readFileSync(conflictFiles(instanceFile('personal'))[0], 'utf8')).toBe(
      '# Personal\n'
    );
    expect(
      logSpy.mock.calls.some(([message]) =>
        String(message).includes('No CLAUDE.md variant was selected')
      )
    ).toBe(true);
  });

  it('is idempotent after canonical-first reconciliation', () => {
    const manager = new SharedManager();
    writeFile(claudeFile(), '# Canonical\n');
    writeFile(instanceFile('work'), '# Diverged\n');

    manager.linkSharedDirectories(instanceDir('work'));
    const firstRecoveries = conflictFiles(instanceFile('work'));
    manager.linkSharedDirectories(instanceDir('work'));

    expect(conflictFiles(instanceFile('work'))).toEqual(firstRecoveries);
    expect(fs.readFileSync(claudeFile(), 'utf8')).toBe('# Canonical\n');
    expectLinkTo(instanceFile('work'), sharedFile());
  });

  it('never lets a later diverged instance overwrite canonical instructions', () => {
    const manager = new SharedManager();
    writeFile(claudeFile(), '# Canonical\n');
    fs.mkdirSync(instanceDir('work'), { recursive: true });
    manager.linkSharedDirectories(instanceDir('work'));

    fs.unlinkSync(instanceFile('work'));
    writeFile(instanceFile('work'), '# Newer but local\n');
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(instanceFile('work'), future, future);

    manager.linkSharedDirectories(instanceDir('work'));

    expect(fs.readFileSync(claudeFile(), 'utf8')).toBe('# Canonical\n');
    expect(fs.readFileSync(conflictFiles(instanceFile('work'))[0], 'utf8')).toBe(
      '# Newer but local\n'
    );
    expectLinkTo(instanceFile('work'), sharedFile());
  });

  it('keeps the shared file that ~/.claude/CLAUDE.md links to', () => {
    writeFile(sharedFile(), '# Only copy\n');
    fs.mkdirSync(path.dirname(claudeFile()), { recursive: true });
    fs.symlinkSync(sharedFile(), claudeFile());

    new SharedManager().ensureSharedDirectories();

    expect(fs.lstatSync(sharedFile()).isFile()).toBe(true);
    expect(fs.readFileSync(sharedFile(), 'utf8')).toBe('# Only copy\n');
    expectLinkTo(claudeFile(), sharedFile());
    expect(conflictFiles(sharedFile())).toEqual([]);
  });

  it('keeps an instance file that ~/.claude/CLAUDE.md links to', () => {
    writeFile(instanceFile('work'), '# Only copy\n');
    fs.mkdirSync(path.dirname(claudeFile()), { recursive: true });
    fs.symlinkSync(instanceFile('work'), claudeFile());

    new SharedManager().linkSharedDirectories(instanceDir('work'));

    expect(fs.lstatSync(instanceFile('work')).isFile()).toBe(true);
    expect(fs.readFileSync(instanceFile('work'), 'utf8')).toBe('# Only copy\n');
    expectLinkTo(claudeFile(), instanceFile('work'));
    expect(conflictFiles(instanceFile('work'))).toEqual([]);
  });

  it('still replaces an identical instance copy the canonical link does not resolve to', () => {
    writeFile(sharedFile(), '# Only copy\n');
    writeFile(instanceFile('work'), '# Only copy\n');
    fs.mkdirSync(path.dirname(claudeFile()), { recursive: true });
    fs.symlinkSync(sharedFile(), claudeFile());

    new SharedManager().linkSharedDirectories(instanceDir('work'));

    expect(fs.readFileSync(sharedFile(), 'utf8')).toBe('# Only copy\n');
    expectLinkTo(instanceFile('work'), sharedFile());
    expect(conflictFiles(instanceFile('work'))).toEqual([]);
  });

  it('still replaces an instance hard link to a regular canonical file', () => {
    writeFile(claudeFile(), '# Canonical\n');
    fs.mkdirSync(instanceDir('work'), { recursive: true });
    fs.linkSync(claudeFile(), instanceFile('work'));

    new SharedManager().linkSharedDirectories(instanceDir('work'));

    expect(fs.readFileSync(claudeFile(), 'utf8')).toBe('# Canonical\n');
    expectLinkTo(instanceFile('work'), sharedFile());
    expect(conflictFiles(instanceFile('work'))).toEqual([]);
  });

  it('still replaces an instance hard link to the file ~/.claude/CLAUDE.md links to', () => {
    const externalFile = path.join(tempHome, 'dotfiles', 'CLAUDE.md');
    writeFile(externalFile, '# External\n');
    fs.mkdirSync(path.dirname(claudeFile()), { recursive: true });
    fs.symlinkSync(externalFile, claudeFile());
    fs.mkdirSync(instanceDir('work'), { recursive: true });
    fs.linkSync(externalFile, instanceFile('work'));

    new SharedManager().linkSharedDirectories(instanceDir('work'));

    expect(fs.readFileSync(externalFile, 'utf8')).toBe('# External\n');
    expectLinkTo(claudeFile(), externalFile);
    expectLinkTo(instanceFile('work'), sharedFile());
    expect(conflictFiles(instanceFile('work'))).toEqual([]);
  });

  it('still relinks a shared symlink that reaches the canonical file by another route', () => {
    const externalFile = path.join(tempHome, 'dotfiles', 'CLAUDE.md');
    writeFile(externalFile, '# External\n');
    fs.mkdirSync(path.dirname(claudeFile()), { recursive: true });
    fs.mkdirSync(path.dirname(sharedFile()), { recursive: true });
    fs.symlinkSync(externalFile, claudeFile());
    fs.symlinkSync(externalFile, sharedFile());

    new SharedManager().ensureSharedDirectories();

    expect(fs.readFileSync(externalFile, 'utf8')).toBe('# External\n');
    expectLinkTo(claudeFile(), externalFile);
    expectLinkTo(sharedFile(), claudeFile());
  });

  it('still preserves a divergent shared file that the canonical link only names lexically', () => {
    const elsewhere = path.join(tempHome, 'elsewhere');
    writeFile(path.join(elsewhere, 'CLAUDE.md'), '# Canonical\n');
    fs.mkdirSync(path.join(elsewhere, 'child'), { recursive: true });
    writeFile(sharedFile(), '# Divergent\n');
    fs.symlinkSync(path.join(elsewhere, 'child'), path.join(ccsDir(), 'shared', 'hop'));
    fs.mkdirSync(path.dirname(claudeFile()), { recursive: true });
    // `hop/..` is `elsewhere`, not the shared root, once `hop` is followed.
    fs.symlinkSync(`${ccsDir()}/shared/hop/../CLAUDE.md`, claudeFile());

    new SharedManager().ensureSharedDirectories();

    expect(fs.readFileSync(claudeFile(), 'utf8')).toBe('# Canonical\n');
    const recoveries = conflictFiles(sharedFile());
    expect(recoveries).toHaveLength(1);
    expect(fs.readFileSync(recoveries[0], 'utf8')).toBe('# Divergent\n');
  });

  it.skipIf(process.platform !== 'linux')(
    'still preserves a divergent shared file whose real path differs only in non-UTF-8 bytes',
    () => {
      const byteDir = (byte: number) =>
        Buffer.concat([Buffer.from(path.join(tempHome, 'real-')), Buffer.from([byte])]);
      const inDir = (dir: Buffer, name: string) => Buffer.concat([dir, Buffer.from(`/${name}`)]);
      const sharedTarget = byteDir(0x80);
      const canonicalTarget = byteDir(0x81);
      fs.mkdirSync(sharedTarget);
      fs.mkdirSync(canonicalTarget);
      fs.writeFileSync(inDir(sharedTarget, 'CLAUDE.md'), '# Divergent\n');
      fs.writeFileSync(inDir(canonicalTarget, 'CLAUDE.md'), '# Canonical\n');
      fs.mkdirSync(ccsDir(), { recursive: true });
      fs.symlinkSync(sharedTarget, path.join(ccsDir(), 'shared'));
      fs.mkdirSync(path.dirname(claudeFile()), { recursive: true });
      fs.symlinkSync(inDir(canonicalTarget, 'CLAUDE.md'), claudeFile());

      new SharedManager().ensureSharedDirectories();

      expect(fs.readFileSync(claudeFile(), 'utf8')).toBe('# Canonical\n');
      const recoveries = conflictFiles(sharedFile());
      expect(recoveries).toHaveLength(1);
      expect(fs.readFileSync(recoveries[0], 'utf8')).toBe('# Divergent\n');
    }
  );

  for (const linkErrorCode of ['EPERM', 'EACCES', 'ENOTSUP']) {
    it(`copies conflict recovery when hard links fail with ${linkErrorCode}`, () => {
      const manager = new SharedManager();
      const originalLinkSync = fs.linkSync;
      writeFile(claudeFile(), '# Canonical\n');
      writeFile(instanceFile('work'), '# Diverged\n');
      spyOn(fs, 'linkSync').mockImplementation((existingPath, newPath) => {
        if (String(newPath).includes('.ccs-shared-conflict')) {
          throw Object.assign(new Error('simulated hard-link failure'), { code: linkErrorCode });
        }
        return originalLinkSync(existingPath, newPath);
      });

      manager.linkSharedDirectories(instanceDir('work'));

      expect(fs.readFileSync(conflictFiles(instanceFile('work'))[0], 'utf8')).toBe('# Diverged\n');
      expectLinkTo(instanceFile('work'), sharedFile());
    });
  }

  it('restores the original divergence when hard-link and copy recovery both fail', () => {
    const manager = new SharedManager();
    const originalCopyFileSync = fs.copyFileSync;
    writeFile(claudeFile(), '# Canonical\n');
    writeFile(instanceFile('work'), '# Diverged\n');
    spyOn(fs, 'linkSync').mockImplementation(() => {
      throw Object.assign(new Error('simulated hard-link failure'), { code: 'EPERM' });
    });
    spyOn(fs, 'copyFileSync').mockImplementation((source, destination, mode) => {
      if (String(destination).includes('.ccs-shared-conflict')) {
        throw Object.assign(new Error('simulated copy failure'), { code: 'EACCES' });
      }
      return originalCopyFileSync(source, destination, mode);
    });

    expect(() => manager.linkSharedDirectories(instanceDir('work'))).toThrow(
      'simulated hard-link failure'
    );
    expect(fs.readFileSync(instanceFile('work'), 'utf8')).toBe('# Diverged\n');
    expect(
      fs.readdirSync(instanceDir('work')).some((entry) => entry.includes('.ccs-shared-claim-'))
    ).toBe(false);
  });

  it('recovers an interrupted claim before inventory and adoption', () => {
    const manager = new SharedManager();
    const claimPath = `${instanceFile('work')}.ccs-shared-claim-interrupted`;
    writeFile(claimPath, '# Interrupted\n');

    manager.linkSharedDirectories(instanceDir('work'));

    expect(fs.readFileSync(claudeFile(), 'utf8')).toBe('# Interrupted\n');
    expect(fs.existsSync(claimPath)).toBe(false);
    expectLinkTo(instanceFile('work'), sharedFile());
  });

  it('preserves both copies and aborts when a concurrent writer replaces the claimed path', () => {
    const manager = new SharedManager();
    const originalRenameSync = fs.renameSync;
    writeFile(claudeFile(), '# Canonical\n');
    writeFile(instanceFile('work'), '# Claimed\n');
    spyOn(fs, 'renameSync').mockImplementation((oldPath, newPath) => {
      originalRenameSync(oldPath, newPath);
      if (oldPath === instanceFile('work') && String(newPath).includes('.ccs-shared-claim-')) {
        writeFile(instanceFile('work'), '# Concurrent writer\n');
      }
    });

    expect(() => manager.linkSharedDirectories(instanceDir('work'))).toThrow(
      'Concurrent replacement detected'
    );
    expect(fs.readFileSync(instanceFile('work'), 'utf8')).toBe('# Concurrent writer\n');
    expect(fs.readFileSync(conflictFiles(instanceFile('work'))[0], 'utf8')).toBe('# Claimed\n');
    expect(fs.readFileSync(claudeFile(), 'utf8')).toBe('# Canonical\n');
  });

  it('aborts when a late writer recreates the path during recovery publication', () => {
    const manager = new SharedManager();
    const originalLinkSync = fs.linkSync;
    writeFile(claudeFile(), '# Canonical\n');
    writeFile(instanceFile('work'), '# Claimed\n');
    spyOn(fs, 'linkSync').mockImplementation((existingPath, newPath) => {
      const result = originalLinkSync(existingPath, newPath);
      if (String(newPath).includes('.ccs-shared-conflict')) {
        writeFile(instanceFile('work'), '# Late writer\n');
      }
      return result;
    });

    expect(() => manager.linkSharedDirectories(instanceDir('work'))).toThrow(
      'Path reappeared during reconciliation'
    );
    expect(fs.readFileSync(instanceFile('work'), 'utf8')).toBe('# Late writer\n');
    expect(fs.readFileSync(conflictFiles(instanceFile('work'))[0], 'utf8')).toBe('# Claimed\n');
  });

  it('aborts when the instance root is replaced during shared-root setup', () => {
    const manager = new SharedManager();
    const workInstance = instanceDir('work');
    const originalInstance = instanceDir('work-original');
    const externalInstance = path.join(tempHome, 'external-work');
    const sentinelPath = path.join(externalInstance, 'sentinel.bin');
    const sentinel = Buffer.from([0x00, 0x7f, 0x80, 0xff]);
    fs.mkdirSync(workInstance, { recursive: true });
    fs.mkdirSync(externalInstance, { recursive: true });
    fs.mkdirSync(path.join(tempHome, '.claude'), { recursive: true });
    fs.mkdirSync(path.join(ccsDir(), 'shared'), { recursive: true });
    fs.writeFileSync(sentinelPath, sentinel);

    const originalMkdirSync = fs.mkdirSync;
    let replaced = false;
    spyOn(fs, 'mkdirSync').mockImplementation(((targetPath, options) => {
      if (!replaced && String(targetPath) === path.join(tempHome, '.claude', 'plugins')) {
        replaced = true;
        fs.renameSync(workInstance, originalInstance);
        fs.symlinkSync(externalInstance, workInstance, 'dir');
      }
      return originalMkdirSync(targetPath, options);
    }) as typeof fs.mkdirSync);

    expectInvalidInstancePath(() => manager.linkSharedDirectories(workInstance));
    expect(fs.readFileSync(sentinelPath)).toEqual(sentinel);
    expect(fs.readdirSync(externalInstance)).toEqual(['sentinel.bin']);
  });

  it('does not reconcile a regular replacement directory during shared-root setup', () => {
    const manager = new SharedManager();
    const workInstance = instanceDir('work');
    const originalInstance = instanceDir('work-original');
    const replacementFixture = path.join(tempHome, 'replacement-work');
    const replacementMemory = path.join(replacementFixture, 'CLAUDE.md');
    const sentinelPath = path.join(replacementFixture, 'sentinel.bin');
    const memoryBytes = Buffer.from([0x23, 0x20, 0x80, 0xff, 0x0a]);
    const sentinel = Buffer.from([0x11, 0x22, 0x33, 0x44]);
    fs.mkdirSync(workInstance, { recursive: true });
    fs.mkdirSync(replacementFixture, { recursive: true });
    fs.mkdirSync(path.join(tempHome, '.claude'), { recursive: true });
    fs.mkdirSync(path.join(ccsDir(), 'shared'), { recursive: true });
    fs.writeFileSync(replacementMemory, memoryBytes);
    fs.writeFileSync(sentinelPath, sentinel);

    const originalMkdirSync = fs.mkdirSync;
    let replaced = false;
    spyOn(fs, 'mkdirSync').mockImplementation(((targetPath, options) => {
      if (!replaced && String(targetPath) === path.join(tempHome, '.claude', 'plugins')) {
        replaced = true;
        fs.renameSync(workInstance, originalInstance);
        fs.renameSync(replacementFixture, workInstance);
      }
      return originalMkdirSync(targetPath, options);
    }) as typeof fs.mkdirSync);

    expectInvalidInstancePath(() => manager.linkSharedDirectories(workInstance));
    expect(fs.readFileSync(path.join(workInstance, 'CLAUDE.md'))).toEqual(memoryBytes);
    expect(fs.readFileSync(path.join(workInstance, 'sentinel.bin'))).toEqual(sentinel);
    expect(fs.readdirSync(workInstance).sort()).toEqual(['CLAUDE.md', 'sentinel.bin']);
  });

  it('aborts when the instance root is replaced during plugin linking', () => {
    const manager = new SharedManager();
    const workInstance = instanceDir('work');
    const originalInstance = instanceDir('work-original');
    const externalInstance = path.join(tempHome, 'external-work');
    const externalPlugins = path.join(externalInstance, 'plugins');
    const sentinelPath = path.join(externalPlugins, 'sentinel.bin');
    const sentinel = Buffer.from([0x10, 0x20, 0x30, 0x40]);
    fs.mkdirSync(path.join(workInstance, 'plugins'), { recursive: true });
    fs.mkdirSync(externalPlugins, { recursive: true });
    fs.writeFileSync(sentinelPath, sentinel);

    const originalLstatSync = fs.lstatSync;
    let replaced = false;
    spyOn(fs, 'lstatSync').mockImplementation(((targetPath, options) => {
      const result = originalLstatSync(targetPath, options);
      if (!replaced && String(targetPath) === path.join(workInstance, 'plugins')) {
        replaced = true;
        fs.renameSync(workInstance, originalInstance);
        fs.symlinkSync(externalInstance, workInstance, 'dir');
      }
      return result;
    }) as typeof fs.lstatSync);

    expectInvalidInstancePath(() => manager.linkSharedDirectories(workInstance));
    expect(fs.readFileSync(sentinelPath)).toEqual(sentinel);
    expect(fs.readdirSync(externalPlugins)).toEqual(['sentinel.bin']);
    expect(fs.readdirSync(externalInstance)).toEqual(['plugins']);
  });

  it('rejects linking through a symlinked instances root without touching its target', () => {
    const manager = new SharedManager();
    const managedInstances = path.join(ccsDir(), 'instances');
    const externalInstances = path.join(tempHome, 'external-instances');
    const externalWork = path.join(externalInstances, 'work');
    writeFile(path.join(externalWork, 'CLAUDE.md'), '# External\n');
    fs.mkdirSync(path.dirname(managedInstances), { recursive: true });
    fs.symlinkSync(externalInstances, managedInstances, 'dir');

    expect(() => manager.linkSharedDirectories(path.join(managedInstances, 'work'))).toThrow(
      'Unsafe account instance path'
    );
    expect(fs.readFileSync(path.join(externalWork, 'CLAUDE.md'), 'utf8')).toBe('# External\n');
  });
});
