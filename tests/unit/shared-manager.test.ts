import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  normalizePluginMetadataContent,
  normalizePluginMetadataPathString,
} from '../../src/management/plugin-path-normalizer';
import SharedManager, {
  normalizePluginMetadataContent as normalizeSharedManagerPluginMetadataContent,
  normalizePluginMetadataPathString as normalizeSharedManagerPluginMetadataPathString,
} from '../../src/management/shared-manager';

describe('SharedManager', () => {
  let tempRoot = '';
  let originalHome: string | undefined;
  let originalCcsHome: string | undefined;
  let originalCcsDir: string | undefined;
  let originalPlatform: PropertyDescriptor | undefined;

  const claudeDir = () => path.join(tempRoot, '.claude');
  const ccsDir = () => path.join(tempRoot, '.ccs');
  const instanceDir = (name: string) => path.join(ccsDir(), 'instances', name);
  const marketplacePath = (configDir: string, name = 'claude-code-plugins') =>
    path.join(configDir, 'plugins', 'marketplaces', name);
  const readJson = (filePath: string) =>
    JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;

  function ensureMarketplacePayload(configDir: string, name = 'claude-code-plugins'): void {
    fs.mkdirSync(marketplacePath(configDir, name), { recursive: true });
  }

  function writeJson(filePath: string, value: unknown): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
  }

  function setMtime(filePath: string, mtimeMs: number): void {
    const timestamp = new Date(mtimeMs);
    fs.utimesSync(filePath, timestamp, timestamp);
  }

  function findRecovery(filePath: string): string | undefined {
    const prefix = `${path.basename(filePath)}.ccs-adopt-recovery`;
    return fs
      .readdirSync(path.dirname(filePath))
      .find((entry) => entry === prefix || entry.startsWith(`${prefix}-`));
  }

  function readMarketplaceLocation(filePath: string, name = 'claude-code-plugins'): string {
    const parsed = readJson(filePath) as Record<string, { installLocation?: string }>;
    return parsed[name]?.installLocation ?? '';
  }

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-shared-manager-test-'));
    originalHome = process.env.HOME;
    originalCcsHome = process.env.CCS_HOME;
    originalCcsDir = process.env.CCS_DIR;
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');

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

    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }

    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  describe('plugin metadata path normalization', () => {
    it('rewrites instance plugin paths to the requested target config dir', () => {
      const targetConfigDir = path.join('/home/user', '.claude');
      const input = '/home/user/.ccs/instances/work/plugins/cache/plugin/0.0.2';

      expect(normalizePluginMetadataPathString(input, targetConfigDir)).toBe(
        '/home/user/.claude/plugins/cache/plugin/0.0.2'
      );
    });

    it('rewrites shared plugin paths to an instance-local target config dir', () => {
      const targetConfigDir = instanceDir('personal');
      const input = path.join(tempRoot, '.ccs', 'shared', 'plugins', 'marketplaces', 'official');

      expect(normalizePluginMetadataPathString(input, targetConfigDir)).toBe(
        marketplacePath(targetConfigDir, 'official')
      );
    });

    it('normalizes all matching JSON string values without changing the structure', () => {
      const targetConfigDir = instanceDir('work');
      const input = JSON.stringify(
        {
          plugins: {
            'plugin-a': [
              {
                installPath: path.join(
                  tempRoot,
                  '.ccs',
                  'instances',
                  'old',
                  'plugins',
                  'cache',
                  'plugin-a'
                ),
              },
            ],
          },
          marketplaces: {
            official: {
              installLocation: path.join(
                tempRoot,
                '.claude',
                'plugins',
                'marketplaces',
                'official'
              ),
            },
          },
        },
        null,
        2
      );

      const normalized = JSON.parse(normalizePluginMetadataContent(input, targetConfigDir)) as {
        plugins: { 'plugin-a': [{ installPath: string }] };
        marketplaces: { official: { installLocation: string } };
      };

      expect(normalized.plugins['plugin-a'][0].installPath).toBe(
        path.join(targetConfigDir, 'plugins', 'cache', 'plugin-a')
      );
      expect(normalized.marketplaces.official.installLocation).toBe(
        marketplacePath(targetConfigDir, 'official')
      );
    });

    it('preserves paths already rooted at the target config dir', () => {
      const targetConfigDir = instanceDir('work');
      const input = path.join(targetConfigDir, 'plugins', 'cache', 'plugin-a');

      expect(normalizePluginMetadataPathString(input, targetConfigDir)).toBe(input);
    });

    it('preserves original JSON content when no plugin path changes are needed', () => {
      const original = JSON.stringify({ plugins: { 'plugin-a': { enabled: true } } }, null, 4);

      expect(normalizePluginMetadataContent(original, instanceDir('work'))).toBe(original);
    });

    it('handles Windows path separators', () => {
      const targetConfigDir = 'C:\\Users\\user\\.claude';
      const input = 'C:\\Users\\user\\.ccs\\instances\\work\\plugins\\marketplaces\\official';

      expect(normalizePluginMetadataPathString(input, targetConfigDir)).toBe(
        'C:\\Users\\user\\.claude\\plugins\\marketplaces\\official'
      );
    });

    it('uses the current home directory when target config dir is omitted', () => {
      const input = path.join(tempRoot, '.ccs', 'shared', 'plugins', 'cache', 'plugin-a');

      expect(normalizePluginMetadataPathString(input)).toBe(
        path.join(tempRoot, '.claude', 'plugins', 'cache', 'plugin-a')
      );
    });

    it('keeps the legacy shared-manager helper export compatible', () => {
      const targetConfigDir = instanceDir('work');
      const input = path.join(tempRoot, '.ccs', 'shared', 'plugins', 'cache', 'plugin-a');
      const content = JSON.stringify({ installPath: input }, null, 2);

      expect(normalizeSharedManagerPluginMetadataPathString(input, targetConfigDir)).toBe(
        normalizePluginMetadataPathString(input, targetConfigDir)
      );
      expect(normalizeSharedManagerPluginMetadataContent(content, targetConfigDir)).toBe(
        normalizePluginMetadataContent(content, targetConfigDir)
      );
    });
  });

  describe('shared symlink lifecycle', () => {
    it('does not rewrite inverse shared symlink chains into a real loop', () => {
      const manager = new SharedManager();
      const externalCommandsDir = path.join(tempRoot, 'Documents', 'claude-config', 'commands');
      const claudeCommandsPath = path.join(claudeDir(), 'commands');
      const sharedCommandsPath = path.join(ccsDir(), 'shared', 'commands');
      const logSpy = spyOn(console, 'log').mockImplementation(() => {});

      fs.mkdirSync(externalCommandsDir, { recursive: true });
      fs.mkdirSync(claudeDir(), { recursive: true });
      fs.mkdirSync(path.join(ccsDir(), 'shared'), { recursive: true });
      fs.symlinkSync(sharedCommandsPath, claudeCommandsPath, 'dir');
      fs.symlinkSync(externalCommandsDir, sharedCommandsPath, 'dir');

      manager.ensureSharedDirectories();

      expect(
        logSpy.mock.calls.some(([message]) =>
          String(message).includes('Skipping commands: circular symlink detected')
        )
      ).toBe(true);
      expect(fs.lstatSync(claudeCommandsPath).isSymbolicLink()).toBe(true);
      expect(
        path.resolve(path.dirname(claudeCommandsPath), fs.readlinkSync(claudeCommandsPath))
      ).toBe(sharedCommandsPath);
      expect(fs.lstatSync(sharedCommandsPath).isSymbolicLink()).toBe(true);
      expect(
        path.resolve(path.dirname(sharedCommandsPath), fs.readlinkSync(sharedCommandsPath))
      ).toBe(externalCommandsDir);
    });

    it('preserves external ~/.claude symlinks during upgrade reconciliation', () => {
      const manager = new SharedManager();
      const externalCommandsDir = path.join(tempRoot, 'Documents', 'claude-config', 'commands');
      const externalSettingsPath = path.join(
        tempRoot,
        'Documents',
        'claude-config',
        'settings.json'
      );
      const claudeCommandsPath = path.join(claudeDir(), 'commands');
      const claudeSettingsPath = path.join(claudeDir(), 'settings.json');
      const sharedCommandsPath = path.join(ccsDir(), 'shared', 'commands');
      const sharedSettingsPath = path.join(ccsDir(), 'shared', 'settings.json');
      const logSpy = spyOn(console, 'log').mockImplementation(() => {});

      fs.mkdirSync(externalCommandsDir, { recursive: true });
      fs.mkdirSync(path.dirname(externalSettingsPath), { recursive: true });
      fs.mkdirSync(claudeDir(), { recursive: true });
      fs.mkdirSync(path.join(ccsDir(), 'shared'), { recursive: true });
      fs.writeFileSync(externalSettingsPath, JSON.stringify({ theme: 'dark' }), 'utf8');
      fs.symlinkSync(externalCommandsDir, claudeCommandsPath, 'dir');
      fs.symlinkSync(externalSettingsPath, claudeSettingsPath, 'file');
      fs.symlinkSync(claudeCommandsPath, sharedCommandsPath, 'dir');
      fs.symlinkSync(claudeSettingsPath, sharedSettingsPath, 'file');

      manager.ensureSharedDirectories();

      expect(
        logSpy.mock.calls.some(
          ([message]) =>
            String(message).includes('Skipping commands: circular symlink detected') ||
            String(message).includes('Skipping settings.json: circular symlink detected')
        )
      ).toBe(false);
      expect(fs.lstatSync(sharedCommandsPath).isSymbolicLink()).toBe(true);
      expect(
        path.resolve(path.dirname(sharedCommandsPath), fs.readlinkSync(sharedCommandsPath))
      ).toBe(claudeCommandsPath);
      expect(fs.lstatSync(sharedSettingsPath).isSymbolicLink()).toBe(true);
      expect(
        path.resolve(path.dirname(sharedSettingsPath), fs.readlinkSync(sharedSettingsPath))
      ).toBe(claudeSettingsPath);
    });

    it('still blocks real circular links back into ~/.ccs/shared', () => {
      const manager = new SharedManager();
      const claudeCommandsPath = path.join(claudeDir(), 'commands');
      const sharedCommandsPath = path.join(ccsDir(), 'shared', 'commands');
      const logSpy = spyOn(console, 'log').mockImplementation(() => {});

      fs.mkdirSync(claudeDir(), { recursive: true });
      fs.mkdirSync(sharedCommandsPath, { recursive: true });
      fs.symlinkSync(sharedCommandsPath, claudeCommandsPath, 'dir');

      manager.ensureSharedDirectories();

      expect(
        logSpy.mock.calls.some(([message]) =>
          String(message).includes('Skipping commands: circular symlink detected')
        )
      ).toBe(true);
      expect(fs.lstatSync(sharedCommandsPath).isDirectory()).toBe(true);
    });

    it('does not materialize dangling external settings symlinks', () => {
      const manager = new SharedManager();
      const externalSettingsPath = path.join(
        tempRoot,
        'Documents',
        'claude-config',
        'settings.json'
      );
      const claudeSettingsPath = path.join(claudeDir(), 'settings.json');
      const sharedSettingsPath = path.join(ccsDir(), 'shared', 'settings.json');

      fs.mkdirSync(path.dirname(externalSettingsPath), { recursive: true });
      fs.mkdirSync(claudeDir(), { recursive: true });
      fs.symlinkSync(externalSettingsPath, claudeSettingsPath, 'file');

      manager.ensureSharedDirectories();

      expect(fs.lstatSync(claudeSettingsPath).isSymbolicLink()).toBe(true);
      expect(fs.existsSync(externalSettingsPath)).toBe(false);
      expect(fs.lstatSync(sharedSettingsPath).isSymbolicLink()).toBe(true);
      expect(
        path.resolve(path.dirname(sharedSettingsPath), fs.readlinkSync(sharedSettingsPath))
      ).toBe(claudeSettingsPath);
    });
  });

  describe('diverged settings adoption', () => {
    it('adopts a diverged shared settings.json into ~/.claude before re-linking', () => {
      const manager = new SharedManager();
      const claudeSettingsPath = path.join(claudeDir(), 'settings.json');
      const sharedSettingsPath = path.join(ccsDir(), 'shared', 'settings.json');

      fs.mkdirSync(claudeDir(), { recursive: true });
      fs.mkdirSync(path.join(ccsDir(), 'shared'), { recursive: true });
      writeJson(claudeSettingsPath, { enabledPlugins: { 'demo@market': false } });
      // Simulate Claude Code's atomic save (temp file + rename) replacing the
      // managed symlink with a regular file carrying the user's latest change.
      writeJson(sharedSettingsPath, { enabledPlugins: { 'demo@market': true } });
      setMtime(sharedSettingsPath, fs.statSync(claudeSettingsPath).mtimeMs + 2_000);

      manager.ensureSharedDirectories();

      expect(fs.lstatSync(sharedSettingsPath).isSymbolicLink()).toBe(true);
      expect(readJson(claudeSettingsPath)).toEqual({
        enabledPlugins: { 'demo@market': true },
      });
      expect(readJson(`${claudeSettingsPath}.bak-ccs-adopt`)).toEqual({
        enabledPlugins: { 'demo@market': false },
      });
    });

    it('adopts a diverged instance settings.json during instance linking', () => {
      const manager = new SharedManager();
      const instancePath = instanceDir('work');
      const claudeSettingsPath = path.join(claudeDir(), 'settings.json');
      const instanceSettingsPath = path.join(instancePath, 'settings.json');

      fs.mkdirSync(claudeDir(), { recursive: true });
      fs.mkdirSync(instancePath, { recursive: true });
      writeJson(claudeSettingsPath, { theme: 'light' });
      writeJson(instanceSettingsPath, { theme: 'dark' });
      setMtime(instanceSettingsPath, fs.statSync(claudeSettingsPath).mtimeMs + 2_000);

      manager.linkSharedDirectories(instancePath);

      expect(fs.lstatSync(instanceSettingsPath).isSymbolicLink()).toBe(true);
      expect(readJson(claudeSettingsPath)).toEqual({ theme: 'dark' });
    });

    it('adopts a diverged instance plugin registry during instance linking', () => {
      const manager = new SharedManager();
      const instancePath = instanceDir('work');
      const claudeRegistryPath = path.join(claudeDir(), 'plugins', 'installed_plugins.json');
      const instanceRegistryPath = path.join(instancePath, 'plugins', 'installed_plugins.json');

      fs.mkdirSync(claudeDir(), { recursive: true });
      fs.mkdirSync(path.join(instancePath, 'plugins'), { recursive: true });
      writeJson(claudeRegistryPath, { version: 2, plugins: {} });
      // Simulate Claude Code's atomic save replacing the managed symlink with
      // a regular file that records a plugin installed inside a session.
      writeJson(instanceRegistryPath, {
        version: 2,
        plugins: { 'demo@demo-market': [{ scope: 'user', version: '1.0.0' }] },
      });
      setMtime(instanceRegistryPath, fs.statSync(claudeRegistryPath).mtimeMs + 2_000);

      manager.linkSharedDirectories(instancePath);

      expect(fs.lstatSync(instanceRegistryPath).isSymbolicLink()).toBe(true);
      const adopted = readJson(claudeRegistryPath) as { plugins: Record<string, unknown> };
      expect(Object.keys(adopted.plugins)).toContain('demo@demo-market');
    });

    it('does not create a backup when the diverged copy matches the canonical file', () => {
      const manager = new SharedManager();
      const claudeSettingsPath = path.join(claudeDir(), 'settings.json');
      const sharedSettingsPath = path.join(ccsDir(), 'shared', 'settings.json');

      fs.mkdirSync(claudeDir(), { recursive: true });
      fs.mkdirSync(path.join(ccsDir(), 'shared'), { recursive: true });
      writeJson(claudeSettingsPath, { theme: 'dark' });
      fs.copyFileSync(claudeSettingsPath, sharedSettingsPath);

      manager.ensureSharedDirectories();

      expect(fs.lstatSync(sharedSettingsPath).isSymbolicLink()).toBe(true);
      expect(readJson(claudeSettingsPath)).toEqual({ theme: 'dark' });
      expect(fs.existsSync(`${claudeSettingsPath}.bak-ccs-adopt`)).toBe(false);
    });

    it('preserves diverged bytes when canonical backup creation fails', () => {
      const manager = new SharedManager();
      const instancePath = instanceDir('work');
      const claudeSettingsPath = path.join(claudeDir(), 'settings.json');
      const instanceSettingsPath = path.join(instancePath, 'settings.json');

      fs.mkdirSync(claudeDir(), { recursive: true });
      fs.mkdirSync(instancePath, { recursive: true });
      writeJson(claudeSettingsPath, { theme: 'light' });
      writeJson(instanceSettingsPath, { theme: 'dark' });
      setMtime(instanceSettingsPath, fs.statSync(claudeSettingsPath).mtimeMs + 2_000);

      const originalLinkSync = fs.linkSync;
      const linkSpy = spyOn(fs, 'linkSync').mockImplementation(((
        existingPath: fs.PathLike,
        newPath: fs.PathLike
      ) => {
        if (String(newPath).includes('.bak-ccs-adopt')) {
          throw Object.assign(new Error('simulated backup failure'), { code: 'EIO' });
        }
        return originalLinkSync(existingPath, newPath);
      }) as typeof fs.linkSync);

      expect(() => manager.linkSharedDirectories(instancePath)).toThrow('simulated backup failure');
      linkSpy.mockRestore();

      expect(readJson(claudeSettingsPath)).toEqual({ theme: 'light' });
      expect(readJson(instanceSettingsPath)).toEqual({ theme: 'dark' });
    });

    it('does not let a stale Windows fallback roll back newer canonical settings', () => {
      const manager = new SharedManager();
      const instancePath = instanceDir('windows-copy');
      const claudeSettingsPath = path.join(claudeDir(), 'settings.json');
      const instanceSettingsPath = path.join(instancePath, 'settings.json');

      fs.mkdirSync(claudeDir(), { recursive: true });
      writeJson(claudeSettingsPath, { generation: 2 });
      manager.ensureSharedDirectories();
      fs.mkdirSync(instancePath, { recursive: true });
      writeJson(instanceSettingsPath, { generation: 1 });
      setMtime(instanceSettingsPath, fs.statSync(claudeSettingsPath).mtimeMs - 2_000);

      Object.defineProperty(process, 'platform', { value: 'win32' });
      spyOn(fs, 'symlinkSync').mockImplementation(() => {
        throw Object.assign(new Error('simulated symlink failure'), { code: 'EPERM' });
      });

      manager.linkSharedDirectories(instancePath);

      expect(readJson(claudeSettingsPath)).toEqual({ generation: 2 });
      expect(readJson(instanceSettingsPath)).toEqual({ generation: 2 });
      const recoveryName = findRecovery(instanceSettingsPath);
      expect(recoveryName).toBeDefined();
      expect(readJson(path.join(path.dirname(instanceSettingsPath), recoveryName!))).toEqual({
        generation: 1,
      });
    });

    it('preserves divergence when the canonical settings symlink is dangling', () => {
      const manager = new SharedManager();
      const instancePath = instanceDir('dangling');
      const claudeSettingsPath = path.join(claudeDir(), 'settings.json');
      const missingTarget = path.join(tempRoot, 'missing', 'settings.json');
      const instanceSettingsPath = path.join(instancePath, 'settings.json');

      fs.mkdirSync(claudeDir(), { recursive: true });
      fs.mkdirSync(instancePath, { recursive: true });
      fs.symlinkSync(missingTarget, claudeSettingsPath, 'file');
      writeJson(instanceSettingsPath, { preserved: true });

      expect(() => manager.linkSharedDirectories(instancePath)).toThrow();

      expect(fs.lstatSync(claudeSettingsPath).isSymbolicLink()).toBe(true);
      expect(fs.existsSync(missingTarget)).toBe(false);
      expect(readJson(instanceSettingsPath)).toEqual({ preserved: true });
    });

    it('preserves malformed managed JSON instead of poisoning canonical settings', () => {
      const manager = new SharedManager();
      const instancePath = instanceDir('malformed');
      const claudeSettingsPath = path.join(claudeDir(), 'settings.json');
      const instanceSettingsPath = path.join(instancePath, 'settings.json');

      fs.mkdirSync(claudeDir(), { recursive: true });
      fs.mkdirSync(instancePath, { recursive: true });
      writeJson(claudeSettingsPath, { valid: true });
      fs.writeFileSync(instanceSettingsPath, '{broken-json', 'utf8');
      setMtime(instanceSettingsPath, fs.statSync(claudeSettingsPath).mtimeMs + 2_000);

      manager.linkSharedDirectories(instancePath);

      expect(readJson(claudeSettingsPath)).toEqual({ valid: true });
      expect(fs.lstatSync(instanceSettingsPath).isSymbolicLink()).toBe(true);
      const recoveryName = findRecovery(instanceSettingsPath);
      expect(recoveryName).toBeDefined();
      expect(
        fs.readFileSync(path.join(path.dirname(instanceSettingsPath), recoveryName!), 'utf8')
      ).toBe('{broken-json');
    });

    it('aborts relinking when a writer replaces the path after it is claimed', () => {
      const manager = new SharedManager();
      const instancePath = instanceDir('concurrent');
      const claudeSettingsPath = path.join(claudeDir(), 'settings.json');
      const instanceSettingsPath = path.join(instancePath, 'settings.json');

      fs.mkdirSync(claudeDir(), { recursive: true });
      fs.mkdirSync(instancePath, { recursive: true });
      writeJson(claudeSettingsPath, { generation: 0 });
      writeJson(instanceSettingsPath, { generation: 1 });
      setMtime(instanceSettingsPath, fs.statSync(claudeSettingsPath).mtimeMs + 2_000);

      const originalRenameSync = fs.renameSync;
      const renameSpy = spyOn(fs, 'renameSync').mockImplementation(((
        oldPath: fs.PathLike,
        newPath: fs.PathLike
      ) => {
        originalRenameSync(oldPath, newPath);
        if (
          String(oldPath) === instanceSettingsPath &&
          String(newPath).includes('.ccs-adopt-claim-')
        ) {
          writeJson(instanceSettingsPath, { generation: 2 });
        }
      }) as typeof fs.renameSync);

      expect(() => manager.linkSharedDirectories(instancePath)).toThrow(
        'Concurrent replacement detected'
      );
      renameSpy.mockRestore();

      expect(readJson(instanceSettingsPath)).toEqual({ generation: 2 });
      expect(fs.lstatSync(instanceSettingsPath).isSymbolicLink()).toBe(false);
      expect(readJson(claudeSettingsPath)).toEqual({ generation: 0 });
      const recoveryName = findRecovery(instanceSettingsPath);
      expect(recoveryName).toBeDefined();
      expect(readJson(path.join(path.dirname(instanceSettingsPath), recoveryName!))).toEqual({
        generation: 1,
      });
    });

    /**
     * Replaces 'preserves a canonical write that lands during no-replace
     * publication', which locked in the outcome of the CCS-4 incident.
     *
     * The intent it encoded - never clobber a writer that got to the canonical
     * file first - is kept, but it is now enforced by the compare-and-swap
     * guard instead of by an EEXIST from a no-replace link. The difference
     * that matters: the canonical path is no longer emptied first, so only a
     * genuinely concurrent write can land here, and it is preserved without
     * costing the user the settings that were already there.
     */
    it('refuses to publish when the canonical file changes before publication', () => {
      const manager = new SharedManager();
      const instancePath = instanceDir('canonical-race');
      const canonicalPath = path.join(claudeDir(), 'settings.json');
      const divergedPath = path.join(instancePath, 'settings.json');
      fs.mkdirSync(claudeDir(), { recursive: true });
      fs.mkdirSync(instancePath, { recursive: true });
      writeJson(canonicalPath, { generation: 0 });
      writeJson(divergedPath, { generation: 1 });
      setMtime(divergedPath, fs.statSync(canonicalPath).mtimeMs + 2_000);

      // Land the competing write while the publication temp file is being
      // prepared, i.e. after the canonical bytes were read but before the
      // compare-and-swap guard re-checks the inode.
      const originalOpenSync = fs.openSync;
      const openSpy = spyOn(fs, 'openSync').mockImplementation(((
        openPath: fs.PathLike,
        flags: number | string,
        mode?: fs.Mode
      ) => {
        if (String(openPath).startsWith(`${canonicalPath}.ccs-write-`)) {
          writeJson(canonicalPath, { generation: 99 });
        }
        return originalOpenSync(openPath, flags, mode);
      }) as typeof fs.openSync);

      expect(() => manager.linkSharedDirectories(instancePath)).toThrow(
        'Canonical file changed during adoption'
      );
      openSpy.mockRestore();
      expect(readJson(canonicalPath)).toEqual({ generation: 99 });
      expect(readJson(divergedPath)).toEqual({ generation: 1 });
      expect(readJson(`${canonicalPath}.bak-ccs-adopt`)).toEqual({ generation: 0 });
      expect(readJson(`${divergedPath}.ccs-adopted-recovery`)).toEqual({ generation: 1 });
    });

    /**
     * Model a foreign writer that shares ownership of the canonical
     * settings.json: the instant the path is left without a file, it lands an
     * empty-settings placeholder there. Claude Code does exactly this on
     * startup, and a second concurrent `ccs` does the same through
     * shared-dir-linker.ts:127.
     *
     * The writer reacts to the path becoming empty rather than to one specific
     * call site, so it keeps modelling the race no matter which fs primitive
     * the adopter uses to move the canonical file out of the way.
     */
    function installForeignCanonicalWriter(
      canonicalPath: string,
      placeholder: string
    ): { placeholderWrites: () => number; restore: () => void } {
      let placeholderWrites = 0;
      const claimEmptyCanonicalPath = (): void => {
        if (fs.existsSync(canonicalPath)) return;
        fs.writeFileSync(canonicalPath, placeholder, 'utf8');
        placeholderWrites++;
      };

      const originalRenameSync = fs.renameSync;
      const renameSpy = spyOn(fs, 'renameSync').mockImplementation(((
        oldPath: fs.PathLike,
        newPath: fs.PathLike
      ) => {
        originalRenameSync(oldPath, newPath);
        claimEmptyCanonicalPath();
      }) as typeof fs.renameSync);

      const originalUnlinkSync = fs.unlinkSync;
      const unlinkSpy = spyOn(fs, 'unlinkSync').mockImplementation(((targetPath: fs.PathLike) => {
        originalUnlinkSync(targetPath);
        claimEmptyCanonicalPath();
      }) as typeof fs.unlinkSync);

      return {
        placeholderWrites: () => placeholderWrites,
        restore: () => {
          renameSpy.mockRestore();
          unlinkSpy.mockRestore();
        },
      };
    }

    /**
     * Reproduce the 2026-08-20 incident: adoption moves the canonical
     * settings.json aside, a foreign writer fills the empty path, and the user
     * ends up with neither the adopted nor the previous settings on the live
     * path.
     *
     * The opposite outcome used to be pinned by 'preserves a canonical write
     * that lands during no-replace publication'; that test was rewritten as
     * 'refuses to publish when the canonical file changes before publication'
     * once publication stopped emptying the canonical path.
     */
    const foreignWriterCases: ReadonlyArray<{ writer: string; placeholder: string }> = [
      // Claude Code starts, finds no settings file and writes empty settings.
      { writer: 'Claude Code', placeholder: '{}\n' },
      // A second concurrent `ccs` provisions the same placeholder without the
      // trailing newline (shared-dir-linker.ts:127).
      { writer: 'a concurrent ccs run', placeholder: JSON.stringify({}, null, 2) },
    ];

    for (const { writer, placeholder } of foreignWriterCases) {
      it(`keeps live settings when ${writer} fills the canonical path during adoption`, () => {
        const manager = new SharedManager();
        const canonicalPath = path.join(claudeDir(), 'settings.json');
        const sharedSettingsPath = path.join(ccsDir(), 'shared', 'settings.json');
        const previousSettings = {
          model: 'opus',
          permissions: { allow: ['Bash(git status:*)'] },
        };
        const divergedSettings = {
          model: 'opus',
          permissions: { allow: ['Bash(git status:*)', 'Bash(git diff:*)'] },
        };

        fs.mkdirSync(claudeDir(), { recursive: true });
        fs.mkdirSync(path.join(ccsDir(), 'shared'), { recursive: true });
        writeJson(canonicalPath, previousSettings);
        writeJson(sharedSettingsPath, divergedSettings);
        setMtime(sharedSettingsPath, fs.statSync(canonicalPath).mtimeMs + 2_000);

        const foreignWriter = installForeignCanonicalWriter(canonicalPath, placeholder);
        try {
          manager.ensureSharedDirectories();
        } catch {
          // Losing the race may abort reconciliation; the user's live settings
          // must survive either way.
        } finally {
          foreignWriter.restore();
        }

        expect(fs.existsSync(canonicalPath)).toBe(true);
        expect(fs.readFileSync(canonicalPath, 'utf8')).not.toBe(placeholder);
        expect([divergedSettings, previousSettings]).toContainEqual(readJson(canonicalPath));
      });
    }

    it('keeps adopted bytes recoverable when canonical changes after verification', () => {
      const manager = new SharedManager();
      const instancePath = instanceDir('late-canonical-writer');
      const canonicalPath = path.join(claudeDir(), 'settings.json');
      const divergedPath = path.join(instancePath, 'settings.json');
      fs.mkdirSync(claudeDir(), { recursive: true });
      fs.mkdirSync(instancePath, { recursive: true });
      writeJson(canonicalPath, { generation: 0 });
      writeJson(divergedPath, { generation: 1 });
      setMtime(divergedPath, fs.statSync(canonicalPath).mtimeMs + 2_000);

      // The diverged claim is dropped only after publication was verified, so
      // a write injected there lands strictly after adoption completed.
      const originalUnlinkSync = fs.unlinkSync;
      let injected = false;
      const unlinkSpy = spyOn(fs, 'unlinkSync').mockImplementation(((targetPath: fs.PathLike) => {
        if (!injected && String(targetPath).includes('.ccs-adopt-claim-')) {
          injected = true;
          writeJson(canonicalPath, { generation: 99 });
        }
        return originalUnlinkSync(targetPath);
      }) as typeof fs.unlinkSync);

      manager.linkSharedDirectories(instancePath);
      unlinkSpy.mockRestore();
      expect(injected).toBe(true);
      expect(readJson(canonicalPath)).toEqual({ generation: 99 });
      expect(readJson(`${divergedPath}.ccs-adopted-recovery`)).toEqual({ generation: 1 });
    });

    it('fails reconciliation when the managed source reappears during late cleanup', () => {
      const manager = new SharedManager();
      const instancePath = instanceDir('late-source-writer');
      const canonicalPath = path.join(claudeDir(), 'settings.json');
      const divergedPath = path.join(instancePath, 'settings.json');
      fs.mkdirSync(claudeDir(), { recursive: true });
      fs.mkdirSync(instancePath, { recursive: true });
      writeJson(canonicalPath, { generation: 0 });
      writeJson(divergedPath, { generation: 1 });
      setMtime(divergedPath, fs.statSync(canonicalPath).mtimeMs + 2_000);

      // Recreate the managed source right after the canonical file was
      // replaced, while the adopter is still cleaning up.
      const originalRenameSync = fs.renameSync;
      let injected = false;
      const renameSpy = spyOn(fs, 'renameSync').mockImplementation(((
        oldPath: fs.PathLike,
        newPath: fs.PathLike
      ) => {
        originalRenameSync(oldPath, newPath);
        if (
          !injected &&
          String(newPath) === canonicalPath &&
          String(oldPath).startsWith(`${canonicalPath}.ccs-write-`)
        ) {
          injected = true;
          writeJson(divergedPath, { generation: 2 });
        }
      }) as typeof fs.renameSync);

      expect(() => manager.linkSharedDirectories(instancePath)).toThrow(
        'Concurrent replacement detected'
      );
      renameSpy.mockRestore();
      expect(injected).toBe(true);
      expect(readJson(divergedPath)).toEqual({ generation: 2 });
    });

    it('retries backup publication without replacing a concurrent backup', () => {
      const manager = new SharedManager();
      const instancePath = instanceDir('backup-race');
      const canonicalPath = path.join(claudeDir(), 'settings.json');
      const divergedPath = path.join(instancePath, 'settings.json');
      fs.mkdirSync(claudeDir(), { recursive: true });
      fs.mkdirSync(instancePath, { recursive: true });
      writeJson(canonicalPath, { generation: 0 });
      writeJson(divergedPath, { generation: 1 });
      setMtime(divergedPath, fs.statSync(canonicalPath).mtimeMs + 2_000);

      const backupPath = `${canonicalPath}.bak-ccs-adopt`;
      const originalLinkSync = fs.linkSync;
      let injected = false;
      const linkSpy = spyOn(fs, 'linkSync').mockImplementation(((
        existingPath: fs.PathLike,
        newPath: fs.PathLike
      ) => {
        if (!injected && String(newPath) === backupPath) {
          injected = true;
          writeJson(backupPath, { competing: true });
        }
        return originalLinkSync(existingPath, newPath);
      }) as typeof fs.linkSync);

      manager.linkSharedDirectories(instancePath);
      linkSpy.mockRestore();
      expect(readJson(backupPath)).toEqual({ competing: true });
      expect(readJson(`${backupPath}-1`)).toEqual({ generation: 0 });
      expect(readJson(canonicalPath)).toEqual({ generation: 1 });
    });

    it('preserves regular and symlink-target modes under a restrictive umask', () => {
      const manager = new SharedManager();
      const canonicalPath = path.join(claudeDir(), 'settings.json');
      const regularInstance = instanceDir('regular-mode');
      fs.mkdirSync(claudeDir(), { recursive: true });
      fs.mkdirSync(regularInstance, { recursive: true });
      writeJson(canonicalPath, { generation: 0 });
      fs.chmodSync(canonicalPath, 0o640);
      const regularDiverged = path.join(regularInstance, 'settings.json');
      writeJson(regularDiverged, { generation: 1 });
      setMtime(regularDiverged, fs.statSync(canonicalPath).mtimeMs + 2_000);

      const previousUmask = process.umask(0o077);
      try {
        manager.linkSharedDirectories(regularInstance);
        expect(fs.statSync(canonicalPath).mode & 0o777).toBe(0o640);

        const targetPath = path.join(tempRoot, 'external-settings.json');
        fs.renameSync(canonicalPath, targetPath);
        fs.symlinkSync(targetPath, canonicalPath, 'file');
        fs.chmodSync(targetPath, 0o664);
        const symlinkInstance = instanceDir('symlink-mode');
        fs.mkdirSync(symlinkInstance, { recursive: true });
        const symlinkDiverged = path.join(symlinkInstance, 'settings.json');
        writeJson(symlinkDiverged, { generation: 2 });
        setMtime(symlinkDiverged, fs.statSync(targetPath).mtimeMs + 2_000);
        manager.linkSharedDirectories(symlinkInstance);
        expect(fs.statSync(targetPath).mode & 0o777).toBe(0o664);
        expect(fs.lstatSync(canonicalPath).isSymbolicLink()).toBe(true);
      } finally {
        process.umask(previousUmask);
      }
    });

    it('publishes with the mode the canonical inode carries at publication time', () => {
      const manager = new SharedManager();
      const instancePath = instanceDir('concurrent-mode');
      const canonicalPath = path.join(claudeDir(), 'settings.json');
      const divergedPath = path.join(instancePath, 'settings.json');
      fs.mkdirSync(claudeDir(), { recursive: true });
      fs.mkdirSync(instancePath, { recursive: true });
      writeJson(canonicalPath, { generation: 0 });
      fs.chmodSync(canonicalPath, 0o640);
      writeJson(divergedPath, { generation: 1 });
      setMtime(divergedPath, fs.statSync(canonicalPath).mtimeMs + 2_000);

      // A chmod between reading the canonical file and publishing it leaves
      // the content untouched, so publication proceeds with the newer mode.
      const originalOpenSync = fs.openSync;
      const openSpy = spyOn(fs, 'openSync').mockImplementation(((
        openPath: fs.PathLike,
        flags: number | string,
        mode?: fs.Mode
      ) => {
        if (String(openPath).startsWith(`${canonicalPath}.ccs-write-`)) {
          fs.chmodSync(canonicalPath, 0o664);
        }
        return originalOpenSync(openPath, flags, mode);
      }) as typeof fs.openSync);

      manager.linkSharedDirectories(instancePath);
      openSpy.mockRestore();
      expect(fs.statSync(canonicalPath).mode & 0o777).toBe(0o664);
      expect(readJson(canonicalPath)).toEqual({ generation: 1 });
    });

    it('recovers an interrupted canonical claim before provisioning defaults', () => {
      const manager = new SharedManager();
      const canonicalPath = path.join(claudeDir(), 'settings.json');
      const claimPath = `${canonicalPath}.ccs-canonical-claim-interrupted`;
      fs.mkdirSync(claudeDir(), { recursive: true });
      writeJson(canonicalPath, { preserved: true });
      fs.renameSync(canonicalPath, claimPath);

      manager.ensureSharedDirectories();

      expect(readJson(canonicalPath)).toEqual({ preserved: true });
      expect(fs.existsSync(claimPath)).toBe(false);
    });

    it('quarantines a leftover plugin canonical claim without replacing a live symlink target', () => {
      const manager = new SharedManager();
      const canonicalPath = path.join(claudeDir(), 'plugins', 'installed_plugins.json');
      const intermediatePath = path.join(tempRoot, 'external', 'registry-link.json');
      const targetPath = path.join(tempRoot, 'external', 'installed_plugins.json');
      const claimPath = `${targetPath}.ccs-canonical-claim-interrupted`;
      fs.mkdirSync(path.dirname(canonicalPath), { recursive: true });
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      writeJson(targetPath, { version: 2, plugins: { live: [] } });
      writeJson(claimPath, { version: 2, plugins: { preserved: [] } });
      fs.symlinkSync(targetPath, intermediatePath, 'file');
      fs.symlinkSync(intermediatePath, canonicalPath, 'file');

      manager.ensureSharedDirectories();

      expect(fs.lstatSync(canonicalPath).isSymbolicLink()).toBe(true);
      expect(fs.lstatSync(intermediatePath).isSymbolicLink()).toBe(true);
      expect(readJson(targetPath)).toEqual({ version: 2, plugins: { live: [] } });
      expect(readJson(`${targetPath}.ccs-canonical-recovery`)).toEqual({
        version: 2,
        plugins: { preserved: [] },
      });
      expect(fs.existsSync(claimPath)).toBe(false);
    });

    it('recovers a claimed plugin registry through a multi-hop dangling symlink chain', () => {
      const manager = new SharedManager();
      const canonicalPath = path.join(claudeDir(), 'plugins', 'installed_plugins.json');
      const intermediatePath = path.join(tempRoot, 'external', 'registry-link.json');
      const targetPath = path.join(tempRoot, 'external', 'missing', 'installed_plugins.json');
      const claimPath = `${targetPath}.ccs-canonical-claim-interrupted`;
      fs.mkdirSync(path.dirname(canonicalPath), { recursive: true });
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      writeJson(claimPath, { version: 2, plugins: { recovered: [] } });
      fs.symlinkSync(targetPath, intermediatePath, 'file');
      fs.symlinkSync(intermediatePath, canonicalPath, 'file');

      manager.ensureSharedDirectories();

      expect(readJson(targetPath)).toEqual({ version: 2, plugins: { recovered: [] } });
      expect(fs.lstatSync(canonicalPath).isSymbolicLink()).toBe(true);
      expect(fs.lstatSync(intermediatePath).isSymbolicLink()).toBe(true);
      expect(fs.existsSync(claimPath)).toBe(false);
    });
  });

  describe('marketplace registry ownership', () => {
    it('skips unstatable shared plugin entries during instance linking', () => {
      const manager = new SharedManager();
      const instancePath = instanceDir('work');
      const sharedPluginsPath = path.join(claudeDir(), 'plugins');
      const logSpy = spyOn(console, 'log').mockImplementation(() => {});

      fs.mkdirSync(instancePath, { recursive: true });
      fs.mkdirSync(sharedPluginsPath, { recursive: true });
      fs.symlinkSync(
        path.join(sharedPluginsPath, 'missing-plugin'),
        path.join(sharedPluginsPath, 'broken-plugin'),
        'dir'
      );

      expect(() => manager.linkSharedDirectories(instancePath)).not.toThrow();
      expect(fs.existsSync(path.join(instancePath, 'plugins', 'broken-plugin'))).toBe(false);
      expect(
        logSpy.mock.calls.some(([message]) =>
          String(message).includes(
            'Skipping plugins/broken-plugin: unable to inspect shared plugin entry'
          )
        )
      ).toBe(true);
    });

    it('writes global and instance registries with different authoritative install locations', () => {
      const globalRegistryPath = path.join(claudeDir(), 'plugins', 'known_marketplaces.json');
      ensureMarketplacePayload(claudeDir());
      writeJson(globalRegistryPath, {
        'claude-code-plugins': {
          installLocation: path.join(
            tempRoot,
            '.ccs',
            'instances',
            'work',
            'plugins',
            'marketplaces',
            'claude-code-plugins'
          ),
        },
      });

      const instancePath = instanceDir('personal');
      fs.mkdirSync(instancePath, { recursive: true });

      const manager = new SharedManager();
      manager.linkSharedDirectories(instancePath);

      const instanceRegistryPath = path.join(instancePath, 'plugins', 'known_marketplaces.json');
      expect(readMarketplaceLocation(globalRegistryPath)).toBe(marketplacePath(claudeDir()));
      expect(readMarketplaceLocation(instanceRegistryPath)).toBe(marketplacePath(instancePath));
      expect(fs.lstatSync(path.join(instancePath, 'plugins')).isSymbolicLink()).toBe(false);
      expect(fs.lstatSync(instanceRegistryPath).isSymbolicLink()).toBe(false);
    });

    it('self-heals missing installLocation from discovered marketplace payloads', () => {
      const manager = new SharedManager();
      const instancePath = instanceDir('work');
      fs.mkdirSync(instancePath, { recursive: true });
      manager.linkSharedDirectories(instancePath);

      fs.mkdirSync(marketplacePath(claudeDir()), { recursive: true });
      writeJson(path.join(instancePath, 'plugins', 'known_marketplaces.json'), {
        'claude-code-plugins': {
          label: 'Official marketplace',
        },
      });

      manager.normalizeMarketplaceRegistryPaths(instancePath);

      const repaired = readJson(
        path.join(instancePath, 'plugins', 'known_marketplaces.json')
      ) as Record<string, { label?: string; installLocation?: string }>;
      expect(repaired['claude-code-plugins']).toEqual({
        label: 'Official marketplace',
        installLocation: marketplacePath(instancePath),
      });
    });

    it('prunes stale marketplace entries whose payload directories no longer exist', () => {
      const manager = new SharedManager();
      const instancePath = instanceDir('work');
      fs.mkdirSync(instancePath, { recursive: true });
      manager.linkSharedDirectories(instancePath);

      fs.mkdirSync(marketplacePath(claudeDir(), 'claude-code-plugins'), { recursive: true });
      writeJson(path.join(instancePath, 'plugins', 'known_marketplaces.json'), {
        'claude-code-plugins': {
          installLocation: marketplacePath(instancePath, 'claude-code-plugins'),
          label: 'Official marketplace',
        },
        stale: {
          installLocation: marketplacePath(instancePath, 'stale'),
          label: 'Stale marketplace',
        },
      });

      manager.normalizeMarketplaceRegistryPaths(instancePath);

      const reconciled = readJson(
        path.join(instancePath, 'plugins', 'known_marketplaces.json')
      ) as Record<string, { label?: string; installLocation?: string }>;
      expect(reconciled['claude-code-plugins']).toEqual({
        installLocation: marketplacePath(instancePath, 'claude-code-plugins'),
        label: 'Official marketplace',
      });
      expect(reconciled.stale).toBeUndefined();
    });

    it('does not register transient marketplace directories left behind by interrupted auto-updates', () => {
      // Regression: CCS used to write bare { installLocation } entries for marketplace
      // directories with no registry record. Claude Code requires source + lastUpdated,
      // so those entries corrupted known_marketplaces.json and broke /plugin.
      const manager = new SharedManager();
      const instancePath = instanceDir('work');
      fs.mkdirSync(instancePath, { recursive: true });
      manager.linkSharedDirectories(instancePath);

      // Simulate Claude Code leaving rename-dance temp dirs behind in both the
      // global claude dir and the instance dir (discoverMarketplaceEntries scans
      // each independently).
      for (const suffix of ['.staging', '.bak']) {
        fs.mkdirSync(marketplacePath(claudeDir(), `claude-plugins-official${suffix}`), {
          recursive: true,
        });
        fs.mkdirSync(marketplacePath(instancePath, `claude-plugins-official${suffix}`), {
          recursive: true,
        });
      }

      manager.normalizeMarketplaceRegistryPaths(instancePath);

      const globalRegistryPath = path.join(claudeDir(), 'plugins', 'known_marketplaces.json');
      const global = readJson(globalRegistryPath) as Record<string, unknown>;
      expect(global['claude-plugins-official.staging']).toBeUndefined();
      expect(global['claude-plugins-official.bak']).toBeUndefined();

      const instanceRegistryPath = path.join(instancePath, 'plugins', 'known_marketplaces.json');
      const instance = readJson(instanceRegistryPath) as Record<string, unknown>;
      expect(instance['claude-plugins-official.staging']).toBeUndefined();
      expect(instance['claude-plugins-official.bak']).toBeUndefined();
    });

    it('removes registry entries whose physical marketplace directory no longer exists', () => {
      // Regression guard: buildMarketplaceRegistryContent merges JSON sources then
      // cross-checks against discoveredEntries. Any name in the merged registry that
      // has no matching directory on disk must be pruned so stale entries don't
      // accumulate across marketplace uninstalls or renames.
      const manager = new SharedManager();
      const instancePath = instanceDir('work');
      fs.mkdirSync(instancePath, { recursive: true });
      manager.linkSharedDirectories(instancePath);

      // Write a registry entry for a marketplace that has no physical directory.
      const globalRegistryPath = path.join(claudeDir(), 'plugins', 'known_marketplaces.json');
      writeJson(globalRegistryPath, {
        'vanished-marketplace': {
          source: { type: 'github', repo: 'example/vanished' },
          lastUpdated: '2024-01-01T00:00:00.000Z',
          installLocation: marketplacePath(claudeDir(), 'vanished-marketplace'),
        },
      });
      // Intentionally do NOT create the physical directory — simulate an uninstalled
      // marketplace whose registry entry was not cleaned up.

      manager.normalizeMarketplaceRegistryPaths(instancePath);

      const global = readJson(globalRegistryPath) as Record<string, unknown>;
      expect(global['vanished-marketplace']).toBeUndefined();

      const instanceRegistryPath = path.join(instancePath, 'plugins', 'known_marketplaces.json');
      const instance = readJson(instanceRegistryPath) as Record<string, unknown>;
      expect(instance['vanished-marketplace']).toBeUndefined();
    });

    it('drops malformed marketplace entries even when the payload directory still exists', () => {
      const manager = new SharedManager();
      const instancePath = instanceDir('work');
      fs.mkdirSync(instancePath, { recursive: true });
      manager.linkSharedDirectories(instancePath);

      fs.mkdirSync(marketplacePath(claudeDir(), 'claude-code-plugins'), { recursive: true });

      const globalRegistryPath = path.join(claudeDir(), 'plugins', 'known_marketplaces.json');
      writeJson(globalRegistryPath, {
        'claude-code-plugins': 'bad-entry',
      });

      manager.normalizeMarketplaceRegistryPaths(instancePath);

      const global = readJson(globalRegistryPath) as Record<string, unknown>;
      expect(global['claude-code-plugins']).toBeUndefined();

      const instanceRegistryPath = path.join(instancePath, 'plugins', 'known_marketplaces.json');
      const instance = readJson(instanceRegistryPath) as Record<string, unknown>;
      expect(instance['claude-code-plugins']).toBeUndefined();
    });

    it('warns and skips malformed marketplace registries while keeping valid sources', () => {
      const manager = new SharedManager();
      const instancePath = instanceDir('work');
      fs.mkdirSync(instancePath, { recursive: true });
      manager.linkSharedDirectories(instancePath);

      const globalRegistryPath = path.join(claudeDir(), 'plugins', 'known_marketplaces.json');
      ensureMarketplacePayload(claudeDir());
      writeJson(globalRegistryPath, {
        'claude-code-plugins': {
          installLocation: path.join(
            tempRoot,
            '.ccs',
            'instances',
            'work',
            'plugins',
            'marketplaces',
            'claude-code-plugins'
          ),
          label: 'Official marketplace',
        },
      });

      const malformedRegistryPath = path.join(instancePath, 'plugins', 'known_marketplaces.json');
      fs.writeFileSync(malformedRegistryPath, '{invalid-json', 'utf8');
      const logSpy = spyOn(console, 'log').mockImplementation(() => {});

      manager.normalizeMarketplaceRegistryPaths(instancePath);

      expect(readMarketplaceLocation(malformedRegistryPath)).toBe(marketplacePath(instancePath));
      expect(
        logSpy.mock.calls.some(
          ([message]) =>
            String(message).includes('Skipping malformed marketplace registry') &&
            String(message).includes(malformedRegistryPath)
        )
      ).toBe(true);
    });

    it('keeps the instance-local registry valid under Windows copy fallback', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      spyOn(fs, 'symlinkSync').mockImplementation(() => {
        throw Object.assign(new Error('simulated symlink failure'), { code: 'EPERM' });
      });

      const globalRegistryPath = path.join(claudeDir(), 'plugins', 'known_marketplaces.json');
      ensureMarketplacePayload(claudeDir());
      writeJson(globalRegistryPath, {
        'claude-code-plugins': {
          installLocation: path.join(
            tempRoot,
            '.claude',
            'plugins',
            'marketplaces',
            'claude-code-plugins'
          ),
        },
      });

      const instancePath = instanceDir('personal');
      fs.mkdirSync(instancePath, { recursive: true });

      const manager = new SharedManager();
      manager.linkSharedDirectories(instancePath);

      const instanceRegistryPath = path.join(instancePath, 'plugins', 'known_marketplaces.json');
      expect(readMarketplaceLocation(globalRegistryPath)).toBe(marketplacePath(claudeDir()));
      expect(readMarketplaceLocation(instanceRegistryPath)).toBe(marketplacePath(instancePath));
      expect(fs.existsSync(path.join(instancePath, 'plugins', 'marketplaces'))).toBe(true);
    });
  });
});
